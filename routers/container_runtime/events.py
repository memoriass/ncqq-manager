"""Container Server-Sent Events stream routes."""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from middleware.auth import check_instance_permission, get_current_user
from services.docker_async import async_docker_manager
from routers.container_runtime.common import validate_container_name


router = APIRouter(prefix="/api", tags=["containers"])


@router.get("/containers/{name}/events")
async def stream_container_events(
    name: str,
    request: Request,
    timeout: int = 60,
    node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    """Stream local Docker lifecycle events for one container."""
    if not validate_container_name(name):
        raise HTTPException(status_code=400, detail="Invalid container name")
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    if node_id != "local":
        raise HTTPException(status_code=501, detail="Event stream only supported on local node")

    stream_timeout = min(max(timeout, 5), 300)
    loop = asyncio.get_event_loop()
    queue = async_docker_manager.subscribe(name)

    async def _generate():
        try:
            deadline = loop.time() + stream_timeout
            while True:
                if await request.is_disconnected():
                    break
                remaining = deadline - loop.time()
                if remaining <= 0:
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=min(remaining, 15))
                    yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            async_docker_manager.unsubscribe(name, queue)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
