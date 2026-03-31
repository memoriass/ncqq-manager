import asyncio
import time
from typing import Any, Dict, Optional

import aiohttp

from services.log import logger


class BSActivationService:
    """BotShepherd 最小激活连接器。

    职责：
    - 维护到指定 OneBot WS 端点的持续连接
    - 接收 lifecycle / heartbeat / 首个 self_id
    - 将连接状态暴露给 API 查询
    不承载业务消息处理，仅做激活与状态采集
    """

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._state: Dict[str, Any] = {
            "enabled": False,
            "status": "idle",
            "url": "",
            "token": "",
            "self_id": "",
            "connected": False,
            "last_seen": 0.0,
            "last_error": "",
            "last_connect_at": 0.0,
            "last_disconnect_at": 0.0,
            "source": "bs_activation",
        }

    def status(self) -> Dict[str, Any]:
        state = dict(self._state)
        state["running"] = bool(self._task and not self._task.done())
        return state

    async def start(self, url: str, token: str = "") -> Dict[str, Any]:
        # 防误用：激活连接不能指向管理器自身的接收端点，否则形成自环
        try:
            from urllib.parse import urlparse as _urlparse
            _p = _urlparse(url)
            if "/ws/napcat/" in _p.path or _p.path.rstrip("/").endswith("/ws/onebot/v11/ws"):
                return {
                    "success": False,
                    "message": (
                        "激活连接不能指向管理器自身接收端点（/ws/napcat/... 或 /ws/onebot/v11/ws）。"
                        "该端点由 BS 自动注入并保活，无需手动填写。"
                        "若要监听外部 OneBot 事件，请填写对方的 WS Server 地址。"
                    ),
                }
        except Exception:
            pass

        if self._task and not self._task.done():
            return {"success": True, "message": "already running", "activation": self.status()}
        self._running = True
        self._state.update({
            "enabled": True,
            "url": url,
            "token": token,
            "status": "connecting",
            "last_error": "",
        })
        self._task = asyncio.create_task(self._run_loop())
        return {"success": True, "message": "started", "activation": self.status()}

    async def stop(self) -> Dict[str, Any]:
        self._running = False
        self._state["enabled"] = False
        self._state["status"] = "stopping"
        task = self._task
        self._task = None
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._state["connected"] = False
        self._state["status"] = "idle"
        self._state["last_disconnect_at"] = time.time()
        return {"success": True, "message": "stopped", "activation": self.status()}

    async def _run_loop(self) -> None:
        while self._running:
            url = str(self._state.get("url") or "")
            token = str(self._state.get("token") or "")
            if not url:
                self._state.update({"status": "error", "last_error": "missing_url", "connected": False})
                return
            headers = {
                "User-Agent": "NapCatManager/1.0 OneBot/11",
                "X-Self-ID": self._state.get("self_id") or "0",
                "X-Client-Role": "Universal",
            }
            if token:
                headers["Authorization"] = f"Bearer {token}"
            self._state["status"] = "connecting"
            try:
                timeout = aiohttp.ClientTimeout(total=None, connect=5)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.ws_connect(url, heartbeat=30, headers=headers) as ws:
                        self._state.update({
                            "connected": True,
                            "status": "connected",
                            "last_connect_at": time.time(),
                            "last_error": "",
                        })
                        logger.info("BS 激活连接已建立: url=%s", url)
                        async for msg in ws:
                            if msg.type != aiohttp.WSMsgType.TEXT:
                                continue
                            await self._handle_message(msg.data)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self._state.update({
                    "connected": False,
                    "status": "reconnecting" if self._running else "idle",
                    "last_error": str(e),
                    "last_disconnect_at": time.time(),
                })
                logger.warning("BS 激活连接异常: %s", e)
                if self._running:
                    await asyncio.sleep(3)
            else:
                self._state.update({
                    "connected": False,
                    "status": "reconnecting" if self._running else "idle",
                    "last_disconnect_at": time.time(),
                })
                if self._running:
                    await asyncio.sleep(1)

    async def _handle_message(self, raw: str) -> None:
        import json

        try:
            data = json.loads(raw)
        except Exception:
            return
        self_id = data.get("self_id")
        if self_id and str(self_id) != "0":
            self._state["self_id"] = str(self_id)
        post_type = data.get("post_type", "")
        meta_type = data.get("meta_event_type", "")
        if post_type == "meta_event":
            self._state["last_seen"] = time.time()
            if meta_type == "heartbeat":
                from services.bot_heartbeat import bot_heartbeat
                interval_ms = int(data.get("interval", 30000) or 30000)
                status = data.get("status") or {}
                if self._state.get("self_id"):
                    bot_heartbeat.on_heartbeat(self._state["self_id"], interval_ms, status)
            elif meta_type == "lifecycle":
                from services.bot_heartbeat import bot_heartbeat
                sub_type = data.get("sub_type", "")
                if self._state.get("self_id"):
                    if sub_type == "connect":
                        bot_heartbeat.on_connect(self._state["self_id"])
                    elif sub_type == "disconnect":
                        bot_heartbeat.on_disconnect(self._state["self_id"])


bs_activation_service = BSActivationService()

