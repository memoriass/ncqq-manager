"""
WebSocket 路由 - 实时事件推送 + 日志流

端点：
  /ws/events         — 管理员专用（需认证），推送全量容器状态
  /ws/public         — 公开端点（无需认证），推送容器列表 + QR 状态，支持按需分页订阅
  /ws/logs/{name}    — 管理员专用，推送容器日志流
  /ws/onebot/v11/ws  — OneBot v11 反向 WS 接收端点（BS 默认目标），用于 Bot 掉线检测
  /ws/napcat/{name}  — 带容器名的主路径端点，支持 NapCatApiProxy 主动 API 调用
  /ws/plugin/{name}  — 插件持久 WS 链接，接收 login/logout/heartbeat 推送（密钥鉴权）
"""

import asyncio
import re
import time
from collections import defaultdict

import orjson

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from starlette.concurrency import run_in_threadpool
from services.config import app_config

from services.ws_manager import ws_manager
from services.cluster_manager import cluster_manager
from services.instance_subsystem import instance_subsystem
from services.log import logger
from services.container_state import state_engine
from services.ob11_events import (
    parse_ob11_event,
    OB11Event,
    HeartbeatEvent,
    LifecycleEvent,
    BotOfflineNotice,
    MessageEvent,
    GroupMessageEvent,
    PrivateMessageEvent,
)
from middleware.auth import validate_token_value, check_instance_permission
from middleware.rate_limiter import websocket_public_speed_limit

router = APIRouter(tags=["websocket"])

_MAX_PUBLIC_WS = 50  # 公开 WS 最大并发连接数
_MAX_PUBLIC_WS_PER_IP = 5  # 单 IP 最大并发公开 WS 连接数
_public_ws_per_ip: defaultdict[str, int] = defaultdict(int)


def _build_snapshot(containers: list) -> dict:
    """构建容器快照字典（用于增量 diff 比较）。key=name, value=精简状态。"""
    snap = {}
    for c in containers:
        snap[c["name"]] = {
            "status": c.get("status", ""),
            "uin": c.get("uin", ""),
            "node_id": c.get("node_id", "local"),
            "bot_online": c.get("bot_online", False),
        }
    return snap


def _diff_containers(prev: list, curr: list) -> dict | None:
    """计算容器列表增量。返回 None 表示无变化。"""
    prev_map = {c["name"]: c for c in prev}
    curr_map = {c["name"]: c for c in curr}
    added = [c for name, c in curr_map.items() if name not in prev_map]
    removed = [name for name in prev_map if name not in curr_map]
    updated = [
        c for name, c in curr_map.items()
        if name in prev_map and c != prev_map[name]
    ]
    if not added and not removed and not updated:
        return None
    return {"added": added, "removed": removed, "updated": updated}


def _diff_qr(prev: dict, curr: dict) -> dict | None:
    """计算 QR 状态增量。返回 None 表示无变化。"""
    changed = {k: v for k, v in curr.items() if prev.get(k) != v}
    removed = [k for k in prev if k not in curr]
    if not changed and not removed:
        return None
    return {"changed": changed, "removed": removed}


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
            containers = state_engine.get_containers()
            curr_snapshot = _build_snapshot(containers)

            try:
                if curr_snapshot != prev_snapshot:
                    await asyncio.wait_for(
                        ws.send_json({"type": "containers", "data": containers}),
                        timeout=5,
                    )
                    prev_snapshot = curr_snapshot
            except (asyncio.TimeoutError, Exception):
                break

            # 等待状态变更或超时（替代固定 sleep 轮询）
            changed = await state_engine.wait_for_change(timeout=10.0)
            if not changed:
                # 超时无变更 → 发心跳保活
                try:
                    await asyncio.wait_for(
                        ws.send_json({"type": "heartbeat"}), timeout=5
                    )
                except (asyncio.TimeoutError, Exception):
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS events 连接异常: %s", e)
    finally:
        await ws_manager.disconnect(ws)


