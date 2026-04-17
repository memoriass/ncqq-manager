"""
NapCat WS 连接注册表服务

职责：
  - 接收来自 ws_router /ws/napcat/{name} 的 NapCat 反向 WS 连接
  - 维护 {name: {uin, connected, last_seen, nickname, hb_online}} 连接表
  - 提供给 container_state 用于主路径登录判定（BS 修正后的心跳可信赖）
  - BS 辅助检测：当 WS 未连接时调用 BS /api/accounts 做兜底
  - NapCatApiProxy：复用反向 WS 连接主动发 OneBot API 调用
  - active_health_check：通过 WS 代理调用 get_login_info 验证 QQ 登录

数据流（★ 大修）：
  BS 代理层 → 修正心跳 status.online → WS 转发到 Manager
  → napcat_ws_service 记录 hb_online → container_state 状态引擎读取
  → 状态引擎作为唯一写入源更新 inst.update_login()
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
# BS 辅助检测缓存 TTL（秒）
_BS_CACHE_TTL = 10
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
        "last_hb_ts",
        "hb_online",
        "last_seen",
        "ws_ref",
    )

    def __init__(self, uin: str = "", nickname: str = ""):
        self.uin: str = uin
        self.nickname: str = nickname
        self.connected: bool = False
        self.connect_ts: float = 0.0
        self.disconnect_ts: float = 0.0
        self.last_hb_ts: float = 0.0
        self.hb_online: Optional[bool] = None
        self.last_seen: float = 0.0  # 最后一次在线时间戳（connect_ts 或 disconnect_ts）
        self.ws_ref: Optional["WebSocket"] = (
            None  # 绑定的 WS 实例，防止并发连接状态覆盖
        )

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
        # BS 辅助检测缓存：{uin: (ts, online)}
        self._bs_cache: Dict[str, tuple] = {}
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

        # ★ 修复 1：新连接建立时，清理旧连接残留的心跳状态
        e.hb_online = None
        e.last_hb_ts = 0.0

        e.ws_ref = ws  # 绑定 WS 实例
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
        """来自 WS 心跳事件。

        当状态从 online→offline 变化时，主动唤醒状态引擎立即刷新，
        避免等待下一个轮询周期（最长 30s）才发现掉线。
        """
        e = self._table.get(name)
        if e:
            prev_online = e.hb_online
            e.last_hb_ts = time.time()
            e.hb_online = online
            # 状态翻转（在线→离线 或 离线→在线）时唤醒状态引擎
            if prev_online is not None and prev_online != online:
                logger.info(
                    "NapCat 心跳状态变化: name=%s %s→%s，唤醒状态引擎",
                    name, "online" if prev_online else "offline",
                    "online" if online else "offline",
                )
                self._wake_state_engine()

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

    def get_login_result(self, name: str) -> Dict:
        """主路径：从 WS 注册表返回登录状态（BS 修正后的心跳可信赖）。

        ★ 大修：简化分支逻辑，信任 BS 修正后的 heartbeat.status.online 字段。
        BS 代理层每 60s 调用 get_login_info 确认 QQ 登录状态，并覆写心跳
        status.online 为实际 QQ 登录态。因此 hb_online 字段是可靠的。

        分支树：
          WS 已死 → 清理残留，返回 offline
          hb_online=False → 离线（BS 确认 or 心跳直接上报）
          hb_online=True → 在线（BS 修正后可信）
          hb_online=None + 未超时 → 初始连接期，暂假定在线
          hb_online=None + 超时(>45s) → 安全网：可能 ghost WS，返回 offline
        """
        _HB_WAIT_TIMEOUT = 45  # 等待首次心跳的最长时间

        e = self._table.get(name)
        if not e or not e.uin:
            return {"logged_in": False, "stage": "waiting"}

        # WS 已彻底死亡（超出宽限期）→ 清理残留
        if not e.is_alive():
            e.uin = ""
            e.hb_online = None
            return {"logged_in": False, "stage": "waiting", "method": "sdk_ws", "reason": "ws_dead"}

        # 心跳明确离线（BS 修正后可信赖）
        if e.hb_online is False:
            return {
                "logged_in": False, "uin": e.uin, "stage": "waiting",
                "method": "sdk_ws", "reason": "heartbeat_offline",
            }

        # 心跳明确在线（BS 修正后可信赖）
        if e.hb_online is True:
            return {
                "logged_in": True, "uin": e.uin, "nickname": e.nickname,
                "stage": "logged_in", "method": "sdk_ws",
                "reason": "ws_connected" if e.connected else "ws_grace",
            }

        # hb_online=None — 尚未收到心跳（新连接初始阶段）
        ws_age = time.time() - e.connect_ts if e.connect_ts > 0 else 0
        if ws_age > _HB_WAIT_TIMEOUT:
            # 安全网：BS 保活可能维持了 NapCat 已断连的 ghost WS
            return {
                "logged_in": False, "uin": e.uin, "stage": "waiting",
                "method": "sdk_ws", "reason": "no_heartbeat",
            }

        # 初始连接期（<45s），暂假定在线等待心跳到达
        return {
            "logged_in": True, "uin": e.uin, "nickname": e.nickname,
            "stage": "logged_in", "method": "sdk_ws", "reason": "ws_initial",
        }

    def _resolve_known_uin(self, name: str) -> str:
        """解析实例可用 uin（WS注册表 → instance_subsystem）。"""
        e = self._table.get(name)
        if e and e.uin:
            return str(e.uin)

        # 兜底：容器状态引擎内存态
        try:
            from services.instance_subsystem import instance_subsystem

            inst = instance_subsystem.get(name)
            if inst and inst.uin:
                return str(inst.uin)
        except Exception:
            pass

        return ""

    # ------------------------------------------------------------------
    # BS 辅助检测（兜底，异步）
    # ------------------------------------------------------------------

    async def check_via_bs(self, name: str) -> Dict:
        """
        通过 BS /api/accounts/{uin}/online-status 做辅助检测。
        ★ account_id 必须是 QQ 号（uin），非容器名。
        优先从注册表取已知 uin；若 uin 未知则尝试 instance_subsystem/login_cache。
        结果带短 TTL 缓存，避免频繁请求 BS。
        返回格式与 check_login_status 兼容。
        """
        try:
            from services.botshepherd import botshepherd_manager

            if not botshepherd_manager.running:
                return {"logged_in": False, "stage": "waiting"}

            # 缓存命中
            cached = self._bs_cache.get(name)
            if cached and (time.time() - cached[0]) < _BS_CACHE_TTL:
                return cached[1]

            # ★ BS account_id = QQ号(uin)；优先使用可解析的已知 uin
            known_uin = self._resolve_known_uin(name)
            if not known_uin:
                logger.debug(
                    "BS 辅助检测跳过 [%s]: uin 未知（WS/实例缓存均缺失）", name
                )
                return {
                    "logged_in": False,
                    "stage": "waiting",
                    "method": "bs_api",
                    "reason": "uin_unknown",
                }

            result = await asyncio.wait_for(
                botshepherd_manager.get_account_online(known_uin), timeout=3.0
            )
            # _error 表示 BS 返回了非 200 响应（如 404/账号不存在）
            if not isinstance(result, dict) or result.get("_error"):
                logger.debug(
                    "BS 辅助检测无效响应 [%s] uin=%s: %s", name, known_uin, result
                )
                return {"logged_in": False, "stage": "waiting"}

            online = bool(result.get("online", False))
            uin = str(
                result.get("uin", "") or result.get("account_id", "") or known_uin
            )
            ret: Dict = {
                "logged_in": online,
                "stage": "logged_in" if online else "waiting",
                "method": "bs_api",
                "reason": "bs_account_online" if online else "bs_account_offline",
                "uin": uin,
            }

            # 写入缓存
            self._bs_cache[name] = (time.time(), ret)
            return ret
        except Exception as exc:
            logger.debug("BS 辅助检测异常 [%s]: %s", name, exc)
            return {"logged_in": False, "stage": "waiting"}

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

    # ------------------------------------------------------------------
    # WS 原生登录检测（通过已有 WS 连接调用 get_login_info）
    # ------------------------------------------------------------------

    async def check_login_via_ws(self, name: str) -> Dict:
        """通过反向 WS 连接主动调用 get_login_info，替代 HTTP 探测。

        适用场景：WS 已连接但 heartbeat 尚未确认登录状态（hb_online=None），
        或需要获取最新 uin/nickname。

        返回格式与 check_login_status 兼容。
        """
        proxy = self._proxies.get(name)
        if not proxy:
            return {"logged_in": False, "stage": "waiting"}
        try:
            data = await proxy.call_action("get_login_info", timeout=5.0)
            uid = str(data.get("user_id", ""))
            if uid and uid != "0":
                nickname = data.get("nickname", "")
                # 反写注册表
                self.ensure_uin(name, uid)
                e = self._table.get(name)
                if e and nickname:
                    e.nickname = nickname
                return {
                    "logged_in": True,
                    "uin": uid,
                    "nickname": nickname,
                    "method": "ws_api",
                    "stage": "logged_in",
                    "reason": "ws_get_login_info",
                }
        except Exception as exc:
            logger.debug("WS 登录检测失败 [%s]: %s", name, exc)
        return {"logged_in": False, "stage": "waiting"}

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

    async def active_health_check(self, name: str) -> Dict:
        """主动健康检测：通过 WS 代理调用 get_login_info 验证 QQ 登录状态。

        适用场景：WS 连接存在且心跳显示在线，但心跳长时间未更新，
        需要主动确认 Bot 是否仍然登录。

        ★ 重要：不依赖 get_status.online（该字段反映 NapCat 进程健康，
        不是 QQ 登录状态——QQ 掉线后 NapCat 照样报 online=True）。
        也不依赖 BS check_account_online_status（底层同样是 get_status，假阳性）。
        唯一可靠方式：get_login_info 返回空/0 uin = QQ 未登录。

        返回格式与 check_login_status 兼容。
        """
        proxy = self._proxies.get(name)
        if not proxy:
            return {"logged_in": False, "stage": "waiting", "reason": "no_proxy"}

        try:
            data = await proxy.call_action("get_login_info", timeout=5.0)
            uid = str(data.get("user_id", ""))
            nickname = data.get("nickname", "")
            if uid and uid != "0":
                # get_login_info 返回了有效 uin — 确认在线
                self.ensure_uin(name, uid)
                e = self._table.get(name)
                if e:
                    if nickname:
                        e.nickname = nickname
                    e.last_hb_ts = time.time()  # 刷新心跳时间戳

                logger.debug("主动健康检测 [%s]: get_login_info 确认在线 uin=%s", name, uid)
                return {
                    "logged_in": True,
                    "uin": uid,
                    "nickname": nickname,
                    "method": "ws_api",
                    "stage": "logged_in",
                    "reason": "active_get_login_info",
                }
            else:
                # get_login_info 返回空/0 → QQ 未登录
                logger.info("主动健康检测 [%s]: get_login_info 返回空uin，确认离线", name)
                e = self._table.get(name)
                if e:
                    e.hb_online = False
                self._wake_state_engine()
                return {
                    "logged_in": False,
                    "uin": e.uin if e else "",
                    "stage": "waiting",
                    "method": "ws_api",
                    "reason": "get_login_info_no_uin",
                }
        except Exception as exc:
            logger.debug("主动健康检测异常 [%s]: %s", name, exc)
            # WS 代理调用失败 → 连接可能已断开
            return {"logged_in": False, "stage": "waiting", "reason": "health_check_error"}

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

        # 清理 BS 辅助检测缓存
        self._bs_cache.pop(name, None)

        # 清理消息缓冲区
        self._msg_buffers.pop(name, None)


# 全局单例
napcat_ws_service = NapCatWsService()
