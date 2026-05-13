"""
NapCat WS 连接注册表服务

职责：
  - 接收来自 ws_router /ws/napcat/{name} 的 NapCat 反向 WS 连接
  - 维护 {name: {uin, connected, last_seen, nickname}} 连接表
  - NapCatApiProxy：复用反向 WS 连接主动发 OneBot API 调用
  - 消息监控缓冲区

登录状态由内联插件通过 /ws/plugin/{name} 推送，本服务不再参与登录检测。
"""

import asyncio
import collections
import time
import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from services.log import logger

if TYPE_CHECKING:
    from fastapi import WebSocket
    from services.ob11_events import MessageEvent

# 重连宽限期（秒）：WS 断开后保留在线态，等 NapCat 重连
_RECONNECT_GRACE = 15
# API 代理调用超时（秒）
_API_PROXY_TIMEOUT = 10.0
# 消息监控缓冲区大小（每容器）
_MESSAGE_BUFFER_SIZE = 200


# ---------------------------------------------------------------------------
# NapCatApiProxy — 复用反向 WS 连接，向 NapCat 主动发 OneBot API 调用
# ---------------------------------------------------------------------------


class NapCatApiProxy:
    """
    通过已建立的反向 WS 连接（FastAPI WebSocket）主动调用 NapCat OneBot API。

    工作原理：
      1. call_action 向 NapCat 发送 {"action":..., "params":..., "echo": uuid}
      2. NapCat 将响应 {"status":"ok", "data":..., "echo": uuid} 回写到同一连接
      3. ws_router 的接收循环识别到 echo 后调用 on_response，Future 得到结果

    线程安全：所有操作在同一事件循环内，无锁。
    """

    def __init__(self, ws: "WebSocket") -> None:
        self._ws = ws
        # echo → Future，等待 NapCat 响应
        self._pending: Dict[str, "asyncio.Future[Dict[str, Any]]"] = {}
        self._closed = False
        # 绑定的 WS 实例引用，用于注销时校验
        self._ws_ref = ws

    def on_response(self, echo: str, data: Dict[str, Any]) -> None:
        """ws_router 收到带 echo 的响应时回调，唤醒对应的 call_action 调用方。"""
        fut = self._pending.get(echo)
        if fut and not fut.done():
            fut.set_result(data)

    def close(self) -> None:
        """连接断开时取消所有挂起的 Future。"""
        self._closed = True
        for fut in self._pending.values():
            if not fut.done():
                fut.cancel()
        self._pending.clear()

    async def call_action(
        self,
        action: str,
        params: Optional[Dict[str, Any]] = None,
        timeout: float = _API_PROXY_TIMEOUT,
    ) -> Dict[str, Any]:
        """
        异步调用 OneBot API，返回响应的 data 字段。
        失败时抛出 RuntimeError。
        """
        if self._closed:
            raise RuntimeError("NapCatApiProxy 已关闭（WS 已断开）")
        echo = f"mgr-{uuid.uuid4().hex[:12]}"
        payload = {"action": action, "params": params or {}, "echo": echo}
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[Dict[str, Any]] = loop.create_future()
        self._pending[echo] = fut
        try:
            await asyncio.wait_for(self._ws.send_json(payload), timeout=5.0)
            resp = await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
            if resp.get("status") != "ok":
                raise RuntimeError(f"API 调用失败: action={action} resp={resp}")
            return resp.get("data") or {}
        except asyncio.TimeoutError:
            raise RuntimeError(f"API 调用超时: action={action} echo={echo}")
        finally:
            self._pending.pop(echo, None)

    async def send_message(
        self,
        msg_type: str,
        target_id: str,
        message: str,
    ) -> Optional[int]:
        """
        便捷发消息接口。
        msg_type: "private" | "group"
        target_id: QQ 号或群号（字符串）
        返回 message_id，失败返回 None。
        """
        action = "send_private_msg" if msg_type == "private" else "send_group_msg"
        id_key = "user_id" if msg_type == "private" else "group_id"
        try:
            data = await self.call_action(
                action, {id_key: target_id, "message": message}
            )
            return data.get("message_id")
        except Exception as exc:
            logger.warning(
                "NapCatApiProxy.send_message 失败: type=%s target=%s: %s",
                msg_type,
                target_id,
                exc,
            )
            return None


