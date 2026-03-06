"""
WebSocket 路由 - 实时事件推送 + 日志流
"""
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.concurrency import run_in_threadpool

from services.ws_manager import ws_manager
from services.cluster_manager import cluster_manager
from services.log import logger
from middleware.auth import validate_token_value

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket, token: str = Query(default="")):
    """容器状态实时推送。客户端连接后定期推送全量容器列表。"""
    # 鉴权：通过 query param 传递 token
    session = validate_token_value(token) if token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws_manager.connect(ws)
    try:
        while True:
            containers = await run_in_threadpool(cluster_manager.list_all_containers)
            await ws.send_json({"type": "containers", "data": containers})
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS events 连接异常: %s", e)
    finally:
        await ws_manager.disconnect(ws)


@router.websocket("/ws/logs/{name}")
async def ws_container_logs(
    ws: WebSocket, name: str,
    node_id: str = Query(default="local"),
    token: str = Query(default=""),
):
    """容器日志实时流推送"""
    session = validate_token_value(token) if token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()
    try:
        while True:
            logs = await run_in_threadpool(cluster_manager.get_logs, node_id, name, 200)
            await ws.send_json({"type": "logs", "data": logs or ""})
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS logs 连接异常 [%s]: %s", name, e)

