"""
告警管理服务 - 规则配置 + Webhook 推送
支持容器状态变化、CPU/内存超限等告警场景
"""
import json
import time
import socket
import threading
import ipaddress
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

import requests as http_requests

from services.log import logger
import services.database as db


def _validate_webhook_url(url: str, allow_local: bool = False) -> str:
    """校验 Webhook URL，防止 SSRF 攻击。返回清洗后的 URL 或抛出 ValueError。
    当 allow_local=True 时，允许指向本地/内网地址（适用于通知插件与管理器同机部署场景）。
    """
    if not url:
        return ""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Webhook URL 仅支持 http/https 协议，收到: {parsed.scheme}")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("Webhook URL 缺少主机名")
    if not allow_local:
        # 解析主机名为 IP 并检查是否为内网地址
        try:
            addrs = socket.getaddrinfo(hostname, None)
            for _, _, _, _, sockaddr in addrs:
                ip = ipaddress.ip_address(sockaddr[0])
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    raise ValueError(f"Webhook URL 不允许指向内网地址: {hostname} -> {ip}")
        except socket.gaierror:
            raise ValueError(f"Webhook URL 主机名无法解析: {hostname}")
    return url


class AlertManager:
    """告警规则管理与触发器"""

    def __init__(self):
        self._init_table()

    def _init_table(self):
        """确保告警表存在"""
        db.execute("""
            CREATE TABLE IF NOT EXISTS alert_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                config TEXT DEFAULT '{}',
                webhook_url TEXT DEFAULT '',
                created_at REAL DEFAULT 0
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS alert_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id TEXT,
                message TEXT,
                level TEXT DEFAULT 'info',
                created_at REAL DEFAULT 0
            )
        """)
        db.commit()

    def list_rules(self) -> List[Dict]:
        rows = db.fetchall("SELECT * FROM alert_rules ORDER BY created_at DESC")
        return [self._parse_rule(r) for r in rows]

    def get_rule(self, rule_id: str) -> Optional[Dict]:
        row = db.fetchone("SELECT * FROM alert_rules WHERE id=?", (rule_id,))
        return self._parse_rule(row) if row else None

    def _is_local_allowed(self) -> bool:
        """读取 settings 中的 allow_local_webhook 开关"""
        return bool(db.get_setting("allow_local_webhook", False))

    def create_rule(self, rule_id: str, name: str, rule_type: str,
                    config: Dict, webhook_url: str = "") -> bool:
        try:
            webhook_url = _validate_webhook_url(webhook_url, allow_local=self._is_local_allowed())
            db.execute(
                "INSERT INTO alert_rules (id,name,type,config,webhook_url,created_at) VALUES (?,?,?,?,?,?)",
                (rule_id, name, rule_type, json.dumps(config), webhook_url, time.time()),
            )
            db.commit()
            return True
        except ValueError as e:
            logger.warning("告警规则创建被拒绝: %s", e)
            raise
        except Exception as e:
            logger.error("创建告警规则失败: %s", e)
            return False

    def update_rule(self, rule_id: str, name: str = None,
                    enabled: bool = None, config: Dict = None,
                    webhook_url: str = None) -> bool:
        updates, params = [], []
        if name is not None:
            updates.append("name=?"); params.append(name)
        if enabled is not None:
            updates.append("enabled=?"); params.append(1 if enabled else 0)
        if config is not None:
            updates.append("config=?"); params.append(json.dumps(config))
        if webhook_url is not None:
            webhook_url = _validate_webhook_url(webhook_url, allow_local=self._is_local_allowed())
            updates.append("webhook_url=?"); params.append(webhook_url)
        if not updates:
            return False
        params.append(rule_id)
        db.execute(f"UPDATE alert_rules SET {','.join(updates)} WHERE id=?", params)
        db.commit()
        return True

    def delete_rule(self, rule_id: str) -> bool:
        db.execute("DELETE FROM alert_rules WHERE id=?", (rule_id,))
        db.execute("DELETE FROM alert_history WHERE rule_id=?", (rule_id,))
        db.commit()
        return True

    def trigger_alert(self, rule_id: str, message: str, level: str = "warning"):
        """触发告警：写入历史 + 发送 Webhook"""
        db.execute(
            "INSERT INTO alert_history (rule_id,message,level,created_at) VALUES (?,?,?,?)",
            (rule_id, message, level, time.time()),
        )
        db.commit()
        rule = self.get_rule(rule_id)
        if rule and rule.get("webhook_url"):
            self._send_webhook(rule["webhook_url"], message, level)

    def get_history(self, limit: int = 50) -> List[Dict]:
        rows = db.fetchall(
            "SELECT * FROM alert_history ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]

    def _send_webhook(self, url: str, message: str, level: str):
        """异步发送 Webhook 通知"""
        def _do_send():
            try:
                http_requests.post(url, json={
                    "text": message,
                    "level": level,
                    "timestamp": int(time.time()),
                    "source": "NapCat Manager",
                }, timeout=10)
            except Exception as e:
                logger.debug("Webhook 发送失败: %s", e)
        threading.Thread(target=_do_send, daemon=True).start()

    def _parse_rule(self, row) -> Dict:
        d = dict(row)
        d["config"] = json.loads(d.get("config", "{}"))
        d["enabled"] = bool(d.get("enabled", 0))
        return d


alert_manager = AlertManager()

