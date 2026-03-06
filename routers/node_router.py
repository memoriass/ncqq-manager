"""
节点管理路由 - 节点 CRUD + 状态 + 代理
"""
import uuid as uuid_mod

import requests as http_requests
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from middleware.auth import get_current_user, require_admin
from services.cluster_manager import cluster_manager
from services.config import app_config
from services.operation_logger import operation_logger

router = APIRouter(prefix="/api", tags=["nodes"])


class NodeRequest(BaseModel):
    name: str
    address: str
    api_key: str
    node_id: str = "local"


# ============ 集群配置 ============

@router.get("/cluster/config")
async def get_cluster_config(session: dict = Depends(get_current_user)):
    import sys, psutil
    return {
        "status": "ok",
        "config": {
            "docker_image": app_config.get("docker_image"),
            "webui_base_port": app_config.get("webui_base_port"),
            "http_base_port": app_config.get("http_base_port"),
            "ws_base_port": app_config.get("ws_base_port"),
            "api_key": app_config.get("api_key"),
            "data_dir": app_config.get("data_dir"),
        },
        "system": {
            "cpu_percent": psutil.cpu_percent(interval=None) or 0.1,
            "mem_percent": psutil.virtual_memory().percent,
            "platform": sys.platform,
            "python_version": sys.version.split()[0],
        },
    }


@router.post("/cluster/config")
async def save_cluster_config(
    request: Request,
    session: dict = Depends(require_admin),
):
    body = await request.json()
    allowed_keys = {"webui_base_port", "http_base_port", "ws_base_port", "docker_image", "api_key", "data_dir"}
    updates = {k: v for k, v in body.items() if k in allowed_keys}

    # 端口范围校验
    for port_key in ("webui_base_port", "http_base_port", "ws_base_port"):
        if port_key in updates:
            port_val = updates[port_key]
            if not isinstance(port_val, int) or not (1024 <= port_val <= 65535):
                raise HTTPException(
                    status_code=400,
                    detail=f"{port_key} must be an integer between 1024 and 65535",
                )

    # data_dir 合法性校验
    if "data_dir" in updates:
        data_dir = updates["data_dir"]
        if not isinstance(data_dir, str) or not data_dir.strip():
            raise HTTPException(status_code=400, detail="data_dir must be a non-empty string")
        import os as _os
        # 尝试创建目录以验证路径合法性
        try:
            _os.makedirs(data_dir, exist_ok=True)
        except OSError as e:
            raise HTTPException(status_code=400, detail=f"Invalid data_dir path: {e}")

    # docker_image 基本校验
    if "docker_image" in updates:
        img = updates["docker_image"]
        if not isinstance(img, str) or not img.strip():
            raise HTTPException(status_code=400, detail="docker_image must be a non-empty string")

    app_config.update(updates)
    return {"status": "ok"}


@router.get("/cluster/status")
async def cluster_status(session: dict = Depends(get_current_user)):
    """供远程节点健康检查用 (需 x-request-api-key 认证)"""
    import sys
    from services.daemon_monitor import daemon_monitor

    return {
        "status": "online",
        "system": {
            "cpu_percent": daemon_monitor.current_cpu,
            "mem_percent": daemon_monitor.current_mem,
            "platform": sys.platform,
            "python_version": sys.version.split()[0],
        },
        "instances": daemon_monitor.get_instance_status(),
        "chart": daemon_monitor.get_chart_data(),
    }


# ============ 节点 CRUD ============

@router.get("/nodes")
async def api_get_nodes(session: dict = Depends(get_current_user)):
    nodes = await run_in_threadpool(cluster_manager.get_nodes_with_status)
    return {"status": "ok", "nodes": nodes}


@router.post("/nodes")
async def api_add_node(
    req: NodeRequest, request: Request,
    session: dict = Depends(require_admin),
):
    new_id = "node-" + uuid_mod.uuid4().hex[:8]
    cluster_manager.add_node(new_id, req.name, req.address, req.api_key)
    operation_logger.info("node_add", {
        "operator_name": session["userName"],
        "node_name": req.name,
        "node_address": req.address,
    })
    return {"status": "ok", "node_id": new_id}


@router.put("/nodes/{node_id}")
async def api_edit_node(
    node_id: str, req: NodeRequest,
    session: dict = Depends(require_admin),
):
    cluster_manager.update_node(node_id, req.name, req.address, req.api_key or None)
    if node_id == "local" and req.api_key:
        app_config.set("api_key", req.api_key)
    return {"status": "ok"}


@router.delete("/nodes/{node_id}")
async def api_delete_node(
    node_id: str, request: Request,
    session: dict = Depends(require_admin),
):
    nodes = cluster_manager.get_nodes()
    node = next((n for n in nodes if n["id"] == node_id), None)
    cluster_manager.delete_node(node_id)
    operation_logger.warning("node_delete", {
        "operator_name": session["userName"],
        "node_id": node_id,
        "node_name": node["name"] if node else "Unknown",
    })
    return {"status": "ok"}


# ============ 节点程序日志 ============

@router.get("/node/logs")
async def get_node_logs(
    lines: int = 500,
    node_id: str = "local",
    session: dict = Depends(get_current_user),
):
    """获取节点程序运行日志（非容器日志）。

    - 本地节点：直接读取内存环形缓冲区
    - 远程节点：代理请求远程节点的 /api/node/logs
    """
    if lines < 1 or lines > 5000:
        lines = 500

    if node_id == "local" or not node_id:
        from services.log import get_node_logs as _get_logs
        return {"status": "ok", "logs": _get_logs(lines)}

    # 远程节点：通过代理获取
    resp = await run_in_threadpool(
        cluster_manager._proxy_to_node,
        node_id, "GET", f"/api/node/logs?lines={lines}",
    )
    if resp and resp.status_code == 200:
        data = resp.json()
        return {"status": "ok", "logs": data.get("logs", "")}
    return {"status": "error", "logs": ""}


# ============ 节点代理 ============

# 允许代理的路径前缀白名单
_PROXY_PATH_WHITELIST = (
    "containers",
    "cluster/status",
    "node/logs",
    "qr",
)


@router.api_route(
    "/nodes/{node_id}/proxy/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
async def proxy_node_request(
    node_id: str, path: str, request: Request,
    session: dict = Depends(get_current_user),
):
    # 路径白名单校验 - 防止泛化代理滥用
    if not any(path == prefix or path.startswith(prefix + "/") for prefix in _PROXY_PATH_WHITELIST):
        raise HTTPException(status_code=403, detail=f"Proxy path not allowed: {path}")

    nodes = cluster_manager.get_nodes()
    node = next((n for n in nodes if n["id"] == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    addr = cluster_manager._normalize_address(node["address"])
    url = f"{addr}/api/{path}"
    params = dict(request.query_params)
    body = await request.body()
    headers = {"x-request-api-key": node["api_key"]}

    def do_request():
        return http_requests.request(
            request.method, url,
            headers=headers, params=params, data=body, timeout=10,
        )

    try:
        resp = await run_in_threadpool(do_request)
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type"),
        )
    except Exception as e:
        return JSONResponse(
            content={"status": "error", "message": str(e)},
            status_code=500,
        )

