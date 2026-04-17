"""
登录状态辅助 Mixin

★ 大修：同步检测 + _login_cache 已全部移除。
登录检测统一由 AsyncLoginChecker + container_state 状态引擎承担。
本模块仅保留 LoginMixin（配置同步、插件事件接口）和容器清理辅助函数。
"""

import json
import os
import time
from typing import Dict

from services.log import logger
from services.config import get_data_dir


# ---------------------------------------------------------------------------
# 公开辅助函数（容器删除/清理时调用）
# ---------------------------------------------------------------------------


def _normalize_uin(raw: str) -> str:
    """归一化 QQ 号：仅保留数字，去除 protocol_ 等前缀。"""
    return "".join(ch for ch in str(raw) if ch.isdigit())


# ---------------------------------------------------------------------------
# LoginMixin — 混入 DockerManager，需要 self.client / self.resolve_host_port
# ---------------------------------------------------------------------------


class LoginMixin:
    """登录状态辅助功能集合，混入 DockerManager 使用。

    ★ 大修：同步登录检测方法 (check_login_via_onebot / check_login_via_webui /
    check_login_status / batch_check_login) 已全部移除。
    登录检测由 AsyncLoginChecker 四级级联 + container_state 状态引擎统一承担。
    本 Mixin 仅保留缓存管理、配置同步和插件事件接口。
    """

    def _get_uin_from_config(self, name: str) -> str:
        """从本地 onebot11_*.json 文件名提取 uin（辅助信息，不用于登录判断）"""
        try:
            config_dir = os.path.join(get_data_dir(), name, "config")
            if not os.path.exists(config_dir):
                return ""
            ob_files = [
                f
                for f in os.listdir(config_dir)
                if f.startswith("onebot11_") and f.endswith(".json")
            ]
            if ob_files:
                latest = max(
                    ob_files,
                    key=lambda f: os.path.getmtime(os.path.join(config_dir, f)),
                )
                raw = latest.replace("onebot11_", "").replace(".json", "")
                return _normalize_uin(raw)
            napcat_files = [
                f
                for f in os.listdir(config_dir)
                if f.startswith("napcat_")
                and f.endswith(".json")
                and not f.startswith("napcat_protocol_")
            ]
            if napcat_files:
                latest = max(
                    napcat_files,
                    key=lambda f: os.path.getmtime(os.path.join(config_dir, f)),
                )
                raw = latest.replace("napcat_", "").replace(".json", "")
                return _normalize_uin(raw)
        except OSError:
            pass
        return ""

    def _sync_webui_auto_login(self, name: str, uin: str) -> None:
        """登录成功后自动同步 webui.json 中的 autoLoginAccount"""
        try:
            local_webui = os.path.join(get_data_dir(), name, "config", "webui.json")
            if not os.path.exists(local_webui):
                return
            with open(local_webui, "r", encoding="utf-8") as wf:
                w_config = json.loads(wf.read())

            modified = False
            if "login" not in w_config or not isinstance(w_config["login"], dict):
                w_config["login"] = {}
                modified = True

            login_cfg = w_config["login"]
            if login_cfg.get("account") != uin:
                login_cfg["account"] = uin
                login_cfg["password"] = ""
                modified = True
            if login_cfg.get("autoLoginAccount") != uin:
                login_cfg["autoLoginAccount"] = uin
                modified = True
            if w_config.get("autoLoginAccount") != uin:
                w_config["autoLoginAccount"] = uin
                modified = True

            if modified:
                with open(local_webui, "w", encoding="utf-8") as wf:
                    json.dump(w_config, wf, indent=4, ensure_ascii=False)
        except (json.JSONDecodeError, OSError, KeyError) as e:
            logger.debug("同步自动登录配置失败: %s", e)

    @staticmethod
    def update_login_cache(name: str, event: Dict) -> None:
        """插件事件更新登录状态（由 /internal/login-event 调用）。

        ★ 大修：不再写 _login_cache，直接更新 instance_subsystem 并触发 BS 注入。
        event 格式: {event: 'login'|'logout', uin, nickname}
        """
        from services.instance_subsystem import instance_subsystem

        inst = instance_subsystem.get(name)
        if not inst:
            return

        if event.get("event") == "login" and event.get("uin"):
            uin = str(event["uin"])
            prev = {"logged_in": inst.logged_in, "uin": inst.uin}
            result = {
                "logged_in": True,
                "uin": uin,
                "nickname": event.get("nickname", ""),
                "method": "plugin",
                "stage": "logged_in",
                "reason": "plugin_login_event",
            }
            inst.update_login(
                logged_in=True, uin=uin,
                stage="logged_in", method="plugin", reason="plugin_login_event",
            )
            from services.docker_manager import docker_manager as _dm
            _dm._on_login_detected(name, result, prev)
        elif event.get("event") == "logout":
            inst.update_login(
                logged_in=False, uin=inst.uin,
                stage="waiting", method="plugin", reason="plugin_logout_event",
            )
