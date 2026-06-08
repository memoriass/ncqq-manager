"""Data cleanup and container recreation routes."""

import json
import os

from fastapi import APIRouter, Depends, HTTPException, Request

from middleware.auth import check_instance_permission, get_api_key_user
from middleware.rate_limiter import speed_limit
from services.cluster_manager import cluster_manager
from services.config import app_config, get_data_dir
from services.container_state import state_engine
from services.docker_async import async_docker_manager
from services.operation_log_context import build_operator_payload
from services.operation_logger import operation_logger
from routers.container_runtime.common import (
    RecreateRequest,
    build_error,
    clear_instance_data,
    get_request_id,
    is_running,
    parse_env_list,
    snapshot_container,
    validate_container_name,
    validate_scope,
)


router = APIRouter(prefix="/api", tags=["containers"])


@router.delete("/containers/{name}/data", dependencies=[Depends(speed_limit(2.0))])
async def api_clear_container_data(
    name: str,
    request: Request,
    scope: str = "all",
    node_id: str = "local",
    session: dict = Depends(get_api_key_user),
):
    request_id = get_request_id(request)
    if not validate_container_name(name):
        return build_error(400, "INVALID_NAME", "invalid container name", request_id)

    try:
        scope_value = validate_scope(scope)
    except HTTPException:
        return build_error(400, "INVALID_SCOPE", "scope must be all|config|cache|logs", request_id)

    if not check_instance_permission(session, node_id, name):
        return build_error(403, "NO_PERMISSION", "no permission for this instance", request_id)

    if node_id != "local":
        code, body, _ = await cluster_manager.proxy_to_node_async(
            node_id,
            "DELETE",
            f"/api/containers/{name}/data?scope={scope_value}&node_id=local",
            timeout=10.0,
        )
        if code >= 400:
            message = body.decode("utf-8", errors="ignore") if body else "remote clear failed"
            return build_error(code, "REMOTE_CLEAN_FAILED", message, request_id)
        remote_data = (
            json.loads(body)
            if body
            else {"status": "ok", "name": name, "cleared": [], "restarted": False}
        )
        if isinstance(remote_data, dict):
            remote_data["request_id"] = request_id
        return remote_data

    was_running = is_running(name)
    if was_running:
        stopped = await async_docker_manager.action_container(name, "stop")
        if not stopped:
            return build_error(
                500,
                "STOP_FAILED",
                "failed to stop container before clear",
                request_id,
            )

    try:
        cleared = clear_instance_data(name, scope_value)
    except HTTPException as exc:
        return build_error(exc.status_code, str(exc.detail), "invalid data path", request_id)
    except Exception as exc:
        return build_error(500, "CLEAN_FAILED", f"clear data failed: {exc}", request_id)

    restarted = False
    if was_running:
        restarted = await async_docker_manager.action_container(name, "start")

    state_engine.notify_change()
    operation_logger.info(
        "container_data_clear",
        build_operator_payload(
            request,
            session,
            {
                "request_id": request_id,
                "container_name": name,
                "node_id": node_id,
                "scope": scope_value,
                "cleared": cleared,
                "restarted": restarted,
            },
        ),
    )
    return {
        "status": "ok",
        "name": name,
        "cleared": cleared,
        "restarted": restarted,
        "request_id": request_id,
    }


