"""
BotShepherd 集成路由 - 初始化/启停/状态/连接管理/账号管理
"""
from fastapi import APIRouter, Depends
from middleware.auth import require_admin
from services.botshepherd import botshepherd_manager

router = APIRouter(prefix="/api/botshepherd", tags=["botshepherd"])


@router.get("/status")
async def get_status(_user=Depends(require_admin)):
    return botshepherd_manager.status()


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


