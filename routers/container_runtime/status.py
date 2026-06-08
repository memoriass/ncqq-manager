"""Container stats, logs, QR, and login status routes."""

import base64
import os
import re
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from middleware.auth import check_instance_permission, get_current_user
from middleware.rate_limiter import public_speed_limit
from services.cluster_manager import cluster_manager
from services.config import get_data_dir
from services.container_state import state_engine
from services.docker_async import async_docker_manager
from services.log import logger


router = APIRouter(prefix="/api", tags=["containers"])


@router.get("/containers/{name}/stats")
async def get_container_stats(
    name: str,
    node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")

    stats = await cluster_manager.get_stats_async(node_id, name)
    if node_id == "local" and isinstance(stats, dict):
        last = async_docker_manager.get_last_event(name)
        stats["last_event"] = last

        from services.instance_subsystem import instance_subsystem
        from services.napcat_ws_service import napcat_ws_service

        entry = napcat_ws_service.get_entry_snapshot(name)
        if entry is not None:
            stats["bot_ws_connected"] = entry["connected"]
            stats["bot_nickname"] = entry.get("nickname") or ""
            stats["bot_ws_uin"] = entry.get("uin") or ""
            stats["bot_last_seen"] = entry.get("last_seen", 0)

        inst = instance_subsystem.get(name)
        if inst:
            if inst.logged_in and inst.uin:
                stats["uin"] = inst.uin
            elif not inst.logged_in:
                stats["uin"] = "未登录 / Not Logged In"
    return stats


@router.get("/containers/{name}/logs")
async def get_container_logs(
    name: str,
    lines: int = 100,
    node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    logs = (
        await async_docker_manager.get_logs(name, lines)
        if node_id == "local"
        else await cluster_manager.get_logs_async(node_id, name, lines)
    )
    return {"status": "ok", "logs": logs}


@router.get("/containers/{name}/logs/download")
async def download_container_logs(
    name: str,
    lines: int = 2000,
    node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    logs = (
        await async_docker_manager.get_logs(name, lines)
        if node_id == "local"
        else await cluster_manager.get_logs_async(node_id, name, lines)
    )
    filename = f"{name}_logs_{time.strftime('%Y%m%d_%H%M%S')}.txt"
    return PlainTextResponse(
        content=logs or "",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/containers/{name}/qrcode", dependencies=[Depends(public_speed_limit(0.5))])
async def get_qr_code(name: str, node_id: str = "local"):
    if node_id != "local":
        result = await cluster_manager.get_qr_status_async(node_id, name)
        return result or {"status": "waiting"}

    from services.instance_subsystem import instance_subsystem
    from services.napcat_ws_service import napcat_ws_service

    inst = instance_subsystem.get(name)
    if inst and inst.logged_in:
        return {"status": "logged_in", "uin": inst.uin}

    ws_result = napcat_ws_service.get_login_result(name)
    if ws_result.get("logged_in"):
        return {"status": "logged_in", "uin": ws_result.get("uin", "")}

    qr_max_age = 120
    try:
        qr_path = os.path.join(get_data_dir(), name, "cache", "qrcode.png")
        if os.path.exists(qr_path):
            qr_mtime = os.path.getmtime(qr_path)
            age = time.time() - qr_mtime
            if age < qr_max_age:
                with open(qr_path, "rb") as file_handle:
                    data = base64.b64encode(file_handle.read()).decode("utf-8")
                expires_in = max(0, int(qr_max_age - age))
                return {
                    "status": "ok",
                    "url": f"data:image/png;base64,{data}",
                    "type": "file",
                    "generated_at": int(qr_mtime),
                    "expires_in": expires_in,
                    "expires_at": int(qr_mtime + qr_max_age),
                }
    except Exception as exc:
        logger.debug("Read local QR file failed: %s", exc)

    try:
        logs_text = await async_docker_manager.get_logs(name, 50)
        if logs_text:
            qr_url_match = re.search(r"二维码解码URL:\s*(https://[^\s]+)", logs_text)
            if qr_url_match:
                return {"status": "ok", "url": qr_url_match.group(1), "type": "log"}
    except Exception as exc:
        logger.debug("Read QR from logs failed: %s", exc)

    return {"status": "waiting"}


@router.post("/containers/{name}/refresh-login")
async def refresh_login_status(
    name: str,
    node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if node_id != "local":
        return {"status": "ok", "logged_in": False, "method": "remote_unsupported"}

    from services.instance_subsystem import instance_subsystem

    inst = instance_subsystem.get(name)
    if not inst:
        return {"status": "ok", "logged_in": False, "uin": "", "method": "plugin"}

    state_engine.notify_change()
    return {
        "status": "ok",
        "logged_in": inst.logged_in,
        "uin": inst.uin or "",
        "nickname": "",
        "method": inst.login_method or "plugin",
    }