@router.post("/containers/{name}/recreate", dependencies=[Depends(speed_limit(1.0))])
async def api_recreate_container(
    name: str,
    req: RecreateRequest,
    request: Request,
    session: dict = Depends(get_api_key_user),
):
    request_id = get_request_id(request)
    if not validate_container_name(name):
        return build_error(400, "INVALID_NAME", "invalid container name", request_id)

    if not check_instance_permission(session, req.node_id, name):
        return build_error(403, "NO_PERMISSION", "no permission for this instance", request_id)

    if req.node_id != "local":
        code, body, _ = await cluster_manager.proxy_to_node_async(
            req.node_id,
            "POST",
            f"/api/containers/{name}/recreate",
            timeout=20.0,
            json={
                "node_id": "local",
                "clean_data": req.clean_data,
                "keep_config": req.keep_config,
                "docker_image": req.docker_image,
                "webui_port": req.webui_port,
                "http_port": req.http_port,
                "ws_port": req.ws_port,
                "memory_limit": req.memory_limit,
                "restart_policy": req.restart_policy,
                "network_mode": req.network_mode,
                "env_vars": req.env_vars,
            },
        )
        if code >= 400:
            message = body.decode("utf-8", errors="ignore") if body else "remote recreate failed"
            return build_error(code, "REMOTE_RECREATE_FAILED", message, request_id)
        remote_data = json.loads(body) if body else {"status": "ok", "name": name}
        if isinstance(remote_data, dict):
            remote_data["request_id"] = request_id
        return remote_data

    try:
        snapshot = await snapshot_container(name)
    except Exception:
        return build_error(404, "NOT_FOUND", "container not found", request_id)

    old_removed = await async_docker_manager.action_container(name, "delete")
    if not old_removed:
        return build_error(
            500,
            "RECREATE_DELETE_FAILED",
            "failed to delete old container",
            request_id,
        )

    cleared: list[str] = []
    if req.clean_data:
        try:
            cleared = clear_instance_data(name, "all", req.keep_config)
        except HTTPException as exc:
            return build_error(exc.status_code, str(exc.detail), "invalid data path", request_id)
        except Exception as exc:
            return build_error(500, "CLEAN_FAILED", f"clear data failed: {exc}", request_id)

    data_dir = os.path.join(get_data_dir(), name)
    volumes = {
        os.path.join(data_dir, "qq_data"): {"bind": "/app/.config/QQ", "mode": "rw"},
        os.path.join(data_dir, "config"): {"bind": "/app/napcat/config", "mode": "rw"},
        os.path.join(data_dir, "plugins"): {"bind": "/app/napcat/plugins", "mode": "rw"},
        os.path.join(data_dir, "cache"): {"bind": "/app/napcat/cache", "mode": "rw"},
    }
    for host_dir in volumes:
        os.makedirs(host_dir, exist_ok=True)

    webui_port = req.webui_port or int(snapshot.get("webui_port") or 0)
    if webui_port <= 0:
        webui_port = await async_docker_manager.allocate_port(app_config.get("webui_base_port", 6000))

    http_port = req.http_port or int(snapshot.get("http_port") or 0)
    if http_port <= 0:
        http_port = await async_docker_manager.allocate_port(app_config.get("http_base_port", 3000))

    ws_port = req.ws_port or int(snapshot.get("ws_port") or 0)
    if ws_port <= 0:
        ws_port = await async_docker_manager.allocate_port(app_config.get("ws_base_port", 3001))

    image = req.docker_image or str(
        snapshot.get("image") or app_config.get("docker_image", "mlikiowa/napcat-docker:latest")
    )

    if req.env_vars is None:
        env_dict = dict(snapshot.get("env") or {})
    else:
        try:
            env_dict = parse_env_list(req.env_vars)
        except HTTPException:
            return build_error(400, "INVALID_ENV", "env_vars must be KEY=VALUE list", request_id)
    if "ACCOUNT" not in env_dict:
        env_dict["ACCOUNT"] = ""

    restart_policy_name = (
        req.restart_policy
        if req.restart_policy is not None
        else str(snapshot.get("restart_policy") or "always")
    )
    restart_policy = {"Name": "always"} if not restart_policy_name or restart_policy_name == "no" else {"Name": restart_policy_name}

    memory_limit = (
        req.memory_limit
        if req.memory_limit is not None
        else int(snapshot.get("memory_limit") or 0)
    )

    network_mode = (
        req.network_mode
        if req.network_mode is not None
        else str(snapshot.get("network_mode") or "bridge")
    )
    network_mode_arg = network_mode if network_mode and network_mode != "bridge" else None

    cid = await async_docker_manager.create_container(
        name=name,
        image=image,
        volumes=volumes,
        ports={"6099/tcp": webui_port, "3000/tcp": http_port, "3001/tcp": ws_port},
        environment=env_dict,
        restart_policy=restart_policy,
        mem_limit=f"{memory_limit}m" if memory_limit > 0 else None,
        network_mode=network_mode_arg,
    )
    for port in (webui_port, http_port, ws_port):
        async_docker_manager.release_port(port)
    if not cid:
        return build_error(
            500,
            "RECREATE_CREATE_FAILED",
            "failed to create new container",
            request_id,
        )

    state_engine.notify_change()
    operation_logger.info(
        "container_recreate",
        build_operator_payload(
            request,
            session,
            {
                "request_id": request_id,
                "container_name": name,
                "node_id": req.node_id,
                "clean_data": req.clean_data,
                "keep_config": req.keep_config,
                "cleared": cleared,
                "ports": {"webui": webui_port, "http": http_port, "ws": ws_port},
                "image": image,
            },
        ),
    )
    return {
        "status": "ok",
        "name": name,
        "old_removed": True,
        "new_created": True,
        "started": True,
        "cleared": cleared,
        "ports": {"webui": webui_port, "http": http_port, "ws": ws_port},
        "request_id": request_id,
    }
