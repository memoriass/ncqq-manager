"""
登录代偿检测器（LoginCompensator）

职责：
  文件扫描注入：定期扫描容器 config 目录，检测 onebot11_{uin}.json 文件出现
  且尚未注入 WS 配置时，立即触发注入+重启，实现快速首次连接建立。
  ★ 无论 BS 模式还是纯 WS 模式均生效，解决新容器首次登录时无网络配置
    导致无法连接 BS 的死锁问题。

启动条件：
  init_bs_enabled=True 或 init_ws_client_enabled=True
"""

import asyncio
import os
import re
from services.log import logger

_SCAN_INTERVAL = 15   # 文件扫描间隔（秒）— 首次登录无需亚秒响应，降低 I/O 频率
_UIN_RE = re.compile(r"^onebot11_(\d{5,12})\.json$")


class LoginCompensator:
    """登录代偿检测器（单例）— 文件扫描注入"""

    def __init__(self) -> None:
        self._scan_task: asyncio.Task | None = None
        self._running = False

    @property
    def running(self) -> bool:
        return self._running

    async def start(self) -> None:
        """启动文件扫描注入循环。"""
        if self._running:
            return
        self._running = True
        self._scan_task = asyncio.create_task(self._scan_loop())
        logger.info("登录代偿检测器已启动（仅文件扫描注入）")

    async def stop(self) -> None:
        """停止代偿检测循环。"""
        self._running = False
        if self._scan_task:
            self._scan_task.cancel()
            try:
                await self._scan_task
            except asyncio.CancelledError:
                pass
        self._scan_task = None

    async def auto_start(self) -> None:
        """根据配置自动决定是否启动。"""
        try:
            from services.config import app_config
            bs_enabled = app_config.get("init_bs_enabled", False)
            ws_enabled = app_config.get("init_ws_client_enabled", False)
            if bs_enabled or ws_enabled:
                await self.start()
            else:
                logger.debug(
                    "登录代偿检测器未启动: bs_enabled=%s ws_enabled=%s",
                    bs_enabled, ws_enabled,
                )
        except Exception as e:
            logger.warning("登录代偿检测器自动启动检查失败: %s", e)

    # ---- 文件扫描注入循环 ----

    async def _scan_loop(self) -> None:
        """每 5s 扫描容器 config 目录，检测首次登录并快速注入 WS 配置。"""
        await asyncio.sleep(8)
        while self._running:
            try:
                await self._scan_configs()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.debug("代偿文件扫描异常: %s", e)
            if self._running:
                await asyncio.sleep(_SCAN_INTERVAL)

    async def _scan_configs(self) -> None:
        """扫描所有实例的 config 目录，发现未注入的 onebot11_{uin}.json 时触发注入。

        同时适配 BS 模式和纯 WS 模式：
        - BS 模式：分配端口，注入 BS 端点 URL，并同步 BS connection
        - 纯 WS 模式：使用配置的 ws_client_url 模板注入
        """
        from services.config import app_config, get_data_dir
        from services.instance_subsystem import instance_subsystem

        data_dir = get_data_dir()
        bs_enabled = app_config.get("init_bs_enabled", False)
        ws_token = str(app_config.get("init_ws_client_token", ""))

        # 至少需要一种模式的 URL 可用
        if not bs_enabled:
            ws_url_tpl = str(app_config.get("init_ws_client_url", ""))
            if not ws_url_tpl:
                return
        else:
            ws_url_tpl = ""  # BS 模式下动态生成

        for inst in instance_subsystem.get_all():
            name = inst.name
            config_dir = os.path.join(data_dir, name, "config")
            if not await asyncio.to_thread(os.path.isdir, config_dir):
                continue

            fnames = await asyncio.to_thread(os.listdir, config_dir)
            for fname in fnames:
                m = _UIN_RE.match(fname)
                if not m:
                    continue
                uin = m.group(1)

                # 检查两个标记：scan 自身标记 或 bs 注入标记（任一存在即跳过）
                scan_marker = os.path.join(data_dir, name, ".scan_injected", f"{uin}.done")
                bs_marker = os.path.join(data_dir, name, ".bs_injected", f"{uin}.done")
                if await asyncio.to_thread(os.path.isfile, scan_marker) or await asyncio.to_thread(os.path.isfile, bs_marker):
                    continue

                logger.info("文件扫描发现未注入配置: name=%s uin=%s，触发注入", name, uin)
                await self._inject(name, uin, config_dir, data_dir, ws_url_tpl, ws_token, bs_enabled)

    async def _inject(
        self, name: str, uin: str, config_dir: str,
        data_dir: str, ws_url_tpl: str, ws_token: str,
        bs_enabled: bool = False,
    ) -> None:
        """注入 WS 客户端配置并重启容器。支持 BS 和纯 WS 两种模式。"""
        from routers.container_crud_router import _generate_onebot11_config_with_ws_client
        from services.docker_async import async_docker_manager

        bs_port = 0
        try:
            if bs_enabled:
                # BS 模式：分配端口，生成 BS 端点 URL
                from services.config import app_config
                bs_host = str(app_config.get("init_bs_napcat_host", "172.17.0.1"))
                bs_base_port = int(app_config.get("init_bs_client_base_port", 6100))
                bs_port = await async_docker_manager.allocate_port(bs_base_port)
                ws_url = f"ws://{bs_host}:{bs_port}/onebot/v11/ws"
                bs_bind_url = f"ws://0.0.0.0:{bs_port}/onebot/v11/ws"
            else:
                ws_url = ws_url_tpl.replace("{name}", name) if "{name}" in ws_url_tpl else ws_url_tpl
                bs_bind_url = ""

            _generate_onebot11_config_with_ws_client(config_dir, ws_url, ws_token, uin)

            # 写入占位文件：scan 自身标记 + bs 标记（防止 _on_login_detected 重复注入）
            for marker_name in (".scan_injected", ".bs_injected"):
                mdir = os.path.join(data_dir, name, marker_name)
                os.makedirs(mdir, exist_ok=True)
                with open(os.path.join(mdir, f"{uin}.done"), "w") as f:
                    f.write(uin)

            logger.info("文件扫描注入完成: name=%s uin=%s url=%s，5s 后重启容器", name, uin, ws_url)
            if bs_enabled:
                async_docker_manager.release_port(bs_port)

            # BS 模式：同步 connection 到 BS 进程
            if bs_enabled and bs_bind_url:
                try:
                    from services.docker_manager import docker_manager
                    await docker_manager._async_sync_bs_connection(name, uin, "", bs_bind_url, ws_url)
                except Exception as e:
                    logger.warning("文件扫描注入后 BS 连接同步失败: %s", e)

            await asyncio.sleep(5)
            await async_docker_manager.restart_container(name)
            logger.info("文件扫描注入后容器重启完成: %s", name)
        except Exception as e:
            if bs_enabled and bs_port > 0:
                async_docker_manager.release_port(bs_port)
            logger.warning("文件扫描注入失败: name=%s uin=%s: %s", name, uin, e)


login_compensator = LoginCompensator()