@router.websocket("/ws/logs/{name}")
async def ws_container_logs(
    ws: WebSocket,
    name: str,
    node_id: str = Query(default="local"),
):
    """容器日志实时流推送"""
    effective_token = _resolve_ws_token(ws)
    session = validate_token_value(effective_token) if effective_token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    if not check_instance_permission(session, node_id, name):
        await ws.close(code=4003, reason="No permission for this instance")
        return

    await ws.accept()
    try:
        while True:
            try:
                if node_id == "local":
                    from services.docker_async import async_docker_manager
                    logs = await asyncio.wait_for(
                        async_docker_manager.get_logs(name, 200), timeout=8,
                    )
                else:
                    logs = await asyncio.wait_for(
                        run_in_threadpool(cluster_manager.get_logs, node_id, name, 200),
                        timeout=8,
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


@router.websocket("/ws/bot_messages/{name}")
async def ws_bot_messages(ws: WebSocket, name: str):
    """Bot 消息实时推送 — 仅在管理页面打开时连接，离开即断开。

    连接后先推送缓冲区全量历史，之后每当有新消息到达时实时推送增量。
    无新消息时每 15s 发心跳保活。
    """
    effective_token = _resolve_ws_token(ws)
    session = validate_token_value(effective_token) if effective_token else None
    if not session:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()

    from services.napcat_ws_service import napcat_ws_service

    # 先推送当前缓冲区全量（oldest-first）
    messages = napcat_ws_service.get_messages(name, 200)
    messages.reverse()  # get_messages 返回 newest-first，翻转为 oldest-first
    try:
        await asyncio.wait_for(
            ws.send_json({"type": "history", "messages": messages}), timeout=5
        )
    except (asyncio.TimeoutError, Exception):
        return

    # 记录已推送的最新 message_id，用于增量推送
    last_pushed_id = messages[-1]["message_id"] if messages else None

    try:
        while True:
            has_new = await napcat_ws_service.wait_for_message(name, timeout=15.0)
            if not has_new:
                # 超时无新消息 → 发心跳保活
                try:
                    await asyncio.wait_for(
                        ws.send_json({"type": "heartbeat"}), timeout=5
                    )
                except (asyncio.TimeoutError, Exception):
                    break
                continue

            # 有新消息，取增量
            all_msgs = napcat_ws_service.get_messages(name, 200)
            all_msgs.reverse()
            if last_pushed_id is not None:
                new_msgs = []
                found = False
                for m in all_msgs:
                    if found:
                        new_msgs.append(m)
                    elif m["message_id"] == last_pushed_id:
                        found = True
                if not found:
                    new_msgs = all_msgs
            else:
                new_msgs = all_msgs

            if new_msgs:
                last_pushed_id = new_msgs[-1]["message_id"]
                try:
                    await asyncio.wait_for(
                        ws.send_json({"type": "messages", "messages": new_msgs}), timeout=5
                    )
                except (asyncio.TimeoutError, Exception):
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS bot_messages 连接异常 [%s]: %s", name, e)


# ============ 公开 WS — 无需认证，推送容器列表 + QR 状态 ============


@router.websocket("/ws/public")
async def ws_public(ws: WebSocket):
    """公开 WS 端点 — 用户面板专用，推送容器列表 + QR 状态。

    协议：
      服务端 → 客户端：
        {"type": "full",      "data": {"containers": [...], "qr": {...}}}
        {"type": "patch",     "data": {"containers": {"added":[], "removed":[], "updated":[]}, "qr": {"changed":{}, "removed":[]}}}
        {"type": "heartbeat"}
      客户端 → 服务端（可选，按需订阅分页）：
        {"type": "subscribe", "page": 1, "pageSize": 20}
    """
    ws_public_limiter = websocket_public_speed_limit(1.0)
    if not await ws_public_limiter(ws):
        await ws.close(code=4429, reason="Rate limited")
        return

    client_ip = ws.client.host if ws.client else "unknown"
    if _public_ws_per_ip[client_ip] >= _MAX_PUBLIC_WS_PER_IP:
        await ws.close(code=4429, reason="Too many connections from this IP")
        return

    if not await ws_manager.connect_if_available(ws, _MAX_PUBLIC_WS):
        await ws.close(code=4429, reason="Too many connections")
        return

    _public_ws_per_ip[client_ip] += 1

    # 默认推送全量（向后兼容），客户端可发 subscribe 切换分页
    sub_page = 0  # 0 = 全量模式
    sub_page_size = 20

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
    prev_containers: list = []
    prev_qr: dict = {}
    first_push = True
    try:
        while True:
            # 构建推送数据
            if sub_page > 0:
                page_result = instance_subsystem.query(
                    page=sub_page, page_size=sub_page_size
                )
                containers = page_result["data"]
                qr_states = {}
                for item in containers:
                    inst = instance_subsystem.get(item["name"])
                    if inst:
                        qr_states[item["name"]] = inst.to_qr_dict()
            else:
                containers = state_engine.get_containers()
                qr_states = state_engine.get_qr_states()

            try:
                if first_push:
                    # 首次全量推送
                    payload = {"containers": containers, "qr": qr_states}
                    await asyncio.wait_for(
                        ws.send_json({"type": "full", "data": payload}),
                        timeout=5,
                    )
                    first_push = False
                else:
                    # 增量推送
                    c_diff = _diff_containers(prev_containers, containers)
                    q_diff = _diff_qr(prev_qr, qr_states)
                    if c_diff or q_diff:
                        patch: dict = {}
                        if c_diff:
                            patch["containers"] = c_diff
                        if q_diff:
                            patch["qr"] = q_diff
                        await asyncio.wait_for(
                            ws.send_json({"type": "patch", "data": patch}),
                            timeout=5,
                        )
            except (asyncio.TimeoutError, Exception):
                break

            prev_containers = containers
            prev_qr = qr_states

            # 事件驱动等待
            changed = await state_engine.wait_for_change(timeout=10.0)
            if not changed:
                try:
                    await asyncio.wait_for(
                        ws.send_json({"type": "heartbeat"}), timeout=5
                    )
                except (asyncio.TimeoutError, Exception):
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WS public 连接异常: %s", e)
    finally:
        recv_task.cancel()
        _public_ws_per_ip[client_ip] -= 1
        if _public_ws_per_ip[client_ip] <= 0:
            _public_ws_per_ip.pop(client_ip, None)
        await ws_manager.disconnect(ws)


# ============ OneBot v11 反向 WS — BS 默认目标端点 ============
# 同时支持：
#   /ws/onebot/v11/ws           — 旧兼容路径（无容器归属，依赖 header self_id）
#   /ws/napcat/{name}           — 新路径（携带容器名，接入 napcat_ws_service）


def _handle_ob11_event(
    event: dict,
    name: str,
    header_sid: str | None,
    seen_sids: set,
    ws_ref: "WebSocket | None" = None,
) -> None:
    """
    解析单条 OneBot 事件并分发至 bot_heartbeat / napcat_ws_service / message_buffer。
    使用 ob11_events 结构化解析，类型安全。
    name 为空字符串时退化为旧兼容模式（纯 bot_heartbeat）。
    """
    from services.bot_heartbeat import bot_heartbeat
    from services.napcat_ws_service import napcat_ws_service

    parsed = parse_ob11_event(event, fallback_sid=header_sid or "")
    if parsed is None:
        return
    sid = parsed.self_id
    seen_sids.add(sid)

    # ★ 核心修复：事件中的 self_id 是真实 uin，补全到 WS 注册表
    if name:
        napcat_ws_service.ensure_uin(name, sid, ws=ws_ref)

    if isinstance(parsed, HeartbeatEvent):
        bot_heartbeat.on_heartbeat(sid, parsed.interval, parsed.status)
        if name:
            napcat_ws_service.on_heartbeat(name, parsed.online)
        logger.debug(
            "Bot 心跳: name=%s self_id=%s online=%s", name or "?", sid, parsed.online
        )

    elif isinstance(parsed, LifecycleEvent):
        if parsed.sub_type == "connect":
            bot_heartbeat.on_connect(sid)
            logger.info(
                "Bot lifecycle.connect: name=%s self_id=%s", name or "?", sid
            )
        elif parsed.sub_type == "disconnect":
            bot_heartbeat.on_disconnect(sid)
            # ★ 同步到 napcat_ws_service，标记 hb_online=False
            if name:
                napcat_ws_service.on_heartbeat(name, False)
            logger.info(
                "Bot lifecycle.disconnect: name=%s self_id=%s", name or "?", sid
            )

    elif isinstance(parsed, BotOfflineNotice):
        bot_heartbeat.on_disconnect(sid)
        # ★ 关键修复：bot_offline 同步到 napcat_ws_service，设置 hb_online=False
        if name:
            napcat_ws_service.on_heartbeat(name, False)
        logger.info(
            "Bot offline notice: name=%s self_id=%s tag=%s msg=%s",
            name or "?", sid, parsed.tag, parsed.message,
        )

    elif isinstance(parsed, MessageEvent):
        # ★ 新增：消息事件写入监控缓冲区
        if name:
            napcat_ws_service.push_message(name, parsed)
        if isinstance(parsed, GroupMessageEvent):
            logger.debug(
                "群消息: name=%s group=%s user=%s msg_id=%d",
                name or "?", parsed.group_id, parsed.user_id, parsed.message_id,
            )
        elif isinstance(parsed, PrivateMessageEvent):
            logger.debug(
                "私聊消息: name=%s user=%s msg_id=%d",
                name or "?", parsed.user_id, parsed.message_id,
            )


async def _ob11_recv_loop(ws: WebSocket, name: str, header_sid: str | None) -> None:
    """通用接收循环，被两个端点复用。
    - 带 echo 的消息：API 响应，路由给 NapCatApiProxy（仅 named 端点有 proxy）
    - 不带 echo 的消息：OneBot 事件，分发给 _handle_ob11_event
    """
    from services.napcat_ws_service import napcat_ws_service

    seen_sids: set = set()
    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=120)
            except asyncio.TimeoutError:
                try:
                    await ws.send_json({"type": "ping"})
                except Exception:
                    break
                continue
            try:
                data = orjson.loads(raw)
            except Exception:
                continue

            # 带 echo → API 响应，路由给代理；无 echo → OneBot 事件
            if isinstance(data, dict) and data.get("echo"):
                proxy = napcat_ws_service.get_proxy(name) if name else None
                if proxy:
                    proxy.on_response(str(data["echo"]), data)
            else:
                _handle_ob11_event(data, name, header_sid, seen_sids, ws_ref=ws)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("OneBot WS 接收异常 [%s]: %s", name or "compat", e)
    finally:
        from services.bot_heartbeat import bot_heartbeat

        for sid in seen_sids:
            bot_heartbeat.on_ws_lost(sid)
        if name:
            napcat_ws_service.on_disconnect(name, ws=ws)
        logger.info("OneBot WS 断开: name=%s seen_sids=%s", name or "compat", seen_sids)


