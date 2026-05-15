"""
内部插件上报 API — HTTP POST 版本

端点：POST /api/internal/plugin/{name}/report?key=<internal_api_key>
接收 login/logout/heartbeat 上报，替代 WS 长连接。
"""

import time

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.config import app_config
from services.instance_subsystem import instance_subsystem
from services.container_state import state_engine
from services.log import logger

router = APIRouter(prefix="/api/internal", tags=["internal"])


class PluginReport(BaseModel):
    type: str  # login / logout / heartbeat
    uin: Optional[str] = ""
    nickname: Optional[str] = ""
    reason: Optional[str] = ""
    online: Optional[bool] = None
    message_sent: Optional[int] = None
    message_received: Optional[int] = None


@router.post("/plugin/{name}/report")
async def plugin_report(name: str, body: PluginReport, key: str = Query(default="")):
    expected_key = app_config.get("internal_api_key", "")
    if not expected_key or key != expected_key:
        logger.warning(
            "Plugin HTTP [%s] 鉴权失败: 提供的 key 前缀=%s 与 internal_api_key 不匹配",
            name, key[:6] + "..." if key else "(空)",
        )
        raise HTTPException(status_code=403, detail="Invalid key")

    inst = instance_subsystem.get(name)
    if not inst:
        raise HTTPException(status_code=404, detail="Unknown container")

    if body.type == "login":
        from services.docker_login import LoginMixin
        LoginMixin.update_login_cache(name, {
            "event": "login",
            "uin": body.uin or "",
            "nickname": body.nickname or "",
        })
        inst.bot_online = True
        inst.bot_heartbeat_ts = time.time()
        state_engine.notify_change()
        logger.info("Plugin HTTP [%s] login uin=%s", name, body.uin)

    elif body.type == "logout":
        from services.docker_login import LoginMixin
        LoginMixin.update_login_cache(name, {
            "event": "logout",
            "uin": body.uin or "",
        })
        inst.bot_online = False
        state_engine.notify_change()
        logger.info("Plugin HTTP [%s] logout uin=%s reason=%s", name, body.uin, body.reason)

    elif body.type == "heartbeat":
        inst.bot_online = body.online if body.online is not None else True
        inst.bot_heartbeat_ts = time.time()
        if body.message_sent is not None:
            inst.message_sent = body.message_sent
        if body.message_received is not None:
            inst.message_received = body.message_received
        state_engine.notify_change()

    return {"ok": True}