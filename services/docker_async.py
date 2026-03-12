"""
异步 Docker 管理 + 登录检测器

Phase 1 核心模块：
  1. AsyncLoginChecker  — aiohttp 异步登录探测（Phase 1-部分，已完成）
  2. AsyncDockerManager — aiodocker 异步 Docker API（Phase 1-完整版）
     替代 docker-py 热路径（list / inspect / stats），消除 run_in_executor

优化对比：
  同步: run_in_executor → docker-py(阻塞) → 占线程池 32 workers
  异步: aiodocker(非阻塞 aiohttp) → 零线程，事件循环原生协程
"""
import asyncio
import json
import os
import time
from typing import Dict, List, Optional

import aiohttp
import aiodocker

from services.log import logger
from services.config import get_data_dir


_LOGIN_TIMEOUT = aiohttp.ClientTimeout(total=2, connect=1)
_INFO_TIMEOUT = aiohttp.ClientTimeout(total=1.5, connect=0.8)
_MAX_CONCURRENCY = 30  # 同时最多 30 个 HTTP 探测


class AsyncLoginChecker:
    """异步登录状态检测器 — 替代 docker_manager 中的同步 urllib 探测。"""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None

    async def start(self):
        """创建共享 HTTP 连接池。"""
        self._session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(limit=50, ttl_dns_cache=60),
            headers={"User-Agent": "NapCatManager/1.0"},
        )
        logger.info("异步登录检测器已启动")

    async def stop(self):
        """关闭连接池。"""
        if self._session:
            await self._session.close()
            self._session = None

    # ============ 单容器检测 ============

    async def check_login_onebot(self, http_port: int) -> Dict:
        """方案 A：OneBot HTTP API /get_login_info"""
        if not http_port or not self._session:
            return {"logged_in": False}
        try:
            async with self._session.post(
                f"http://127.0.0.1:{http_port}/get_login_info",
                json={},
                timeout=_LOGIN_TIMEOUT,
            ) as resp:
                result = await resp.json(content_type=None)
            if result.get("status") == "ok" and result.get("data", {}).get("user_id"):
                uid = str(result["data"]["user_id"])
                if uid and uid != "0":
                    return {
                        "logged_in": True,
                        "uin": uid,
                        "nickname": result["data"].get("nickname", ""),
                        "method": "onebot",
                    }
        except (aiohttp.ClientError, asyncio.TimeoutError, json.JSONDecodeError,
                ValueError, KeyError):
            pass
        return {"logged_in": False}

    async def check_login_webui(self, name: str, webui_port: int) -> Dict:
        """方案 B：NapCat WebUI + 本地文件综合检测。"""
        if not webui_port or not self._session:
            return {"logged_in": False}
        try:
            # 并发请求 qrcode + public/info
            qr_task = self._fetch_json(
                f"http://127.0.0.1:{webui_port}/api/qrcode", _INFO_TIMEOUT)
            info_task = self._fetch_json(
                f"http://127.0.0.1:{webui_port}/plugin/napcat-plugin-builtin/api/public/info",
                _INFO_TIMEOUT)

            qr_data, info_data = await asyncio.gather(
                qr_task, info_task, return_exceptions=True)

            # 有二维码 → 确认未登录
            if isinstance(qr_data, dict) and qr_data.get("url"):
                return {"logged_in": False}

            # NapCat 存活检测
            napcat_alive = (isinstance(info_data, dict)
                           and info_data.get("code") == 0
                           and "data" in info_data)

            # qrcode.png 是否停止刷新
            qr_stale = False
            try:
                qr_path = os.path.join(get_data_dir(), name, "cache", "qrcode.png")
                if os.path.exists(qr_path):
                    qr_stale = (time.time() - os.path.getmtime(qr_path)) > 30
                else:
                    qr_stale = True
            except OSError:
                pass

            # 从配置文件提取 uin
            uin = self._get_uin_from_config(name)

            if napcat_alive and qr_stale and uin:
                return {
                    "logged_in": True, "uin": uin,
                    "nickname": "", "method": "webui",
                }
        except Exception:
            pass
        return {"logged_in": False}

    async def check_login_status(self, name: str,
                                  http_port: int, webui_port: int) -> Dict:
        """级联检测：A(OneBot) → B(WebUI)。"""
        result = await self.check_login_onebot(http_port)
        if result["logged_in"]:
            return result
        result = await self.check_login_webui(name, webui_port)
        if result["logged_in"]:
            return result
        return {"logged_in": False}

    # ============ 批量检测 ============

    async def batch_check_login(
        self, instances: list, concurrency: int = _MAX_CONCURRENCY,
    ) -> Dict[str, Dict]:
        """批量并发检测登录状态。

        Args:
            instances: ContainerInstance 列表（需有 name, http_port, webui_port）
            concurrency: 最大并发数
        Returns:
            {name: {logged_in, uin?, ...}}
        """
        sem = asyncio.Semaphore(concurrency)
        results: Dict[str, Dict] = {}

        async def _check_one(inst):
            async with sem:
                try:
                    r = await asyncio.wait_for(
                        self.check_login_status(
                            inst.name, inst.http_port, inst.webui_port),
                        timeout=4,
                    )
                    results[inst.name] = r
                except (asyncio.TimeoutError, Exception):
                    results[inst.name] = {"logged_in": False}

        await asyncio.gather(*[_check_one(i) for i in instances])
        return results

    # ============ 内部辅助 ============

    async def _fetch_json(self, url: str, timeout: aiohttp.ClientTimeout) -> Optional[Dict]:
        """通用 GET JSON 请求，异常返回 None。"""
        if not self._session:
            return None
        try:
            async with self._session.get(url, timeout=timeout) as resp:
                return await resp.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError,
                json.JSONDecodeError, ValueError):
            return None

    @staticmethod
    def _get_uin_from_config(name: str) -> str:
        """从本地 onebot11_*.json 文件名提取 uin。"""
        try:
            config_dir = os.path.join(get_data_dir(), name, "config")
            if not os.path.exists(config_dir):
                return ""
            ob_files = [
                f for f in os.listdir(config_dir)
                if f.startswith("onebot11_") and f.endswith(".json")
            ]
            if ob_files:
                latest = max(
                    ob_files,
                    key=lambda fn: os.path.getmtime(os.path.join(config_dir, fn)),
                )
                raw = latest.replace("onebot11_", "").replace(".json", "")
                return ''.join(ch for ch in str(raw) if ch.isdigit())
            napcat_files = [
                f for f in os.listdir(config_dir)
                if f.startswith("napcat_") and f.endswith(".json")
                and not f.startswith("napcat_protocol_")
            ]
            if napcat_files:
                latest = max(
                    napcat_files,
                    key=lambda fn: os.path.getmtime(os.path.join(config_dir, fn)),
                )
                raw = latest.replace("napcat_", "").replace(".json", "")
                return ''.join(ch for ch in str(raw) if ch.isdigit())
        except OSError:
            pass
        return ""


