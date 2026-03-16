"""
容器配置与文件路由 - 配置读写 / 文件列表
"""

import os

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from middleware.auth import get_current_user
from services.config import get_data_dir
from services.operation_logger import operation_logger

router = APIRouter(prefix="/api", tags=["containers"])


class ConfigRequest(BaseModel):
    content: str


def _safe_path(base: str, *parts: str) -> str:
    """安全路径构建 - 防止路径遍历。"""
    joined = os.path.join(base, *parts)
    real = os.path.realpath(joined)
    real_base = os.path.realpath(base)
    if not real.startswith(real_base):
        raise HTTPException(status_code=400, detail="Invalid path: directory traversal detected")
    return real


@router.get("/containers/{name}/config/{filename:path}")
def read_container_config(
    name: str,
    filename: str,
    session: dict = Depends(get_current_user),
):
    file_path = _safe_path(get_data_dir(), name, filename)
    if not os.path.exists(file_path):
        return {"status": "not_found", "content": ""}
    with open(file_path, "r", encoding="utf-8") as file_handle:
        return {"status": "ok", "content": file_handle.read()}


@router.post("/containers/{name}/config/{filename:path}")
def save_container_config(
    name: str,
    filename: str,
    req: ConfigRequest,
    request: Request,
    session: dict = Depends(get_current_user),
):
    file_path = _safe_path(get_data_dir(), name, filename)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as file_handle:
        file_handle.write(req.content)
    operation_logger.info("config_save", {
        "operator_ip": request.client.host if request.client else "unknown",
        "operator_name": session["userName"],
        "container_name": name,
        "filename": filename,
    })
    return {"status": "ok"}


@router.get("/containers/{name}/files")
def list_container_files(
    name: str,
    path: str = "",
    session: dict = Depends(get_current_user),
):
    target_dir = _safe_path(get_data_dir(), name, path)
    if not os.path.exists(target_dir):
        return {"status": "ok", "files": [], "folders": [], "current_path": path}

    files = []
    folders = []
    if os.path.isdir(target_dir):
        for entry_name in os.listdir(target_dir):
            entry_path = os.path.join(target_dir, entry_name)
            if os.path.isfile(entry_path):
                stat = os.stat(entry_path)
                files.append({"name": entry_name, "size": stat.st_size, "mtime": stat.st_mtime})
            elif os.path.isdir(entry_path):
                folders.append({"name": entry_name})
    return {"status": "ok", "files": files, "folders": folders, "current_path": path}

