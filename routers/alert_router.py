"""
告警管理路由 - 规则 CRUD + 历史查询
"""
import uuid as uuid_mod

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict

from middleware.auth import require_admin
from services.alert_manager import alert_manager
import services.database as db

router = APIRouter(prefix="/api", tags=["alerts"])


class AlertRuleRequest(BaseModel):
    name: str
    type: str = "container_stop"
    config: Dict = {}
    webhook_url: str = ""


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[Dict] = None
    webhook_url: Optional[str] = None


class SmtpTestRequest(BaseModel):
    recipients: str
    subject: str = "NapCat Manager SMTP 测试"
    message: str = "这是一封来自 NapCat Manager 的 SMTP 测试邮件。"


class AlertSettingsUpdate(BaseModel):
    allow_local_webhook: Optional[bool] = None
    webhook_base_url: Optional[str] = None
    smtp_enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_sender: Optional[str] = None
    smtp_sender_name: Optional[str] = None
    smtp_recipients: Optional[str] = None
    smtp_use_ssl: Optional[bool] = None
    smtp_use_tls: Optional[bool] = None
    smtp_subject_prefix: Optional[str] = None


# ============ 告警全局设置 ============

@router.get("/alerts/settings")
def get_alert_settings(session: dict = Depends(require_admin)):
    return {
        "status": "ok",
        "allow_local_webhook": db.get_setting("allow_local_webhook", False),
        "webhook_base_url": db.get_setting("webhook_base_url", ""),
        "smtp_enabled": db.get_setting("smtp_enabled", False),
        "smtp_host": db.get_setting("smtp_host", ""),
        "smtp_port": db.get_setting("smtp_port", 465),
        "smtp_username": db.get_setting("smtp_username", ""),
        "smtp_password_set": bool(db.get_setting("smtp_password", "")),
        "smtp_sender": db.get_setting("smtp_sender", ""),
        "smtp_sender_name": db.get_setting("smtp_sender_name", "NapCat Manager"),
        "smtp_recipients": db.get_setting("smtp_recipients", ""),
        "smtp_use_ssl": db.get_setting("smtp_use_ssl", True),
        "smtp_use_tls": db.get_setting("smtp_use_tls", False),
        "smtp_subject_prefix": db.get_setting("smtp_subject_prefix", "[NapCat 掉线告警]"),
    }


@router.put("/alerts/settings")
def update_alert_settings(req: AlertSettingsUpdate, session: dict = Depends(require_admin)):
    if req.allow_local_webhook is not None:
        db.set_setting("allow_local_webhook", req.allow_local_webhook)
    if req.webhook_base_url is not None:
        db.set_setting("webhook_base_url", req.webhook_base_url.rstrip("/"))
    for key in (
        "smtp_enabled", "smtp_host", "smtp_port", "smtp_username", "smtp_sender",
        "smtp_sender_name", "smtp_recipients", "smtp_use_ssl", "smtp_use_tls", "smtp_subject_prefix",
    ):
        val = getattr(req, key)
        if val is not None:
            db.set_setting(key, val)
    if req.smtp_password is not None:
        # 空字符串表示清空；未传则保留旧密码，避免前端读取不到明文时误覆盖
        db.set_setting("smtp_password", req.smtp_password)
    return {"status": "ok"}


# ============ 告警规则 CRUD ============

@router.get("/alerts/rules")
def list_alert_rules(session: dict = Depends(require_admin)):
    rules = alert_manager.list_rules()
    return {"status": "ok", "rules": rules}


@router.post("/alerts/rules")
def create_alert_rule(req: AlertRuleRequest, session: dict = Depends(require_admin)):
    rule_id = "alert-" + uuid_mod.uuid4().hex[:8]
    try:
        success = alert_manager.create_rule(
            rule_id, req.name, req.type, req.config, req.webhook_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create alert rule")
    return {"status": "ok", "rule_id": rule_id}


@router.put("/alerts/rules/{rule_id}")
def update_alert_rule(
    rule_id: str, req: AlertRuleUpdate,
    session: dict = Depends(require_admin),
):
    try:
        alert_manager.update_rule(
            rule_id, req.name, req.enabled, req.config, req.webhook_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok"}


@router.delete("/alerts/rules/{rule_id}")
def delete_alert_rule(rule_id: str, session: dict = Depends(require_admin)):
    alert_manager.delete_rule(rule_id)
    return {"status": "ok"}


@router.get("/alerts/history")
def get_alert_history(limit: int = 50, session: dict = Depends(require_admin)):
    if limit < 1 or limit > 200:
        limit = 50
    history = alert_manager.get_history(limit)
    return {"status": "ok", "history": history}



@router.post("/alerts/smtp/test")
async def test_smtp(req: SmtpTestRequest, session: dict = Depends(require_admin)):
    from services.alert_manager import _send_smtp_sync
    ok = await __import__("asyncio").to_thread(
        _send_smtp_sync,
        req.subject,
        req.message,
        {"event": "smtp_test", "operator": session.get("userName", "admin")},
        req.recipients,
    )
    if not ok:
        return {"status": "error", "message": "SMTP test failed, check server logs and SMTP settings"}
    return {"status": "ok"}
