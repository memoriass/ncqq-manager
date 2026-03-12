"""
WebSocket 路由 - 实时事件推送 + 日志流

端点：
  /ws/events  — 管理员专用（需认证），推送全量容器状态
  /ws/public  — 公开端点（无需认证），推送容器列表 + QR 状态，支持按需分页订阅
  /ws/logs/{name} — 管理员专用，推送容器日志流
"""
import asyncio

import orjson

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.concurrency import run_in_threadpool

from services.ws_manager import ws_manager
from services.cluster_manager import cluster_manager
from services.instance_subsystem import instance_subsystem
from services.log import logger
from services.container_state import state_engine
from middleware.auth import validate_token_value

router = APIRouter(tags=["websocket"])

_MAX_PUBLIC_WS = 50  # 公开 WS 最大并发连接数
_public_ws_count = 0  # 当前公开 WS 连接计数


def _build_snapshot(containers: list) -> dict:
    """构建容器快照字典（用于增量 diff 比较）。key=name, value=精简状态。"""
    snap = {}
    for c in containers:
        snap[c["name"]] = {
            "status": c.get("status", ""),
            "uin": c.get("uin", ""),
            "node_id": c.get("node_id", "local"),
        }
    return snap


def _resolve_ws_token(ws: WebSocket, query_token: str) -> str:
    """从 query 参数或 cookie 中提取认证 token。
    httpOnly cookie 无法被前端 JS 读取，但浏览器在 WS 握手时会自动携带。
    """
    if query_token:
        return query_token
    return ws.cookies.get("auth_token", "")


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket, token: str = Query(default="")):
    """容器状态实时推送 — 从状态引擎读内存快照，零 Docker API 调用。"""
    effective_token = _resolve_ws_token(ws, token)
    session = validate_token_value(effective_token) if effective_token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws_manager.connect(ws)
    prev_snapshot: dict = {}
    try:
        while True:
            # 从状态引擎读内存快照（零阻塞，<1ms）
            containers = state_engine.get_containers()
            curr_snapshot = _build_snapshot(containers)

            try:
                if curr_snapshot != prev_snapshot:
                    await asyncio.wait_for(
                        ws.send_json({"type": "containers", "data": containers}), timeout=5
                    )
                    prev_snapshot = curr_snapshot
                else:
                    await asyncio.wait_for(
                        ws.send_json({"type": "heartbeat"}), timeout=5
                    )
            except (asyncio.TimeoutError, Exception):
                break

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
    effective_token = _resolve_ws_token(ws, token)
    session = validate_token_value(effective_token) if effective_token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()
    try:
        while True:
            try:
                logs = await asyncio.wait_for(
                    run_in_threadpool(cluster_manager.get_logs, node_id, name, 200),
                    timeout=8
                )
            except (asyncio.TimeoutError, Exception):
                logs = ""
            try:
                await asyncio.wait_for(
                    ws.send_json({"type": "logs", "data": logs or ""}), timeout=5
                )
            except (asyncio.TimeoutError, Exception):
                break
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS logs 连接异常 [%s]: %s", name, e)



# ============ 公开 WS — 无需认证，推送容器列表 + QR 状态 ============

@router.websocket("/ws/public")
async def ws_public(ws: WebSocket):
    """公开 WS 端点 — 用户面板专用，推送容器列表 + QR 状态。

    协议：
      服务端 → 客户端：
        {"type": "full",      "data": {"containers": [...], "qr": {...}}}
        {"type": "heartbeat"}
      客户端 → 服务端（可选，按需订阅分页）：
        {"type": "subscribe", "page": 1, "pageSize": 20}
    """
    global _public_ws_count
    if _public_ws_count >= _MAX_PUBLIC_WS:
        await ws.close(code=4429, reason="Too many connections")
        return

    await ws.accept()
    _public_ws_count += 1

    # 默认推送全量（向后兼容），客户端可发 subscribe 切换分页
    sub_page = 0       # 0 = 全量模式
    sub_page_size = 20
    prev_hash = ""

    async def _recv_loop():
        """接收客户端的订阅消息（翻页/搜索时发送）。"""
        nonlocal sub_page, sub_page_size
        try:
            async for raw in ws.iter_text():
                try:
                    msg = orjson.loads(raw)
                    if msg.get("type") == "subscribe":
                        sub_page = int(msg.get("page", 1))
                        sub_page_size = min(int(msg.get("pageSize", 20)), 50)
                except (orjson.JSONDecodeError, ValueError, TypeError):
                    pass
        except WebSocketDisconnect:
            pass

    recv_task = asyncio.create_task(_recv_loop())
    try:
        while True:
            # 构建推送数据
            if sub_page > 0:
                # 分页模式 — 只推送当前页（MCSM instance/select 模式）
                page_result = instance_subsystem.query(
                    page=sub_page, page_size=sub_page_size)
                containers = page_result["data"]
                qr_states = {}
                for item in containers:
                    inst = instance_subsystem.get(item["name"])
                    if inst:
                        qr_states[item["name"]] = inst.to_qr_dict()
                payload = {"containers": page_result, "qr": qr_states}
            else:
                # 全量模式 — 兼容简单客户端
                containers = state_engine.get_containers()
                qr_states = state_engine.get_qr_states()
                payload = {"containers": containers, "qr": qr_states}

            # 增量 diff：orjson.dumps 返回 bytes，直接 hash（3-10x 快于 json.dumps）
            curr_hash = hash(orjson.dumps(payload, option=orjson.OPT_SORT_KEYS))
            try:
                if curr_hash != prev_hash:
                    await asyncio.wait_for(
                        ws.send_json({"type": "full", "data": payload}),
                        timeout=5,
                    )
                    prev_hash = curr_hash
                else:
                    await asyncio.wait_for(
                        ws.send_json({"type": "heartbeat"}),
                        timeout=5,
                    )
            except (asyncio.TimeoutError, Exception):
                break

            await asyncio.sleep(3)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS public 连接异常: %s", e)
    finally:
        recv_task.cancel()
        _public_ws_count = max(0, _public_ws_count - 1)