class _ConnEntry:
    __slots__ = (
        "uin",
        "nickname",
        "connected",
        "connect_ts",
        "disconnect_ts",
        "last_seen",
        "ws_ref",
    )

    def __init__(self, uin: str = "", nickname: str = ""):
        self.uin: str = uin
        self.nickname: str = nickname
        self.connected: bool = False
        self.connect_ts: float = 0.0
        self.disconnect_ts: float = 0.0
        self.last_seen: float = 0.0
        self.ws_ref: Optional["WebSocket"] = None

    def is_alive(self) -> bool:
        """WS 在线 OR 断开宽限期内"""
        if self.connected:
            return True
        if self.disconnect_ts > 0:
            return (time.time() - self.disconnect_ts) < _RECONNECT_GRACE
        return False


class NapCatWsService:
    """NapCat 反向 WS 连接注册表（单例）"""

    def __init__(self) -> None:
        self._table: Dict[str, _ConnEntry] = {}
        # API 代理注册表：{name: NapCatApiProxy}
        self._proxies: Dict[str, NapCatApiProxy] = {}
        # 消息监控缓冲区：{name: deque[dict]}
        self._msg_buffers: Dict[str, collections.deque] = {}

    # ------------------------------------------------------------------
    # 内部辅助
    # ------------------------------------------------------------------

    @staticmethod
    def _wake_state_engine() -> None:
        """唤醒容器状态引擎立即刷新（状态变化时调用）。"""
        try:
            from services.container_state import state_engine
            state_engine.notify_change()
        except Exception:
            pass

    # ------------------------------------------------------------------
    # 写入（由 ws_router 调用）
    # ------------------------------------------------------------------

    def on_connect(
        self, name: str, uin: str, nickname: str = "", ws: "WebSocket | None" = None
    ) -> None:
        """NapCat WS 连接建立"""
        e = self._table.setdefault(name, _ConnEntry())
        e.uin = uin
        e.nickname = nickname
        e.connected = True
        e.connect_ts = time.time()
        e.last_seen = e.connect_ts
        e.disconnect_ts = 0.0
        e.ws_ref = ws
        logger.info(
            "NapCat WS 连接注册: name=%s uin=%s nickname=%s", name, uin, nickname
        )

    def on_disconnect(self, name: str, ws: "WebSocket | None" = None) -> None:
        """NapCat WS 连接断开（保留宽限期）。

        修复：当同一 name 存在多个并发 WS 连接时（如 BS 探测连接 + 正常连接），
        只有绑定的 WS 实例断开才更新状态，防止探测连接断开覆盖正常连接状态。
        断开时唤醒状态引擎，触发即时检测。
        """
        e = self._table.get(name)
        if e:
            # ws_ref 校验：如果指定了 ws 且不匹配当前绑定实例，跳过（旧/探测连接断开）
            if ws is not None and e.ws_ref is not None and e.ws_ref is not ws:
                logger.debug("NapCat WS 断开跳过（非当前绑定实例）: name=%s", name)
                return
            e.connected = False
            e.disconnect_ts = time.time()
            e.last_seen = e.disconnect_ts
            e.ws_ref = None
            # WS 断开时唤醒状态引擎，触发即时检测（宽限期后状态可能降级）
            self._wake_state_engine()
        logger.info("NapCat WS 连接断开（宽限期保活）: name=%s", name)

    def ensure_uin(self, name: str, uin: str, ws: "WebSocket | None" = None) -> None:
        """事件中检测到真实 uin 时补全/更新注册表（幂等）。

        解决场景：WS 连接建立时 header X-Self-Id 为空/"0"（BS 探测），
        后续心跳/lifecycle 事件中首次携带真实 uin 时写入注册表，
        使 get_login_result 能正确返回 logged_in=True。
        """
        if not uin:
            return
        e = self._table.get(name)
        if not e:
            # 注册表中无条目（on_connect 因 header_sid=0 被跳过），补注册
            self.on_connect(name, uin, ws=ws)
            return

        # ★ 修复 4：如果 WS 已经不在存活期，不应再用旧号事件刷新 uin
        if not e.is_alive():
            return

        if not e.uin or e.uin != uin:
            old = e.uin
            e.uin = uin
            logger.info("WS 事件补全 uin: name=%s old=%s new=%s", name, old, uin)

    def on_heartbeat(self, name: str, online: bool) -> None:
        """OB11 心跳事件—更新 last_seen，并作为插件 WS 的降级路径维持 bot_online。"""
        e = self._table.get(name)
        if e:
            e.last_seen = time.time()
        # # [TEST] 降级逻辑已注释，测试插件 WS 独立工作能力
        # if online:
        #     from services.instance_subsystem import instance_subsystem
        #     inst = instance_subsystem.get(name)
        #     if inst:
        #         if not inst.bot_online:
        #             inst.bot_online = True
        #             inst.bot_heartbeat_ts = time.time()
        #             self._wake_state_engine()
        #         # 降级登录检测：有效心跳 + 注册表有 uin → 视为已登录
        #         if not inst.logged_in and e and e.uin and e.uin != "0":
        #             inst.update_login(
        #                 logged_in=True, uin=e.uin,
        #                 stage="logged_in", method="heartbeat_fallback",
        #                 reason="ob11_heartbeat_with_valid_uin",
        #             )
        #             self._wake_state_engine()
        #             logger.info("心跳降级登录: name=%s uin=%s", name, e.uin)

    def get_login_result(self, name: str) -> dict:
        """从 WS 注册表获取登录信息（供 qrcode 端点降级查询）。"""
        e = self._table.get(name)
        if e and e.connected and e.uin and e.uin != "0":
            return {"logged_in": True, "uin": e.uin}
        return {"logged_in": False}

    # ------------------------------------------------------------------
    # API 代理注册（由 ws_router 在连接建立/断开时调用）
    # ------------------------------------------------------------------

    def register_proxy(self, name: str, ws: "WebSocket") -> NapCatApiProxy:
        """注册 NapCatApiProxy（WS 建立后立即调用）。"""
        # 快速重连时关闭旧 proxy，防止泄漏 pending Futures
        old = self._proxies.pop(name, None)
        if old:
            old.close()
            logger.debug("NapCatApiProxy 替换旧实例: name=%s", name)
        proxy = NapCatApiProxy(ws)
        self._proxies[name] = proxy
        logger.debug("NapCatApiProxy 注册: name=%s", name)
        return proxy

    def unregister_proxy(self, name: str, ws: "WebSocket | None" = None) -> None:
        """注销并关闭 proxy（WS 断开时调用）。

        修复：当同一 name 存在多个并发 WS 连接时（如快速重连），
        只有绑定的 WS 实例断开才注销，防止旧连接断开删除新连接的 proxy。
        """
        proxy = self._proxies.get(name)
        if proxy:
            # ws_ref 校验：如果指定了 ws 且不匹配当前绑定实例，跳过（旧连接断开）
            if ws is not None and hasattr(proxy, "_ws_ref") and proxy._ws_ref is not ws:
                logger.debug("NapCatApiProxy 注销跳过（非当前绑定实例）: name=%s", name)
                return
            self._proxies.pop(name, None)
            proxy.close()
            logger.debug("NapCatApiProxy 注销: name=%s", name)

    def get_proxy(self, name: str) -> Optional[NapCatApiProxy]:
        """获取指定容器的 API 代理（未连接时返回 None）。"""
        return self._proxies.get(name)

    async def call_action(
        self,
        name: str,
        action: str,
        params: Optional[Dict[str, Any]] = None,
        timeout: float = _API_PROXY_TIMEOUT,
    ) -> Dict[str, Any]:
        """通过指定容器的反向 WS 连接调用 OneBot API。"""
        proxy = self._proxies.get(name)
        if not proxy:
            raise RuntimeError(f"Bot [{name}] 未连接，无法调用 API: {action}")
        return await proxy.call_action(action, params, timeout=timeout)

    async def send_message(
        self,
        name: str,
        msg_type: str,
        target_id: str,
        message: str,
    ) -> Optional[int]:
        """
        通过指定 Bot 发送消息（私聊/群聊）。
        name: 容器名（发送方 Bot）
        msg_type: "private" | "group"
        target_id: QQ 号或群号
        返回 message_id，失败返回 None。
        """
        proxy = self._proxies.get(name)
        if not proxy:
            logger.warning("send_message 失败: Bot [%s] 未连接", name)
            return None
        return await proxy.send_message(msg_type, target_id, message)

    # ------------------------------------------------------------------
    # 读取（供 container_state / docker_async 调用）
    # ------------------------------------------------------------------

    def is_connected(self, name: str) -> bool:
        e = self._table.get(name)
        return bool(e and e.is_alive())

    def get_uin(self, name: str) -> str:
        e = self._table.get(name)
        return e.uin if e else ""

    def get_entry(self, name: str) -> Optional[_ConnEntry]:
        return self._table.get(name)

    # ------------------------------------------------------------------
    # 消息监控缓冲区
    # ------------------------------------------------------------------

    def push_message(self, name: str, event: "MessageEvent") -> None:
        """将消息事件写入环形缓冲区（由 ws_router 在收到 message 事件时调用）。"""
        buf = self._msg_buffers.get(name)
        if buf is None:
            buf = collections.deque(maxlen=_MESSAGE_BUFFER_SIZE)
            self._msg_buffers[name] = buf
        buf.append({
            "time": event.time,
            "message_id": event.message_id,
            "message_type": event.message_type,
            "user_id": event.user_id,
            "sender": event.sender,
            "raw_message": event.raw_message,
            "group_id": getattr(event, "group_id", ""),
            "sub_type": getattr(event, "sub_type", ""),
        })

    def get_messages(self, name: str, limit: int = 50) -> List[Dict[str, Any]]:
        """获取指定容器最近 N 条消息（最新在前）。"""
        buf = self._msg_buffers.get(name)
        if not buf:
            return []
        items = list(buf)
        items.reverse()
        return items[:limit]

    def get_all_messages(self, limit: int = 50) -> Dict[str, List[Dict[str, Any]]]:
        """获取所有容器的最近消息（用于全局监控面板）。"""
        result: Dict[str, List[Dict[str, Any]]] = {}
        for name in self._msg_buffers:
            msgs = self.get_messages(name, limit)
            if msgs:
                result[name] = msgs
        return result

    def all_names(self) -> list:
        return list(self._table.keys())

    def get_entry_snapshot(self, name: str) -> Optional[Dict[str, Any]]:
        """公开接口：获取指定容器的连接条目快照（只读副本），供 router 层使用。

        返回 dict 或 None（未找到时）。
        """
        e = self._table.get(name)
        if e is None:
            return None
        return {
            "uin": e.uin,
            "nickname": e.nickname,
            "connected": e.is_alive(),
            "last_seen": e.last_seen,
        }

    def cleanup(self, name: str) -> None:
        """公开接口：清理指定容器的全部内部状态（注册表 + API 代理 + 消息缓冲）。

        用于容器删除/数据清理场景，避免外部直接操作私有属性。
        """
        # 清理连接注册表
        removed_entry = self._table.pop(name, None)
        if removed_entry:
            logger.info("已清理 WS 连接注册表: %s", name)

        # 清理 API 代理
        proxy = self._proxies.pop(name, None)
        if proxy:
            proxy.close()
            logger.info("已清理 API 代理: %s", name)

        # 清理消息缓冲区
        self._msg_buffers.pop(name, None)


# 全局单例
napcat_ws_service = NapCatWsService()
