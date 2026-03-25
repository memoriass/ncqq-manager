"""
BotShepherd 集成路由 - 初始化/启停/状态/连接管理/账号管理
"""
from fastapi import APIRouter, Depends, Query
from middleware.auth import require_admin
from services.botshepherd import botshepherd_manager

router = APIRouter(prefix="/api/botshepherd", tags=["botshepherd"])


@router.get("/status")
async def get_status(_user=Depends(require_admin)):
    return botshepherd_manager.status()


@router.get("/logs")
async def get_bs_logs(lines: int = Query(100, ge=1, le=500), _user=Depends(require_admin)):
    """获取 BotShepherd 进程控制台输出（最近 N 行）"""
    return {"status": "ok", "logs": botshepherd_manager.read_logs(lines)}


@router.post("/setup")
async def run_setup(_user=Depends(require_admin)):
    return await botshepherd_manager.setup()


@router.post("/start")
async def start_service(_user=Depends(require_admin)):
    return botshepherd_manager.start()


@router.post("/stop")
async def stop_service(_user=Depends(require_admin)):
    return botshepherd_manager.stop()


# ---- 连接管理 ----

@router.get("/connections")
async def get_connections(_user=Depends(require_admin)):
    return await botshepherd_manager.get_connections()


@router.put("/connections/{connection_id}")
async def update_connection(connection_id: str, body: dict, _user=Depends(require_admin)):
    return await botshepherd_manager.update_connection(connection_id, body)


@router.post("/connections/{connection_id}/copy")
async def copy_connection(connection_id: str, body: dict, _user=Depends(require_admin)):
    return await botshepherd_manager.copy_connection(connection_id, body)


@router.delete("/connections/{connection_id}")
async def delete_connection(connection_id: str, _user=Depends(require_admin)):
    return await botshepherd_manager.delete_connection(connection_id)


# ---- 账号管理 ----

@router.get("/accounts")
async def get_accounts(_user=Depends(require_admin)):
    return await botshepherd_manager.get_accounts()


@router.put("/accounts/{account_id}")
async def update_account(account_id: str, body: dict, _user=Depends(require_admin)):
    return await botshepherd_manager.update_account(account_id, body)


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, _user=Depends(require_admin)):
    return await botshepherd_manager.delete_account(account_id)


@router.get("/accounts/{account_id}/online-status")
async def get_account_online(account_id: str, _user=Depends(require_admin)):
    return await botshepherd_manager.get_account_online(account_id)


# ---- Bot 掉线检测（管理器内置 OneBot WS 端点采集） ----

@router.get("/bots/heartbeat")
async def get_bots_heartbeat(_user=Depends(require_admin)):
    """查询所有已接入管理器 OneBot WS 端点的 Bot 在线状态。

    数据来源：/ws/onebot/v11/ws 端点接收的 meta_event.heartbeat 事件。
    online=true 表示最近一个心跳周期内有心跳且 NapCat 上报 online=true。
    """
    from services.bot_heartbeat import bot_heartbeat
    return {"status": "ok", "bots": bot_heartbeat.get_all()}


@router.get("/bots/heartbeat/{self_id}")
async def get_bot_heartbeat(self_id: str, _user=Depends(require_admin)):
    """查询指定 Bot（self_id）的在线状态。"""
    from services.bot_heartbeat import bot_heartbeat
    result = bot_heartbeat.get_one(self_id)
    if result is None:
        return {"status": "ok", "online": False, "detail": "no heartbeat received"}
    return {"status": "ok", **result}
