"""Container lifecycle action routes."""

import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, Request

from middleware.auth import check_instance_permission, get_current_user
from middleware.rate_limiter import speed_limit
from services.cluster_manager import cluster_manager
from services.config import get_data_dir
from services.container_state import state_engine
from services.docker_async import async_docker_manager
from services.log import logger
from services.operation_logger import operation_logger
from routers.container_runtime.common import ContainerAction, cleanup_instance_services


router = APIRouter(prefix="/api", tags=["containers"])


@router.post("/containers/{name}/action", dependencies=[Depends(speed_limit(2.0))])
async def api_container_action(
    name: str,
    action: ContainerAction,
    request: Request,
    node_id: str = "local",
    delete_data: bool = False,
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")

    action_value = action.value
    success = (
        await async_docker_manager.action_container(name, action_value)
        if node_id == "local"
        else await cluster_manager.action_container_async(node_id, name, action_value)
    )
    if not success:
        raise HTTPException(status_code=500, detail="Action failed")

    state_engine.notify_change()
    if action_value == "delete" and node_id == "local":
        cleanup_instance_services(name)

        if delete_data:
            data_dir = os.path.join(get_data_dir(), name)
            if os.path.exists(data_dir):
                shutil.rmtree(data_dir, ignore_errors=True)
                logger.info("Deleted local data directory: %s", data_dir)

        try:
            from services.botshepherd import botshepherd_manager

            result = await botshepherd_manager.delete_connection(name)
            if isinstance(result, dict) and result.get("success", True) is not False:
                logger.info("Deleted BotShepherd connection config: %s", name)
            else:
                logger.debug("BotShepherd connection delete result: %s -> %s", name, result)
        except Exception as exc:
            logger.debug("Delete BotShepherd connection config failed: %s -> %s", name, exc)

    operation_logger.info(
        "container_action",
        {
            "operator_ip": request.client.host if request.client else "unknown",
            "operator_name": session["userName"],
            "operator_uuid": session.get("uuid"),
            "container_name": name,
            "action": action_value,
            "node_id": node_id,
            "delete_data": delete_data,
        },
    )
    return {"status": "ok"}
