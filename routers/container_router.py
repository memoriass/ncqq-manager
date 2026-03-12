"""
容器管理路由 - CRUD + 操作 + 统计 + 日志 + QR + 配置

v6: CRUD 异步化 — 本地操作改用 async_docker_manager (aiodocker)，
    消除 run_in_threadpool + docker-py 同步阻塞。
    远程节点操作仍走 run_in_threadpool + requests（待后续 aiohttp 化）。
"""
import os
import re
import base64
import requests as http_requests

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from middleware.auth import get_current_user, require_admin, check_instance_permission
from middleware.rate_limiter import speed_limit
from services.config import app_config, get_data_dir
from services.docker_manager import docker_manager, read_login_cache
from services.docker_async import async_docker_manager
from services.cluster_manager import cluster_manager
from services.container_state import state_engine
from services.instance_subsystem import instance_subsystem
from services.operation_logger import operation_logger
from services.log import logger

router = APIRouter(prefix="/api", tags=["containers"])

# 容器名称校验：仅允许字母、数字、连字符、下划线、点号，1-64 字符
_CONTAINER_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


class CreateRequest(BaseModel):
    name: str
    node_id: str = "local"
    # 高级选项（均有默认值，快速创建无需填写）
    docker_image: str = ""          # 空则取全局配置
    webui_port: int = 0             # 0 = 自动分配
    http_port: int = 0
    ws_port: int = 0
    memory_limit: int = 0           # MB, 0 = 不限制
    restart_policy: str = "always"  # always / unless-stopped / on-failure / no
    network_mode: str = "bridge"    # bridge / host / none
    env_vars: list = []             # ["KEY=VALUE", ...]


class DeleteRequest(BaseModel):
    delete_data: bool = False       # 是否同时删除本地映射数据


class ConfigRequest(BaseModel):
    content: str


def _safe_path(base: str, *parts: str) -> str:
    """安全路径构建 - 防止路径遍历"""
    joined = os.path.join(base, *parts)
    real = os.path.realpath(joined)
    real_base = os.path.realpath(base)
    if not real.startswith(real_base):
        raise HTTPException(status_code=400, detail="Invalid path: directory traversal detected")
    return real


# ============ 公开容器状态（无需认证） ============

@router.get("/public/containers")
async def api_public_containers():
    """公开容器列表 — 从状态引擎读内存快照，零阻塞。"""
    containers = state_engine.get_containers()
    result = []
    for c in containers:
        result.append({
            "id": c.get("id", ""),
            "name": c["name"],
            "status": c["status"],
            "node_id": c.get("node_id", "local"),
            "uin": c.get("uin", ""),
        })
    return {"status": "ok", "containers": result}


@router.get("/public/qr/batch")
async def api_batch_qr_status():
    """批量获取所有容器的 QR 状态 — 从状态引擎读内存快照，零阻塞。"""
    return {"status": "ok", "items": state_engine.get_qr_states()}


@router.get("/public/containers/page")
async def api_paged_containers(
    page: int = 1, page_size: int = 20,
    status: str = None, keyword: str = None,
):
    """分页查询容器列表 — 纯内存操作 <1ms。
    借鉴 MCSM 的 instance/select 分页模式。
    """
    return instance_subsystem.query(
        status=status, keyword=keyword,
        page=page, page_size=page_size,
    )


# ============ 容器列表 ============

@router.get("/containers")
async def api_list_containers(session: dict = Depends(get_current_user)):
    """管理员容器列表 — 从状态引擎读内存快照。"""
    containers = state_engine.get_containers()
    return {"status": "ok", "containers": containers}


# ============ 创建容器 ============