@router.websocket("/ws/napcat/{name}")
async def ws_napcat_named(ws: WebSocket, name: str):
    """
    带容器名的 NapCat 反向 WS 接入点（主路径）。

    连接建立时：
      1. 从 X-Self-Id 头 / 首条心跳事件中获取 uin
      2. 注册到 napcat_ws_service（更新 instance_subsystem 由 container_state 负责）
      3. 注册 NapCatApiProxy（支持通过此连接主动调用 OneBot API）
      4. 持续接收心跳 / lifecycle / BotOfflineEvent / API 响应
    """
    from services.napcat_ws_service import napcat_ws_service

    await ws.accept()
    header_sid = ws.headers.get("x-self-id") or ws.headers.get("X-Self-Id") or ""
    logger.info(
        "NapCat WS [%s] 新连接 header_self_id=%s client=%s", name, header_sid, ws.client
    )

    # 连接建立时先用 header_sid 预注册（事件到来前的宽限期）
    # "0" 是 BS probe_target_endpoint 探测握手的哑值，跳过避免污染注册表 uin
    is_probe = header_sid == "0"
    if header_sid and not is_probe:
        napcat_ws_service.on_connect(name, header_sid, ws=ws)

    # 注册 API 代理（复用此 WS 连接主动调用 NapCat API）
    # 探测连接不注册 proxy，避免覆盖正常连接的 proxy
    if not is_probe:
        napcat_ws_service.register_proxy(name, ws)
    try:
        await _ob11_recv_loop(ws, name, header_sid or None)
    finally:
        if not is_probe:
            napcat_ws_service.unregister_proxy(name, ws=ws)


