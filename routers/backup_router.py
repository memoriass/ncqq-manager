"""
备份与恢复路由 - 数据库导出/导入
"""
import os
import time
import shutil
import tempfile

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.responses import FileResponse

from middleware.auth import require_admin
from services.database import DB_PATH
from services.operation_logger import operation_logger
from services.log import logger

router = APIRouter(prefix="/api", tags=["backup"])

_MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB


@router.get("/backup/download")
async def download_backup(request: Request, session: dict = Depends(require_admin)):
    """下载数据库备份文件"""
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database not found")

    ts = time.strftime("%Y%m%d_%H%M%S")
    # 先复制一份避免锁冲突
    tmp_path = os.path.join(tempfile.gettempdir(), f"napcat_backup_{ts}.db")
    shutil.copy2(DB_PATH, tmp_path)

    operation_logger.info("backup_download", {
        "operator_name": session["userName"],
        "operator_ip": request.client.host if request.client else "unknown",
    })

    return FileResponse(
        path=tmp_path,
        filename=f"napcat_backup_{ts}.db",
        media_type="application/octet-stream",
    )


@router.post("/backup/upload")
async def upload_backup(
    request: Request,
    file: UploadFile = File(...),
    session: dict = Depends(require_admin),
):
    """上传恢复数据库备份（覆盖当前数据库，需要重启生效）"""
    if not file.filename or not file.filename.endswith(".db"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only .db files accepted.")

    # 先通过 Content-Length 快速拒绝超大文件
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {_MAX_UPLOAD_SIZE // (1024*1024)} MB.")

    content = await file.read()
    if len(content) > _MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {_MAX_UPLOAD_SIZE // (1024*1024)} MB.")
    if len(content) < 100:
        raise HTTPException(status_code=400, detail="File too small to be a valid database")

    # 备份当前数据库
    ts = time.strftime("%Y%m%d_%H%M%S")
    backup_path = DB_PATH + f".pre_restore_{ts}"
    if os.path.exists(DB_PATH):
        shutil.copy2(DB_PATH, backup_path)
        logger.info("已备份当前数据库到: %s", backup_path)

    # 写入新数据库
    with open(DB_PATH, "wb") as f:
        f.write(content)

    operation_logger.info("backup_restore", {
        "operator_name": session["userName"],
        "operator_ip": request.client.host if request.client else "unknown",
        "filename": file.filename,
    })

    return {"status": "ok", "message": "Database restored. Restart required."}


@router.get("/backup/info")
async def backup_info(session: dict = Depends(require_admin)):
    """获取当前数据库信息"""
    info = {
        "exists": os.path.exists(DB_PATH),
        "size": 0,
        "modified": "",
        "path": os.path.basename(DB_PATH),
    }
    if info["exists"]:
        stat = os.stat(DB_PATH)
        info["size"] = round(stat.st_size / 1024, 1)  # KB
        info["modified"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime))
    return {"status": "ok", "info": info}

