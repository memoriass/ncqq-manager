"""
NapCat WS 连接注册表服务

职责：
  - 接收来自 ws_router /ws/napcat/{name} 的 NapCat 反向 WS 连接
  - 维护 {name: {uin, connected, last_seen, nickname}} 连接表
  - 提供给 container_state 用于替代 HTTP 轮询的主路径登录判定
  - BS 辅助检测：当 WS 未连接时调用 BS /api/accounts 做兜底
  - NapCatApiProxy：复用反向 WS 连接主动发 OneBot API 调用

连接优先级（主→兜底）：
  1. WS 直连在线（NapCat 已连入本端点）
  2. BS 账号 API 在线（BS 接管，WS 尚未重连）
  3. 无信号 → waiting
"""
import asyncio
import time
import uuid
from typing import TYPE_CHECKING, Any, Dict, Optional

from services.log import logger

if TYPE_CHECKING:
    from fastapi import WebSocket

# 重连宽限期（秒）：WS 断开后保留在线态，等 NapCat 重连
_RECONNECT_GRACE = 15
# BS 辅助检测缓存 TTL（秒）
_BS_CACHE_TTL = 10
# API 代理调用超时（秒）
_API_PROXY_TIMEOUT = 10.0


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
            data = await self.call_action(action, {id_key: target_id, "message": message})
            return data.get("message_id")
        except Exception as exc:
            logger.warning("NapCatApiProxy.send_message 失败: type=%s target=%s: %s",
                           msg_type, target_id, exc)
            return None


class _ConnEntry:
    __slots__ = ("uin", "nickname", "connected", "connect_ts", "disconnect_ts", "last_hb_ts", "hb_online")

    def __init__(self, uin: str = "", nickname: str = ""):
        self.uin: str = uin
        self.nickname: str = nickname
        self.connected: bool = False
        self.connect_ts: float = 0.0
        self.disconnect_ts: float = 0.0
        self.last_hb_ts: float = 0.0
        self.hb_online: Optional[bool] = None

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

    # ------------------------------------------------------------------
    # 写入（由 ws_router 调用）
    # ------------------------------------------------------------------

    def on_connect(self, name: str, uin: str, nickname: str = "") -> None:
        """NapCat WS 连接建立"""
        e = self._table.setdefault(name, _ConnEntry())
        e.uin = uin
        e.nickname = nickname
        e.connected = True
        e.connect_ts = time.time()
        e.disconnect_ts = 0.0
        logger.info("NapCat WS 连接注册: name=%s uin=%s nickname=%s", name, uin, nickname)

    def on_disconnect(self, name: str) -> None:
        """NapCat WS 连接断开（保留宽限期）"""
        e = self._table.get(name)
        if e:
            e.connected = False
            e.disconnect_ts = time.time()
        logger.info("NapCat WS 连接断开（宽限期保活）: name=%s", name)

    def ensure_uin(self, name: str, uin: str) -> None:
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
            self.on_connect(name, uin)
            return
        if not e.uin or e.uin != uin:
            old = e.uin
            e.uin = uin
            logger.info("WS 事件补全 uin: name=%s old=%s new=%s", name, old, uin)

    def on_heartbeat(self, name: str, online: bool) -> None:
        """来自 WS 心跳事件"""
        e = self._table.get(name)
        if e:
            e.last_hb_ts = time.time()
            e.hb_online = online

    # ------------------------------------------------------------------
    # API 代理注册（由 ws_router 在连接建立/断开时调用）
    # ------------------------------------------------------------------

    def register_proxy(self, name: str, ws: "WebSocket") -> NapCatApiProxy:
        """注册 NapCatApiProxy（WS 建立后立即调用）。"""
        proxy = NapCatApiProxy(ws)
        self._proxies[name] = proxy
        logger.debug("NapCatApiProxy 注册: name=%s", name)
        return proxy

    def unregister_proxy(self, name: str) -> None:
        """注销并关闭 proxy（WS 断开时调用）。"""
        proxy = self._proxies.pop(name, None)
        if proxy:
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
        """主路径：返回 check_login_status 兼容格式"""
        e = self._table.get(name)
        if not e or not e.uin:
            return {"logged_in": False, "stage": "waiting"}
        if e.is_alive():
            return {
                "logged_in": True,
                "uin": e.uin,
                "nickname": e.nickname,
                "stage": "logged_in",
                "method": "sdk_ws",
                "reason": "ws_connected" if e.connected else "ws_grace",
            }
        return {"logged_in": False, "uin": e.uin, "stage": "waiting", "method": "sdk_ws"}

    def _resolve_known_uin(self, name: str) -> str:
        """解析实例可用 uin（WS注册表 → instance_subsystem → login_cache）。"""
        e = self._table.get(name)
        if e and e.uin:
            return str(e.uin)

        # 兜底1：容器状态引擎内存态（可能由 HTTP 检测更新）
        try:
            from services.instance_subsystem import instance_subsystem
            inst = instance_subsystem.get(name)
            if inst and inst.uin:
                return str(inst.uin)
        except Exception:
            pass

        # 兜底2：历史登录缓存（兼容旧链路）
        try:
            from services.docker_login import read_login_cache
            c = read_login_cache(name) or {}
            uin = c.get("uin", "")
            if uin:
                return str(uin)
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
                logger.debug("BS 辅助检测跳过 [%s]: uin 未知（WS/实例缓存均缺失）", name)
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
                logger.debug("BS 辅助检测无效响应 [%s] uin=%s: %s", name, known_uin, result)
                return {"logged_in": False, "stage": "waiting"}

            online = bool(result.get("online", False))
            uin = str(result.get("uin", "") or result.get("account_id", "") or known_uin)
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

    def all_names(self) -> list:
        return list(self._table.keys())


# 全局单例
napcat_ws_service = NapCatWsService()