@router.websocket("/ws/onebot/v11/ws")
async def ws_onebot_receiver(ws: WebSocket):
    """
    OneBot v11 反向 WS 兼容端点（旧路径，保持向后兼容）。

    作为 BotShepherd target_endpoint 的默认值，接收 BS 转发的 OneBot 事件。
    无容器名归属，依赖 X-Self-Id 头部做 uin 关联。
    新部署建议改用 /ws/napcat/{name} 端点。
    """
    await ws.accept()
    header_sid = ws.headers.get("x-self-id") or ws.headers.get("X-Self-Id")
    logger.info(
        "OneBot WS 兼容端点：新连接 header_self_id=%s client=%s", header_sid, ws.client
    )
    await _ob11_recv_loop(ws, "", header_sid)


_PLUGIN_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


@router.websocket("/ws/plugin/{name}")
async def ws_plugin_link(ws: WebSocket, name: str, key: str = Query(default="")):
    """
    插件持久 WS 链接 — 接收 ncqq-interlink 插件推送的 login/logout/heartbeat。

    鉴权：?key=<internal_api_key>（服务器间通信，无 cookie）。
    断连时立即置 bot_online=False，无需等待 90s 超时兜底。
    """
    expected_key = app_config.get("internal_api_key", "")
    if expected_key and key != expected_key:
        # accept 后再 close，确保发出 WebSocket close frame（非 HTTP 403）
        # 避免客户端收到 non-101 响应导致 onerror 路径进入无限重试
        await ws.accept()
        await ws.close(code=4003, reason="Invalid key")
        return
    if not _PLUGIN_NAME_RE.match(name or ""):
        await ws.accept()
        await ws.close(code=4400, reason="Invalid container name")
        return

    await ws.accept()
    logger.info("Plugin WS [%s] 已连接 client=%s", name, ws.client)

    # 连接即刷新心跳时间戳，标记在线
    inst = instance_subsystem.get(name)
    if inst:
        inst.bot_online = True
        inst.bot_heartbeat_ts = time.time()
    state_engine.notify_change()

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=120.0)
            except asyncio.TimeoutError:
                # 120s 无消息时服务端主动 ping 检测存活
                try:
                    await ws.send_text('{"type":"ping"}')
                except Exception:
                    break
                continue

            try:
                data = orjson.loads(raw)
            except Exception:
                continue

            msg_type = data.get("type", "")

            if msg_type == "login":
                from services.docker_login import LoginMixin
                LoginMixin.update_login_cache(name, {
                    "event": "login",
                    "uin": str(data.get("uin", "")),
                    "nickname": data.get("nickname", ""),
                })
                inst = instance_subsystem.get(name)
                if inst:
                    inst.bot_online = True
                    inst.bot_heartbeat_ts = time.time()
                state_engine.notify_change()
                logger.info("Plugin WS [%s] login uin=%s", name, data.get("uin"))

            elif msg_type == "logout":
                from services.docker_login import LoginMixin
                from services.alert_manager import alert_manager
                uin_str = str(data.get("uin", ""))
                LoginMixin.update_login_cache(name, {
                    "event": "logout",
                    "uin": uin_str,
                })
                inst = instance_subsystem.get(name)
                node_id = inst.node_id if inst else "local"
                if inst:
                    inst.bot_online = False
                state_engine.notify_change()
                logger.info("Plugin WS [%s] logout uin=%s reason=%s", name, data.get("uin"), data.get("reason", ""))
                # 在线状态由管理器与互联插件通讯决定，logout 即触发告警
                asyncio.create_task(alert_manager.notify_login_lost(
                    name=name, uin=uin_str, node_id=node_id,
                ))

            elif msg_type == "heartbeat":
                inst = instance_subsystem.get(name)
                if inst:
                    inst.bot_online = True
                    inst.bot_heartbeat_ts = time.time()
                    if "message_sent" in data:
                        inst.message_sent = int(data["message_sent"])
                    if "message_received" in data:
                        inst.message_received = int(data["message_received"])
                state_engine.notify_change()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("Plugin WS [%s] 异常: %s", name, e)
    finally:
        logger.info("Plugin WS [%s] 已断开", name)
        # 断连立即标记掉线，无需等 90s 超时
        inst = instance_subsystem.get(name)
        if inst:
            inst.bot_online = False
            inst.bot_heartbeat_ts = 0.0
        state_engine.notify_change()
