"""
登录状态缓存管理 + 配置同步 Mixin

★ 大修：同步登录检测方法已全部移除，登录检测统一由 AsyncLoginChecker +
container_state 状态引擎承担。本模块仅保留：
  - 全局登录缓存（_login_cache）管理
  - LoginMixin 辅助方法（配置同步、插件事件接口）
"""

import json
import os
import time
from typing import Dict

from services.log import logger
from services.config import get_data_dir

# ---------------------------------------------------------------------------
# 全局登录缓存（由此模块集中管理）
# ---------------------------------------------------------------------------
_login_cache: Dict[str, Dict] = {}
_LOGIN_CACHE_TTL = 30  # 秒，已登录容器无需频繁检查
_LOGIN_CACHE_TTL_FAIL = 8  # 秒，未登录容器短缓存（快速发现状态变化）


def read_login_cache(name: str) -> Dict:
    """公开接口：只读访问登录状态缓存（供 router 层使用，零阻塞）。"""
    return _login_cache.get(name, {})


def clear_login_cache(name: str) -> bool:
    """公开接口：清理指定容器的登录缓存，返回是否存在并已清理。"""
    return _login_cache.pop(name, None) is not None


def invalidate_login_cache(name: str) -> None:
    """由 WS 离线检测调用：将登录缓存标记为未登录，防止陈旧数据导致误判。"""
    prev = _login_cache.get(name)
    if prev and prev.get("logged_in"):
        _login_cache[name] = {"logged_in": False, "ts": time.time()}


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
        """方案 C 预留：插件事件直接更新缓存。
        event 格式: {event: 'login'|'logout', uin, nickname}
        """
        prev = _login_cache.get(name, {})
        if event.get("event") == "login" and event.get("uin"):
            uin = str(event["uin"])
            new_entry = {
                "logged_in": True,
                "uin": uin,
                "nickname": event.get("nickname", ""),
                "method": "plugin",
                "ts": time.time(),
            }
            _login_cache[name] = new_entry
            # 懒加载避免循环导入
            from services.docker_manager import docker_manager as _dm

            _dm._on_login_detected(name, new_entry, prev)
        elif event.get("event") == "logout":
            _login_cache[name] = {
                "logged_in": False,
                "ts": time.time(),
            }
