"""
生命周期 Mixin

LifecycleMixin 提供给 DockerManager 使用，封装：
  - BS 注入完成标记管理（持久化文件）
  - 登录检测完成回调 _on_login_detected（BS 注入 + 自动加群通知）
需要 self.get_used_ports / self.find_available_port 方法由 DockerManager 提供。
"""
import asyncio
import json
import os
from typing import Dict

from services.log import logger


class LifecycleMixin:
    """BS 注入标记 + 登录事件回调，混入 DockerManager 使用。"""

    @staticmethod
    def _bs_inject_marker_path(data_dir_base: str, name: str, uin: str) -> str:
        """返回 BS 注入完成的持久化标记文件路径。"""
        return os.path.join(data_dir_base, name, ".bs_injected", f"{uin}.done")

    @staticmethod
    def _bs_inject_done(data_dir_base: str, name: str, uin: str) -> bool:
        """检查该实例+uin 是否已完成过 BS 注入（标记文件存在）。"""
        return os.path.isfile(
            LifecycleMixin._bs_inject_marker_path(data_dir_base, name, uin)
        )

    @staticmethod
    def _mark_bs_inject(data_dir_base: str, name: str, uin: str) -> None:
        """写入 BS 注入完成标记文件（幂等）。"""
        marker = LifecycleMixin._bs_inject_marker_path(data_dir_base, name, uin)
        os.makedirs(os.path.dirname(marker), exist_ok=True)
        with open(marker, "w") as f:
            f.write(uin)

    def _on_login_detected(self, name: str, current: Dict, prev: Dict) -> None:
        """登录完成后统一触发：WS 客户端注入 + BS 中间件接管。

        防重复机制（双层）：
          1. 内存层：prev.logged_in + uin 相同则跳过（进程生命周期内有效）
          2. 持久层：data/{name}/.bs_injected/{uin}.done 存在则跳过（重启也有效）
        只有扫码登录（首次出现新 uin）时才真正执行注入。
        """
        uin = str(current.get("uin", ""))
        nickname = current.get("nickname", "")
        if not uin:
            return

        # 层1 - 内存层：本次进程内已检测到相同登录，跳过
        if prev.get("logged_in") and str(prev.get("uin", "")) == uin:
            return

        from services.config import app_config, get_data_dir
        data_dir_base = get_data_dir()
        config_dir = os.path.join(data_dir_base, name, "config")
        ws_enabled = app_config.get("init_ws_client_enabled", False)
        bs_enabled = app_config.get("init_bs_enabled", False)

        if not ws_enabled and not bs_enabled:
            return

        # 层2 - 持久层：该 uin 已注入过（重启后仍有效），跳过避免重复分配端口
        # ★ 但先验证配置文件是否实际存在：容器重建后 config 目录可能被清空，
        #   此时标记已过期，需清除标记并重新注入
        config_file_exists = os.path.isfile(os.path.join(config_dir, f"onebot11_{uin}.json"))
        if self._bs_inject_done(data_dir_base, name, uin):
            if config_file_exists:
                logger.debug("BS 注入已跳过（持久标记存在）: %s uin=%s", name, uin)
                return
            # 配置文件丢失（容器重建），清除过期标记并重新注入
            logger.info("BS 持久标记存在但 onebot11_%s.json 丢失，清除标记重新注入: %s", uin, name)
            marker = self._bs_inject_marker_path(data_dir_base, name, uin)
            try:
                os.remove(marker)
            except OSError:
                pass

        # ---- ① WS 客户端注入到 onebot11_{uin}.json ----
        ws_url = ""
        ws_token = str(app_config.get("init_ws_client_token", ""))
        bs_bind_url = ""

        if bs_enabled:
            bs_host = str(app_config.get("init_bs_napcat_host", "172.17.0.1"))
            bs_base_port = int(app_config.get("init_bs_client_base_port", 6100))
            used = self.get_used_ports()  # type: ignore[attr-defined]
            bs_port = self.find_available_port(bs_base_port, used)  # type: ignore[attr-defined]
            bs_bind_url = f"ws://0.0.0.0:{bs_port}/onebot/v11/ws"
            ws_url = f"ws://{bs_host}:{bs_port}/onebot/v11/ws"
        elif ws_enabled:
            ws_url = str(app_config.get("init_ws_client_url", ""))

        if ws_url:
            try:
                from routers.container_crud_router import _generate_onebot11_config_with_ws_client
                _generate_onebot11_config_with_ws_client(config_dir, ws_url, ws_token, uin)
                self._mark_bs_inject(data_dir_base, name, uin)
                logger.info("BS/WS 注入完成并写入持久标记: %s uin=%s", name, uin)
            except Exception as e:
                logger.error("登录后 WS 注入失败 (%s/%s): %s", name, uin, e)



        # ---- ② BS 中间件接管（异步 fire-and-forget）----
        if bs_enabled and ws_url and bs_bind_url:
            try:
                from services.docker_manager import _main_event_loop
                raw = app_config.get("init_bs_targets", "[]")
                targets = json.loads(raw) if isinstance(raw, str) else raw
                if not isinstance(targets, list):
                    targets = []
                manager_host = str(app_config.get("manager_host", "127.0.0.1"))
                manager_port = int(app_config.get("manager_port", 8000))
                named_endpoint = f"ws://{manager_host}:{manager_port}/ws/napcat/{name}"
                compat_endpoint = f"ws://{manager_host}:{manager_port}/ws/onebot/v11/ws"
                targets = [t for t in targets if t not in (named_endpoint, compat_endpoint)]
                targets = [named_endpoint] + targets
                logger.info("BS 自动注入管理器端点: %s", named_endpoint)
                conn_config = {
                    "name": nickname or name,
                    "description": f"Auto [{uin}]",
                    "enabled": True,
                    "client_endpoint": bs_bind_url,
                    "target_endpoints": targets,
                }
                loop = _main_event_loop
                if loop is not None and loop.is_running():
                    from services.botshepherd import botshepherd_manager

                    def _on_bs_inject_done(fut: asyncio.Future, _name: str = name):
                        try:
                            r = fut.result()
                            if isinstance(r, dict) and not r.get("success", True):
                                logger.warning("BS 连接同步结果: %s → %s", _name, r.get("error", r))
                            else:
                                logger.info("BS 连接同步完成: %s → %s", _name, r)
                        except Exception as exc:
                            logger.error("BS 连接同步异常: %s → %s", _name, exc)

                    future = asyncio.run_coroutine_threadsafe(
                        botshepherd_manager.update_connection(name, conn_config), loop
                    )
                    future.add_done_callback(_on_bs_inject_done)
                    logger.info("已调度 BS 连接同步: %s bind=%s napcat=%s targets=%s",
                                name, bs_bind_url, ws_url, targets)
                else:
                    logger.warning("事件循环未运行，跳过 BS 连接同步")
            except Exception as e:
                logger.error("登录后 BS 注入失败 (%s): %s", name, e)

        # ---- ③ 自动加群通知（开关：init_auto_join_groups_enabled）----
        if not app_config.get("init_auto_join_groups_enabled", False):
            return  # 开关关闭，跳过自动加群通知

        raw_groups = app_config.get("init_auto_join_groups", "[]")
        try:
            auto_groups = json.loads(raw_groups) if isinstance(raw_groups, str) else raw_groups
            if not isinstance(auto_groups, list):
                auto_groups = []
        except Exception:
            auto_groups = []

        if auto_groups and uin:
            from services.napcat_ws_service import napcat_ws_service as _ws_svc
            from services.docker_manager import _main_event_loop

            async def _auto_notify_groups(_name: str, _uin: str, _groups: list) -> None:
                """延迟 5s 等待 WS 代理就绪后，向各群发送上线通知。"""
                await asyncio.sleep(5)
                notice = f"✅ Bot [{_name}] QQ:{_uin} 已登录上线，请管理员确认。"
                for gid in _groups:
                    try:
                        await _ws_svc.send_message(_name, "group", str(gid), notice)
                        logger.info("自动加群通知已发送: name=%s group=%s", _name, gid)
                    except Exception as exc:
                        logger.debug("自动加群通知发送失败: name=%s group=%s: %s", _name, gid, exc)

            loop = _main_event_loop
            if loop is not None and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    _auto_notify_groups(name, uin, auto_groups), loop
                )
                logger.info("已调度自动加群通知: name=%s groups=%s", name, auto_groups)
            else:
                logger.debug("事件循环未运行，跳过自动加群通知")