@router.post("/containers", dependencies=[Depends(speed_limit(5.0))])
async def api_create_container(
    req: CreateRequest, request: Request,
    session: dict = Depends(require_admin),
):
    # 校验容器名称格式
    if not _CONTAINER_NAME_RE.match(req.name):
        raise HTTPException(
            status_code=400,
            detail="容器名称只能包含字母、数字、连字符、下划线和点号，长度 1-64 字符，且必须以字母或数字开头",
        )

    if req.node_id != "local":
        nodes = cluster_manager.get_nodes()
        node = next((n for n in nodes if n["id"] == req.node_id), None)
        if not node:
            raise HTTPException(status_code=400, detail="Invalid node_id")
        addr = cluster_manager._normalize_address(node["address"])
        resp = await run_in_threadpool(
            lambda: http_requests.post(
                f"{addr}/api/containers",
                headers={"x-request-api-key": node["api_key"]},
                json={"name": req.name, "node_id": "local"},
                timeout=5,
            )
        )
        return resp.json()

    # 本地创建
    data_dir = os.path.join(get_data_dir(), req.name)
    qq_data_dir = os.path.join(data_dir, "qq_data")
    config_dir = os.path.join(data_dir, "config")
    plugins_dir = os.path.join(data_dir, "plugins")
    cache_dir = os.path.join(data_dir, "cache")
    os.makedirs(qq_data_dir, exist_ok=True)
    os.makedirs(config_dir, exist_ok=True)
    os.makedirs(plugins_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)

    volumes = {
        qq_data_dir: {"bind": "/app/.config/QQ", "mode": "rw"},
        config_dir: {"bind": "/app/napcat/config", "mode": "rw"},
        plugins_dir: {"bind": "/app/napcat/plugins", "mode": "rw"},
        cache_dir: {"bind": "/app/napcat/cache", "mode": "rw"},
    }

    # 端口分配：用户指定 > 自动递增（异步获取已用端口）
    used_ports = await async_docker_manager.get_used_ports()
    webui_base = app_config.get("webui_base_port", 6000)
    http_base = app_config.get("http_base_port", 3000)
    ws_base = app_config.get("ws_base_port", 3001)

    webui_port = req.webui_port if req.webui_port > 0 else docker_manager.find_available_port(webui_base, used_ports)
    used_ports.add(webui_port)
    http_port = req.http_port if req.http_port > 0 else docker_manager.find_available_port(http_base, used_ports)
    used_ports.add(http_port)
    ws_port = req.ws_port if req.ws_port > 0 else docker_manager.find_available_port(ws_base, used_ports)

    ports = {
        "6099/tcp": webui_port,
        "3000/tcp": http_port,
        "3001/tcp": ws_port,
    }

    docker_image = req.docker_image or app_config.get("docker_image", "mlikiowa/napcat-docker:latest")

    # 高级参数传递
    env = {"ACCOUNT": ""}
    for item in (req.env_vars or []):
        if "=" in item:
            k, v = item.split("=", 1)
            env[k] = v

    restart_policy = {"Name": req.restart_policy} if req.restart_policy and req.restart_policy != "no" else {"Name": "always"}

    # 异步创建容器 — aiodocker（零线程）
    cid = await async_docker_manager.create_container(
        name=req.name, image=docker_image,
        volumes=volumes, ports=ports,
        environment=env,
        restart_policy=restart_policy,
        mem_limit=f"{req.memory_limit}m" if req.memory_limit > 0 else None,
        network_mode=req.network_mode if req.network_mode != "bridge" else None,
    )
    if not cid:
        raise HTTPException(status_code=500, detail="Failed to create container")

    docker_manager.invalidate_containers_cache()
    state_engine.notify_change()

    operation_logger.info("container_create", {
        "operator_ip": request.client.host if request.client else "unknown",
        "operator_name": session["userName"],
        "container_name": req.name,
        "node_id": req.node_id,
        "ports": {"webui": webui_port, "http": http_port, "ws": ws_port},
    })
    return {"status": "ok", "container_id": cid, "ports": {"webui": webui_port, "http": http_port, "ws": ws_port}}


# ============ 容器操作 (启动/停止/重启/删除...) ============

