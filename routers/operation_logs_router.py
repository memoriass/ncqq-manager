"""
操作日志路由 - 提供操作审计日志查询接口
"""
import json
import time

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from middleware.auth import require_admin
from services.operation_logger import operation_logger

router = APIRouter(prefix="/api", tags=["operation_logs"])


@router.get("/operation_logs")
def get_operation_logs(
    limit: int = 50,
    session: dict = Depends(require_admin)
) -> dict:
    """
    获取操作日志

    Args:
        limit: 返回的日志条数 (1-200)
        session: 管理员会话

    Returns:
        操作日志列表，按时间倒序
    """
    if limit < 1 or limit > 200:
        limit = 50

    logs = operation_logger.get(limit)
    return {"status": "ok", "logs": logs}


@router.get("/operation_logs/download")
def download_operation_logs(
    limit: int = 200,
    session: dict = Depends(require_admin),
):
    """导出操作日志为 JSON 文件"""
    if limit < 1 or limit > 1000:
        limit = 200
    logs = operation_logger.get(limit)
    ts = time.strftime("%Y%m%d_%H%M%S")
    filename = f"operation_logs_{ts}.json"
    content = json.dumps(logs, ensure_ascii=False, indent=2)
    return PlainTextResponse(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

