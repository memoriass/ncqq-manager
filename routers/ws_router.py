"""
WebSocket 路由 - 实时事件推送 + 日志流

端点：
  /ws/events         — 管理员专用（需认证），推送全量容器状态
  /ws/public         — 公开端点（无需认证），推送容器列表 + QR 状态，支持按需分页订阅
  /ws/logs/{name}    — 管理员专用，推送容器日志流
  /ws/onebot/v11/ws  — OneBot v11 反向 WS 接收端点（BS 默认目标），用于 Bot 掉线检测
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
from middleware.rate_limiter import websocket_public_speed_limit

router = APIRouter(tags=["websocket"])

_MAX_PUBLIC_WS = 50  # 公开 WS 最大并发连接数


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


def _build_public_version(sub_page: int, sub_page_size: int) -> tuple:
    tick = state_engine.health_info.get("tick", 0)
    return (sub_page, sub_page_size, tick)


def _resolve_ws_token(ws: WebSocket) -> str:
    """从 cookie 中提取认证 token。
    httpOnly cookie 无法被前端 JS 读取，但浏览器在 WS 握手时会自动携带。
    """
    return ws.cookies.get("auth_token", "")


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    """容器状态实时推送 — 从状态引擎读内存快照，零 Docker API 调用。"""
    effective_token = _resolve_ws_token(ws)
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
):
    """容器日志实时流推送"""
    effective_token = _resolve_ws_token(ws)
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
    ws_public_limiter = websocket_public_speed_limit(1.0)
    if not await ws_public_limiter(ws):
        await ws.close(code=4429, reason="Rate limited")
        return

    if not await ws_manager.connect_if_available(ws, _MAX_PUBLIC_WS):
        await ws.close(code=4429, reason="Too many connections")
        return

    # 默认推送全量（向后兼容），客户端可发 subscribe 切换分页
    sub_page = 0       # 0 = 全量模式
    sub_page_size = 20
    prev_version: tuple | None = None

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
            curr_version = _build_public_version(sub_page, sub_page_size)

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

            try:
                if curr_version != prev_version:
                    await asyncio.wait_for(
                        ws.send_json({"type": "full", "data": payload}),
                        timeout=5,
                    )
                    prev_version = curr_version
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
        await ws_manager.disconnect(ws)


# ============ OneBot v11 反向 WS — BS 默认目标端点 ============

@router.websocket("/ws/onebot/v11/ws")
async def ws_onebot_receiver(ws: WebSocket):
    """OneBot v11 反向 WS 接收端点。

    作为 BotShepherd 的默认 target_endpoint，接收来自 BS 转发的 OneBot 事件。
    主要用途：
      1. 解析 meta_event.heartbeat → 更新 bot_heartbeat 在线状态表
      2. 解析 meta_event.lifecycle → 记录 connect / disconnect 事件
      3. 无其他业务逻辑，不转发消息（纯状态监听）

    认证：不校验 token（BS 侧已持有 NapCat 的认证，管理器只做被动接收）
    """
    from services.bot_heartbeat import bot_heartbeat

    await ws.accept()
    # 头部 self_id 仅作初始提示；实际 key 统一从事件体提取（见 _sid 规范化）
    header_sid = ws.headers.get("x-self-id") or ws.headers.get("X-Self-Id")
    logger.info("OneBot WS 端点：新连接 header_self_id=%s client=%s",
                header_sid, ws.client)

    # 记录本次连接曾见过的所有 sid（用于连接断开时批量置离线）
    seen_sids: set = set()

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=120)
            except asyncio.TimeoutError:
                # 超过 2 分钟无消息，发 ping 保活
                try:
                    await ws.send_json({"type": "ping"})
                except Exception:
                    break
                continue

            try:
                event = orjson.loads(raw)
            except Exception:
                continue

            # 从事件体优先提取 self_id，兜底用头部（_sid 统一规范为 str）
            raw_sid = event.get("self_id") or header_sid
            if not raw_sid:
                continue
            sid = str(raw_sid)
            seen_sids.add(sid)

            post_type = event.get("post_type", "")
            meta_type = event.get("meta_event_type", "")

            if post_type == "meta_event":
                if meta_type == "heartbeat":
                    interval_ms = event.get("interval", 30000)
                    status_data = event.get("status", {})
                    bot_heartbeat.on_heartbeat(sid, interval_ms, status_data)
                    logger.debug("Bot 心跳: self_id=%s online=%s", sid, status_data.get("online"))
                elif meta_type == "lifecycle":
                    sub_type = event.get("sub_type", "")
                    if sub_type == "connect":
                        bot_heartbeat.on_connect(sid)
                        logger.info("Bot 连接: self_id=%s", sid)
                    elif sub_type == "disconnect":
                        bot_heartbeat.on_disconnect(sid)
                        logger.info("Bot 断开: self_id=%s", sid)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("OneBot WS 端点异常: %s", e)
    finally:
        # WS 链路断开 ≠ Bot 掉线（BS 会在约 3s 内重连）
        # 仅标记断开时间，掉线判定依赖心跳超时而非连接事件
        for sid in seen_sids:
            bot_heartbeat.on_ws_lost(sid)
        logger.info("OneBot WS 端点：连接关闭 seen_sids=%s", seen_sids)