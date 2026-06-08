"""Internal runtime event routes called by container-side integrations."""

import time

from fastapi import APIRouter, HTTPException, Request

from services.config import app_config
from services.container_state import state_engine


router = APIRouter(prefix="/api", tags=["containers"])


def _require_internal_key(request: Request) -> None:
    internal_key = request.headers.get("x-internal-key", "")
    expected_key = app_config.get("internal_api_key", "")
    if not expected_key or internal_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid internal key")


@router.post("/internal/login-event")
async def receive_login_event(request: Request):
    _require_internal_key(request)
    body = await request.json()
    container_name = body.get("name", "")
    if not container_name:
        raise HTTPException(status_code=400, detail="Missing container name")

    from services.docker_login import LoginMixin

    LoginMixin.update_login_cache(container_name, body)
    state_engine.notify_change()
    return {"status": "ok"}


@router.post("/internal/heartbeat")
async def receive_heartbeat(request: Request):
    _require_internal_key(request)
    body = await request.json()
    container_name = body.get("name", "")
    if not container_name:
        raise HTTPException(status_code=400, detail="Missing container name")

    from services.instance_subsystem import instance_subsystem

    inst = instance_subsystem.get(container_name)
    if not inst:
        return {"status": "ok", "ignored": True}

    inst.bot_online = True
    inst.bot_heartbeat_ts = time.time()
    if "message_sent" in body:
        inst.message_sent = int(body["message_sent"])
    if "message_received" in body:
        inst.message_received = int(body["message_received"])
    state_engine.notify_change()
    return {"status": "ok"}
