"""Shared helpers for container runtime routes."""

import asyncio
import os
import re
import shutil
from enum import Enum
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.config import get_data_dir
from services.container_state import state_engine
from services.docker_async import async_docker_manager
from services.log import logger


class ContainerAction(str, Enum):
    START = "start"
    STOP = "stop"
    RESTART = "restart"
    PAUSE = "pause"
    UNPAUSE = "unpause"
    KILL = "kill"
    DELETE = "delete"


class RecreateRequest(BaseModel):
    node_id: str = "local"
    clean_data: bool = False
    keep_config: bool = False
    docker_image: str | None = None
    webui_port: int = 0
    http_port: int = 0
    ws_port: int = 0
    memory_limit: int | None = None
    restart_policy: str | None = None
    network_mode: str | None = None
    env_vars: list[str] | None = None


_ALLOWED_DATA_SCOPES = {"all", "config", "cache", "logs"}
_CONTAINER_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


def get_request_id(request: Request) -> str:
    request_id = (request.headers.get("x-request-id") or "").strip()
    return request_id or uuid4().hex


def build_error(status_code: int, code: str, message: str, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "code": code,
            "message": message,
            "request_id": request_id,
        },
    )


def validate_container_name(name: str) -> bool:
    return bool(_CONTAINER_NAME_RE.match(name or ""))


def validate_scope(scope: str) -> str:
    scope_value = (scope or "all").strip().lower()
    if scope_value not in _ALLOWED_DATA_SCOPES:
        raise HTTPException(status_code=400, detail="INVALID_SCOPE")
    return scope_value


def instance_root_path(name: str) -> Path:
    base = Path(get_data_dir()).resolve()
    root = (base / name).resolve()
    if base not in root.parents and root != base:
        raise HTTPException(status_code=400, detail="INVALID_PATH")
    return root


def cleanup_instance_services(name: str) -> None:
    """Clear memory-only service state associated with a container."""
    try:
        from services.instance_subsystem import instance_subsystem

        instance_subsystem.remove(name)
        logger.info("Cleaned instance state: %s", name)
    except Exception as exc:
        logger.debug("Clean instance state failed [%s]: %s", name, exc)

    try:
        from services.napcat_ws_service import napcat_ws_service

        napcat_ws_service.cleanup(name)
    except Exception as exc:
        logger.debug("Clean WS service registry failed [%s]: %s", name, exc)


def schedule_bs_cleanup(name: str) -> None:
    """Schedule best-effort BotShepherd connection cleanup."""
    try:
        from services.botshepherd import botshepherd_manager

        async def _cleanup_bs() -> None:
            try:
                await botshepherd_manager.delete_connection(name)
                logger.info("Cleaned BotShepherd connection config: %s", name)
            except Exception as exc:
                logger.debug("Clean BotShepherd connection failed [%s]: %s", name, exc)

        try:
            asyncio.get_running_loop()
            asyncio.create_task(_cleanup_bs())
        except RuntimeError:
            pass
    except Exception as exc:
        logger.debug("Schedule BotShepherd cleanup failed [%s]: %s", name, exc)


def clear_instance_data(name: str, scope: str, keep_config: bool = False) -> list[str]:
    root = instance_root_path(name)
    if not root.exists():
        return []

    if scope == "all":
        targets = ["qq_data", "config", "plugins", "cache", "logs"]
    elif scope == "config":
        targets = ["config"]
    elif scope == "cache":
        targets = ["cache"]
    else:
        targets = ["logs"]

    if keep_config and "config" in targets:
        targets = [item for item in targets if item != "config"]

    cleared: list[str] = []
    for item in targets:
        target_path = (root / item).resolve()
        if root not in target_path.parents:
            continue
        if target_path.exists():
            shutil.rmtree(target_path, ignore_errors=True)
            cleared.append(item)
        if item in {"qq_data", "config", "plugins", "cache"}:
            os.makedirs(target_path, exist_ok=True)

    if scope == "all":
        bs_marker_dir = root / ".bs_injected"
        if bs_marker_dir.exists():
            shutil.rmtree(bs_marker_dir, ignore_errors=True)
            logger.info("Cleaned BotShepherd injection marker: %s", name)

        cleanup_instance_services(name)
        schedule_bs_cleanup(name)

    return cleared


def parse_env_list(env_vars: list[str] | None) -> dict[str, str]:
    if env_vars is None:
        return {}
    env: dict[str, str] = {}
    for item in env_vars:
        if "=" not in item:
            raise HTTPException(status_code=400, detail=f"INVALID_ENV:{item}")
        key, value = item.split("=", 1)
        key = key.strip()
        if not key:
            raise HTTPException(status_code=400, detail=f"INVALID_ENV:{item}")
        env[key] = value
    return env


async def snapshot_container(name: str) -> dict:
    attrs = await async_docker_manager.inspect_container(name)
    if not attrs:
        return {}

    config = attrs.get("Config") or {}
    host_cfg = attrs.get("HostConfig") or {}
    port_bindings = host_cfg.get("PortBindings") or {}

    def _host_port(container_port: str) -> int:
        value = port_bindings.get(container_port) or []
        if not value or not isinstance(value, list):
            return 0
        first = value[0] if isinstance(value[0], dict) else {}
        p = str(first.get("HostPort", "0"))
        return int(p) if p.isdigit() else 0

    memory_bytes = int(host_cfg.get("Memory") or 0)
    memory_mb = memory_bytes // (1024 * 1024) if memory_bytes > 0 else 0
    env_dict: dict[str, str] = {}
    for line in config.get("Env") or []:
        if isinstance(line, str) and "=" in line:
            key, value = line.split("=", 1)
            env_dict[key] = value

    return {
        "image": str(config.get("Image") or ""),
        "webui_port": _host_port("6099/tcp"),
        "http_port": _host_port("3000/tcp"),
        "ws_port": _host_port("3001/tcp"),
        "memory_limit": memory_mb,
        "restart_policy": str((host_cfg.get("RestartPolicy") or {}).get("Name") or ""),
        "network_mode": str(host_cfg.get("NetworkMode") or ""),
        "env": env_dict,
    }


def is_running(name: str) -> bool:
    containers = state_engine.get_containers()
    for item in containers:
        if item.get("name") == name:
            return item.get("status") == "running"
    return False