# ============ 单例 — 登录检测 ============
async_login_checker = AsyncLoginChecker()


# ============================================================
#  AsyncDockerManager — aiodocker 替代 docker-py 热路径
# ============================================================

_STATS_TIMEOUT = 5  # 单容器 stats 超时（秒）


class AsyncDockerManager:
    """异步 Docker 管理器 — 零线程 aiodocker 替代 docker-py。

    热路径方法（Phase 1 — 状态引擎用）：
      - list_local_containers()  → 替代 docker_manager.list_containers()
      - resolve_ports(names)     → 替代 _resolve_ports()
      - batch_stats(names)       → 替代 _batch_stats()

    CRUD 方法（后续优化 — 路由层用）：
      - action_container(name, action)   → 替代 docker_manager.action_container()
      - create_container(name, ...)      → 替代 docker_manager.create_container()
      - get_logs(name, tail)             → 替代 cluster_manager.get_logs() 本地分支
      - get_used_ports()                 → 替代 docker_manager.get_used_ports()
    """

    def __init__(self):
        self._docker: Optional[aiodocker.Docker] = None

    async def start(self):
        """创建 aiodocker 连接（自动探测 Windows npipe / Linux socket）。"""
        self._docker = aiodocker.Docker()
        logger.info("异步Docker管理器已启动")

    async def stop(self):
        """关闭 aiodocker 连接。"""
        if self._docker:
            await self._docker.close()
            self._docker = None

    @property
    def connected(self) -> bool:
        return self._docker is not None

    # ---- 1. 容器列表（替代 docker_manager.list_containers） ----

    async def list_local_containers(self) -> List[Dict]:
        """异步获取本地 NapCat 容器列表。

        返回格式与 docker_manager.list_containers() 一致：
        [{id, name, status, image, created}, ...]
        """
        if not self._docker:
            return []
        try:
            raw_list = await asyncio.wait_for(
                self._docker.containers.list(all=True), timeout=5,
            )
        except (asyncio.TimeoutError, aiodocker.exceptions.DockerError) as e:
            logger.debug("异步容器列表获取失败: %s", e)
            return []

        results: List[Dict] = []
        for c in raw_list:
            d = c._container
            names = d.get("Names", [])
            name = names[0].lstrip("/") if names else ""
            image = d.get("Image", "")
            if "napcat" not in image.lower() and "napcat" not in name.lower():
                continue
            results.append({
                "id": d.get("Id", "")[:12],
                "name": name,
                "status": d.get("State", "created"),
                "image": image,
                "created": d.get("Created", ""),
            })
        return results

    # ---- 2. 端口解析（替代 _resolve_ports） ----

    async def resolve_ports(self, names: List[str]) -> Dict[str, Dict]:
        """异步批量解析容器端口映射（inspect → NetworkSettings.Ports）。"""
        if not self._docker:
            return {n: {"http_port": 0, "webui_port": 0} for n in names}
        result: Dict[str, Dict] = {}
        for name in names:
            try:
                container = await self._docker.containers.get(name)
                info = await container.show()
                ports = info.get("NetworkSettings", {}).get("Ports", {}) or {}
                result[name] = {
                    "http_port": self._extract_host_port(ports, "3000/tcp"),
                    "webui_port": self._extract_host_port(ports, "6099/tcp"),
                }
            except (aiodocker.exceptions.DockerError, Exception):
                result[name] = {"http_port": 0, "webui_port": 0}
        return result

    # ---- 3. 批量 Stats（替代 _batch_stats） ----

    async def batch_stats(self, names: List[str]) -> Dict[str, Dict]:
        """异步批量采集容器资源统计。"""
        if not self._docker:
            return {}
        results: Dict[str, Dict] = {}

        async def _one_stat(name: str):
            try:
                container = self._docker.containers.container(name)
                # stats(stream=False) 返回 List[Dict]，取第一个
                raw = await asyncio.wait_for(
                    container.stats(stream=False), timeout=_STATS_TIMEOUT,
                )
                s = raw[0] if raw else {}
                results[name] = self._parse_stats(s)
            except (asyncio.TimeoutError, aiodocker.exceptions.DockerError,
                    IndexError, Exception):
                results[name] = {}

        await asyncio.gather(
            *[_one_stat(n) for n in names], return_exceptions=True,
        )
        return results

    # ---- 4. 容器操作（CRUD 异步化 — 替代 docker_manager.action_container） ----

    async def action_container(self, name: str, action: str) -> bool:
        """异步执行容器操作（start/stop/restart/pause/unpause/kill/delete）。"""
        if not self._docker:
            return False
        try:
            container = await self._docker.containers.get(name)
            if action == "start":
                await container.start()
            elif action == "stop":
                await container.stop()
            elif action == "restart":
                await container.restart(timeout=10)
            elif action == "pause":
                await container.pause()
            elif action == "unpause":
                await container.unpause()
            elif action == "kill":
                await container.kill()
            elif action == "delete":
                try:
                    await container.stop(timeout=2)
                except aiodocker.exceptions.DockerError:
                    pass
                await container.delete(force=True)
            else:
                logger.warning("未知操作: %s", action)
                return False
            logger.info("容器 %s 异步执行 [%s] 成功", name, action)
            return True
        except aiodocker.exceptions.DockerError as e:
            logger.error("容器 %s 异步执行 [%s] 失败: %s", name, action, e)
            return False

    # ---- 5. 容器创建（CRUD 异步化 — 替代 docker_manager.create_container） ----

    async def create_container(
        self, name: str, image: str,
        volumes: Optional[Dict] = None,
        ports: Optional[Dict] = None,
        environment: Optional[Dict] = None,
        restart_policy: Optional[Dict] = None,
        mem_limit: Optional[str] = None,
        network_mode: Optional[str] = None,
    ) -> Optional[str]:
        """异步创建并启动容器（aiodocker API 格式）。"""
        if not self._docker:
            return None
        try:
            # aiodocker 使用 Docker Engine API 原始格式
            host_config: Dict = {}
            if volumes:
                binds = [
                    f"{host_path}:{mount['bind']}:{mount.get('mode', 'rw')}"
                    for host_path, mount in volumes.items()
                ]
                host_config["Binds"] = binds
            if ports:
                # ports 格式: {"6099/tcp": 6001, "3000/tcp": 3001}
                exposed = {}
                port_bindings = {}
                for container_port, host_port in ports.items():
                    exposed[container_port] = {}
                    port_bindings[container_port] = [{"HostPort": str(host_port)}]
                host_config["PortBindings"] = port_bindings
            if restart_policy:
                host_config["RestartPolicy"] = restart_policy
            if mem_limit:
                # "512m" → bytes
                val = mem_limit.rstrip("m")
                host_config["Memory"] = int(val) * 1024 * 1024
            if network_mode and network_mode != "bridge":
                host_config["NetworkMode"] = network_mode

            config: Dict = {
                "Image": image,
                "Env": [f"{k}={v}" for k, v in (environment or {}).items()],
                "HostConfig": host_config,
            }
            if ports:
                config["ExposedPorts"] = {p: {} for p in ports}

            container = await self._docker.containers.create_or_replace(
                name=name, config=config,
            )
            await container.start()
            info = await container.show()
            short_id = info.get("Id", "")[:12]
            logger.info("容器 %s 异步创建成功 (id=%s)", name, short_id)
            return short_id
        except aiodocker.exceptions.DockerError as e:
            logger.error("异步创建容器 %s 失败: %s", name, e)
            return None

    # ---- 6. 容器日志（CRUD 异步化 — 替代 cluster_manager.get_logs） ----

    async def get_logs(self, name: str, tail: int = 100) -> str:
        """异步获取容器日志。"""
        if not self._docker:
            return ""
        try:
            container = await self._docker.containers.get(name)
            log_lines = await container.log(
                stdout=True, stderr=True, tail=tail,
            )
            return "\n".join(log_lines)
        except aiodocker.exceptions.DockerError as e:
            logger.debug("异步获取容器 %s 日志失败: %s", name, e)
            return ""

    # ---- 7. 已用端口查询（CRUD 异步化） ----

    async def get_used_ports(self) -> set:
        """异步获取所有容器已用的宿主机端口。"""
        if not self._docker:
            return set()
        used = set()
        try:
            containers = await self._docker.containers.list(all=True)
            for c in containers:
                info = c._container
                ports = info.get("Ports", [])
                for p in ports:
                    if isinstance(p, dict) and p.get("PublicPort"):
                        used.add(p["PublicPort"])
        except aiodocker.exceptions.DockerError:
            pass
        return used

    # ---- 内部辅助 ----

    @staticmethod
    def _extract_host_port(ports: Dict, internal: str) -> int:
        """从 NetworkSettings.Ports 提取宿主机映射端口。"""
        try:
            bindings = ports.get(internal)
            if bindings and isinstance(bindings, list):
                return int(bindings[0]["HostPort"])
        except (KeyError, IndexError, ValueError, TypeError):
            pass
        return 0

    @staticmethod
    def _parse_stats(s: Dict) -> Dict:
        """解析 Docker stats JSON → {cpu_percent, mem_usage, mem_limit}。

        CPU 公式：(cpu_delta / system_delta) * num_cpus * 100
        """
        mem_usage = s.get("memory_stats", {}).get("usage", 0)
        mem_limit = s.get("memory_stats", {}).get("limit", 0)
        cpu_delta = (
            s.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
            - s.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
        )
        system_delta = (
            s.get("cpu_stats", {}).get("system_cpu_usage", 0)
            - s.get("precpu_stats", {}).get("system_cpu_usage", 0)
        )
        cpu_percent = 0.0
        if system_delta > 0 and cpu_delta > 0:
            percpu = s.get("cpu_stats", {}).get(
                "cpu_usage", {}).get("percpu_usage") or [1]
            cpu_percent = (cpu_delta / system_delta) * len(percpu) * 100.0
        return {
            "cpu_percent": round(cpu_percent, 2),
            "mem_usage": round(mem_usage / 1024 / 1024, 2),
            "mem_limit": round(mem_limit / 1024 / 1024, 2),
        }


# ============ 单例 — Docker 管理 ============
async_docker_manager = AsyncDockerManager()