@router.post("/containers/{name}/action", dependencies=[Depends(speed_limit(2.0))])
async def api_container_action(
    name: str, action: str,
    node_id: str = "local",
    delete_data: bool = False,
    request: Request = None,
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")

    # 本地操作走 aiodocker 纯异步；远程操作走 cluster_manager（run_in_threadpool）
    if node_id == "local":
        success = await async_docker_manager.action_container(name, action)
    else:
        success = await run_in_threadpool(cluster_manager.action_container, node_id, name, action)
    if not success:
        raise HTTPException(status_code=500, detail="Action failed")

    # 容器状态已变更 → 立即唤醒状态引擎刷新
    docker_manager.invalidate_containers_cache()
    state_engine.notify_change()

    # 删除时可选清理本地数据目录
    if action == "delete" and delete_data and node_id == "local":
        import shutil
        data_dir = os.path.join(get_data_dir(), name)
        if os.path.exists(data_dir):
            shutil.rmtree(data_dir, ignore_errors=True)
            logger.info("已删除本地数据目录: %s", data_dir)

    operation_logger.info("container_action", {
        "operator_ip": request.client.host if request.client else "unknown",
        "operator_name": session["userName"],
        "container_name": name,
        "action": action,
        "node_id": node_id,
        "delete_data": delete_data,
    })
    return {"status": "ok"}


# ============ 容器统计 ============

@router.get("/containers/stats/batch")
async def get_batch_stats(session: dict = Depends(get_current_user)):
    """批量获取所有容器的统计信息 — 从状态引擎读内存快照，零阻塞。"""
    all_stats = state_engine.get_all_stats()
    # 权限过滤
    containers = state_engine.get_containers()
    stats_map = {}
    for c in containers:
        name = c["name"]
        node_id = c.get("node_id", "local")
        if c.get("status") != "running":
            continue
        if not check_instance_permission(session, node_id, name):
            continue
        stats_data = all_stats.get(name)
        if stats_data:
            stats_map[name] = stats_data
    return {"status": "ok", "stats": stats_map}


@router.get("/containers/{name}/stats")
async def get_container_stats(
    name: str, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    return await run_in_threadpool(cluster_manager.get_stats, node_id, name)


# ============ 容器日志 ============

@router.get("/containers/{name}/logs")
async def get_container_logs(
    name: str, lines: int = 100, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    # 本地日志走 aiodocker 纯异步；远程走 cluster_manager
    if node_id == "local":
        logs = await async_docker_manager.get_logs(name, lines)
    else:
        logs = await run_in_threadpool(cluster_manager.get_logs, node_id, name, lines)
    return {"status": "ok", "logs": logs}


@router.get("/containers/{name}/logs/download")
async def download_container_logs(
    name: str, lines: int = 2000, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    """下载容器日志为纯文本文件"""
    if not check_instance_permission(session, node_id, name):
        raise HTTPException(status_code=403, detail="No permission for this instance")
    if node_id == "local":
        logs = await async_docker_manager.get_logs(name, lines)
    else:
        logs = await run_in_threadpool(cluster_manager.get_logs, node_id, name, lines)
    import time
    ts = time.strftime("%Y%m%d_%H%M%S")
    filename = f"{name}_logs_{ts}.txt"
    return PlainTextResponse(
        content=logs or "",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============ QR 码 ============

@router.get("/containers/{name}/qrcode")
async def get_qr_code(
    name: str, node_id: str = "local"
):
    """二维码接口（无需认证）。

    策略：缓存优先 → 文件 → 主动探测 → 日志回落。
    - 步骤 0: 读内存缓存（零阻塞）
    - 步骤 1: 读本地 qrcode.png（文件新鲜 <120s 且 <30s → 直接返回；>30s → 主动探测登录）
    - 步骤 2: 文件不存在/过期 → 触发 check_login_status（带 8s TTL 缓存保护）
    - 步骤 3: 回落从 Docker 日志提取二维码 URL
    """
    import re

    if node_id != "local":
        result = await run_in_threadpool(cluster_manager.get_qr_status, node_id, name)
        if result:
            return result
        return {"status": "waiting"}

    # 0. 只读内存缓存判断是否已登录（不触发任何 API 调用，零阻塞）
    cached = read_login_cache(name)
    if cached.get("logged_in"):
        return {"status": "logged_in", "uin": cached.get("uin", "")}

    # 1. 优先读本地挂载目录中的二维码文件（NapCat 未登录时持续输出）
    import time as _time
    qr_file_fresh = False
    try:
        qr_path = os.path.join(get_data_dir(), name, "cache", "qrcode.png")
        if os.path.exists(qr_path):
            age = _time.time() - os.path.getmtime(qr_path)
            if age < 120:
                qr_file_fresh = True
                # 文件新鲜（2 分钟内更新过）→ NapCat 正在输出二维码 → 未登录
                with open(qr_path, "rb") as f:
                    data = base64.b64encode(f.read()).decode("utf-8")
                # 如果文件已经超过 30s 没更新，可能刚登录成功 → 主动探测一次
                if age > 30:
                    login = await run_in_threadpool(docker_manager.check_login_status, name)
                    if login.get("logged_in"):
                        return {"status": "logged_in", "uin": login.get("uin", "")}
                return {"status": "ok", "url": f"data:image/png;base64,{data}", "type": "file"}
            # 文件已过期（超过 2 分钟未更新）→ 可能已登录，不返回旧二维码
    except Exception as e:
        logger.debug(f"读取本地二维码文件失败: {e}")

    # 2. 文件不存在/过期 → 主动触发登录检测（5s 轮询场景，开销可接受）
    if not qr_file_fresh:
        try:
            login = await run_in_threadpool(docker_manager.check_login_status, name)
            if login.get("logged_in"):
                return {"status": "logged_in", "uin": login.get("uin", "")}
        except Exception:
            pass

    # 3. 回落：从 Docker 日志提取二维码 URL
    try:
        if docker_manager.client:
            container = docker_manager.client.containers.get(name)
            if container.status != "running":
                return {"status": "waiting"}
            logs = container.logs(tail=50).decode('utf-8', errors='ignore')
            qr_url_match = re.search(r'二维码解码URL:\s*(https://[^\s]+)', logs)
            if qr_url_match:
                return {"status": "ok", "url": qr_url_match.group(1), "type": "log"}
    except Exception as e:
        logger.debug(f"从日志获取二维码失败: {e}")

    return {"status": "waiting"}


# ============ 登录状态刷新（用户主动触发） ============

@router.post("/containers/{name}/refresh-login")
async def refresh_login_status(
    name: str, node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    """用户主动刷新登录状态。
    立即触发 A(OneBot) → B(WebUI) 级联检测，跳过缓存。
    """
    if node_id != "local":
        # 远程节点暂不支持，返回未知状态
        return {"status": "ok", "logged_in": False, "method": "remote_unsupported"}

    login = await run_in_threadpool(docker_manager.check_login_status, name, True)
    # 强制刷新后通知引擎立即同步
    state_engine.notify_change()
    return {
        "status": "ok",
        "logged_in": login.get("logged_in", False),
        "uin": login.get("uin", ""),
        "nickname": login.get("nickname", ""),
        "method": login.get("method", ""),
    }


# ============ 插件事件端点（方案 C 预留） ============

@router.post("/internal/login-event")
async def receive_login_event(request: Request):
    """方案 C 预留：NapCat 插件推送登录/登出事件。
    插件在容器内通过 HTTP 回调此端点，直接更新后端缓存。
    需要 x-internal-key 头验证（防止外部滥用）。
    """
    # 简单的内部 API Key 验证
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


# ============ 配置文件读写 ============

@router.get("/containers/{name}/config/{filename:path}")
def read_container_config(
    name: str, filename: str,
    session: dict = Depends(get_current_user),
):
    file_path = _safe_path(get_data_dir(), name, filename)
    if not os.path.exists(file_path):
        return {"status": "not_found", "content": ""}
    with open(file_path, "r", encoding="utf-8") as f:
        return {"status": "ok", "content": f.read()}


@router.post("/containers/{name}/config/{filename:path}")
def save_container_config(
    name: str, filename: str, req: ConfigRequest,
    request: Request = None,
    session: dict = Depends(get_current_user),
):
    file_path = _safe_path(get_data_dir(), name, filename)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(req.content)
    operation_logger.info("config_save", {
        "operator_ip": request.client.host if request.client else "unknown",
        "operator_name": session["userName"],
        "container_name": name,
        "filename": filename,
    })
    return {"status": "ok"}


# ============ 文件管理 ============

@router.get("/containers/{name}/files")
def list_container_files(
    name: str, path: str = "",
    session: dict = Depends(get_current_user),
):
    target_dir = _safe_path(get_data_dir(), name, path)
    if not os.path.exists(target_dir):
        return {"status": "ok", "files": [], "folders": [], "current_path": path}

    files = []
    folders = []
    if os.path.isdir(target_dir):
        for f in os.listdir(target_dir):
            f_path = os.path.join(target_dir, f)
            if os.path.isfile(f_path):
                stat = os.stat(f_path)
                files.append({"name": f, "size": stat.st_size, "mtime": stat.st_mtime})
            elif os.path.isdir(f_path):
                folders.append({"name": f})
    return {"status": "ok", "files": files, "folders": folders, "current_path": path}
