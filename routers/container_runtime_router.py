"""
容器运行态路由 - 操作 / 统计 / 日志 / QR / 登录刷新 / 内部登录事件
"""

import base64
import os
import re
import time
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from starlette.concurrency import run_in_threadpool

from middleware.auth import check_instance_permission, get_current_user
from middleware.rate_limiter import public_speed_limit, speed_limit
from services.cluster_manager import cluster_manager
from services.config import app_config, get_data_dir
from services.container_state import state_engine
from services.docker_async import async_docker_manager
from services.docker_manager import docker_manager, read_login_cache
from services.log import logger
from services.operation_logger import operation_logger

router = APIRouter(prefix="/api", tags=["containers"])


class ContainerAction(str, Enum):
    START = "start"
    STOP = "stop"
    RESTART = "restart"
    PAUSE = "pause"
    UNPAUSE = "unpause"
    KILL = "kill"
    DELETE = "delete"


@router.post("/containers/{name}/action", dependencies=[Depends(speed_limit(2.0))])
async def api_container_action(name: str, action: ContainerAction, request: Request, node_id: str = "local", delete_data: bool = False, session: dict = Depends(get_current_user)):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    action_value = action.value
    success = await async_docker_manager.action_container(name, action_value) if node_id == "local" else await cluster_manager.action_container_async(node_id, name, action_value)
    if not success:
        raise HTTPException(status_code=500, detail="Action failed")
    state_engine.notify_change()
    if action_value == "delete" and delete_data and node_id == "local":
        import shutil
        data_dir = os.path.join(get_data_dir(), name)
        if os.path.exists(data_dir):
            shutil.rmtree(data_dir, ignore_errors=True)
            logger.info("已删除本地数据目录: %s", data_dir)
    operation_logger.info("container_action", {"operator_ip": request.client.host if request.client else "unknown", "operator_name": session["userName"], "operator_uuid": session.get("uuid"), "container_name": name, "action": action_value, "node_id": node_id, "delete_data": delete_data})
    return {"status": "ok"}


@router.get("/containers/{name}/stats")
async def get_container_stats(name: str, node_id: str = "local", session: dict = Depends(get_current_user)):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    return await cluster_manager.get_stats_async(node_id, name)


@router.get("/containers/{name}/logs")
async def get_container_logs(name: str, lines: int = 100, node_id: str = "local", session: dict = Depends(get_current_user)):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    logs = await async_docker_manager.get_logs(name, lines) if node_id == "local" else await cluster_manager.get_logs_async(node_id, name, lines)
    return {"status": "ok", "logs": logs}


@router.get("/containers/{name}/logs/download")
async def download_container_logs(name: str, lines: int = 2000, node_id: str = "local", session: dict = Depends(get_current_user)):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    logs = await async_docker_manager.get_logs(name, lines) if node_id == "local" else await cluster_manager.get_logs_async(node_id, name, lines)
    filename = f"{name}_logs_{time.strftime('%Y%m%d_%H%M%S')}.txt"
    return PlainTextResponse(content=logs or "", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/containers/{name}/qrcode", dependencies=[Depends(public_speed_limit(0.5))])
async def get_qr_code(name: str, node_id: str = "local"):
    if node_id != "local":
        result = await cluster_manager.get_qr_status_async(node_id, name)
        return result or {"status": "waiting"}
    cached = read_login_cache(name)
    if cached.get("logged_in"):
        return {"status": "logged_in", "uin": cached.get("uin", "")}
    qr_file_fresh = False
    try:
        qr_path = os.path.join(get_data_dir(), name, "cache", "qrcode.png")
        if os.path.exists(qr_path):
            age = time.time() - os.path.getmtime(qr_path)
            if age < 120:
                qr_file_fresh = True
                with open(qr_path, "rb") as file_handle:
                    data = base64.b64encode(file_handle.read()).decode("utf-8")
                if age > 30:
                    login = await run_in_threadpool(docker_manager.check_login_status, name)
                    if login.get("logged_in"):
                        return {"status": "logged_in", "uin": login.get("uin", "")}
                return {"status": "ok", "url": f"data:image/png;base64,{data}", "type": "file"}
    except Exception as exc:
        logger.debug(f"读取本地二维码文件失败: {exc}")
    if not qr_file_fresh:
        try:
            login = await run_in_threadpool(docker_manager.check_login_status, name)
            if login.get("logged_in"):
                return {"status": "logged_in", "uin": login.get("uin", "")}
        except Exception:
            pass
    try:
        if docker_manager.client:
            container = docker_manager.client.containers.get(name)
            if container.status != "running":
                return {"status": "waiting"}
            logs = container.logs(tail=50).decode("utf-8", errors="ignore")
            qr_url_match = re.search(r"二维码解码URL:\s*(https://[^\s]+)", logs)
            if qr_url_match:
                return {"status": "ok", "url": qr_url_match.group(1), "type": "log"}
    except Exception as exc:
        logger.debug(f"从日志获取二维码失败: {exc}")
    return {"status": "waiting"}


@router.post("/containers/{name}/refresh-login")
async def refresh_login_status(name: str, node_id: str = "local", session: dict = Depends(get_current_user)):
    if node_id != "local":
        return {"status": "ok", "logged_in": False, "method": "remote_unsupported"}
    login = await run_in_threadpool(docker_manager.check_login_status, name, True)
    state_engine.notify_change()
    return {"status": "ok", "logged_in": login.get("logged_in", False), "uin": login.get("uin", ""), "nickname": login.get("nickname", ""), "method": login.get("method", "")}


@router.post("/internal/login-event")
async def receive_login_event(request: Request):
    internal_key = request.headers.get("x-internal-key", "")
    expected_key = app_config.get("internal_api_key", "")
    if not expected_key or internal_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid internal key")
    body = await request.json()
    container_name = body.get("name", "")
    if not container_name:
        raise HTTPException(status_code=400, detail="Missing container name")
    docker_manager.update_login_cache(container_name, body)
    return {"status": "ok"}

