"""
异步 Docker 管理 + 登录检测器

AsyncLoginChecker  — aiohttp 并发登录探测（OneBot HTTP 单路，BS 修正后无需文件系统兜底）
AsyncDockerManager — aiodocker 替代 docker-py 热路径，零线程池开销
"""
import asyncio
import json
import time
from typing import Dict, List, Optional

import aiohttp
import aiodocker

from services.log import logger


_LOGIN_TIMEOUT = aiohttp.ClientTimeout(total=2, connect=1)
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
            return {"logged_in": False, "stage": "waiting"}
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
                        "stage": "logged_in",
                        "reason": "onebot_http_ready",
                    }
        except (aiohttp.ClientError, asyncio.TimeoutError, json.JSONDecodeError,
                ValueError, KeyError):
            pass
        return {"logged_in": False, "stage": "waiting"}

    async def check_login_status(self, name: str,
                                  http_port: int, webui_port: int) -> Dict:
        """四级级联检测：SDK WS 状态 → WS API 调用 → BS API → HTTP OneBot 兜底。

        ★ 大修：移除原 Level 4 文件系统兜底检测（通过 config 文件名 + qrcode.png
        判定登录为 ghost WS 误判的根源，假阳性率高）。
        冷启动引导由 HTTP OneBot API 承担（BS 尚未注入时仍可直连 NapCat 探测）。

        优先级：
          1. napcat_ws_service（零网络开销，BS 已修正心跳 status.online 字段）
          1.5 WS API 调用（WS 已连接但心跳未确认时，通过 WS 调用 get_login_info）
          2. BS 账号 API（BS 运行时辅助检测，10s TTL 缓存）
          3. OneBot HTTP /get_login_info（兜底，冷启动引导 + WS/BS 均不可用时）
        """
        from services.napcat_ws_service import napcat_ws_service

        # 1. SDK WS 直连（主路径：BS 修正后的心跳 + 有 uin → 直接返回）
        r1 = napcat_ws_service.get_login_result(name)
        if r1["logged_in"]:
            logger.debug("登录检测[%s] WS主路径命中 uin=%s", name, r1.get("uin"))
            return r1

        # 1.5 WS API 调用（WS 已连接但心跳未确认时，通过 WS 调用 get_login_info）
        if napcat_ws_service.get_proxy(name) is not None:
            r15 = await napcat_ws_service.check_login_via_ws(name)
            if r15["logged_in"]:
                logger.debug("登录检测[%s] WS API命中 uin=%s", name, r15.get("uin"))
                return r15

        # 2. BS 账号 API 辅助（次路径）
        r2 = await napcat_ws_service.check_via_bs(name)
        if r2["logged_in"]:
            logger.debug("登录检测[%s] BS辅助命中 uin=%s", name, r2.get("uin"))
            return r2

        # 3. OneBot HTTP 兜底（冷启动引导：BS 尚未注入，NapCat 仅有 HTTP 端口可达）
        if http_port:
            r3 = await self.check_login_onebot(http_port)
            if r3["logged_in"]:
                r3_uin = r3.get("uin", "")
                if r3_uin:
                    napcat_ws_service.ensure_uin(name, r3_uin)
                logger.debug("登录检测[%s] HTTP兜底命中 uin=%s", name, r3.get("uin"))
                return r3

        # 均无信号
        stage = r1.get("stage") or r2.get("stage") or "waiting"
        return {"logged_in": False, "stage": stage}

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


# ============ 单例 — 登录检测 ============
async_login_checker = AsyncLoginChecker()


# ============================================================
#  AsyncDockerManager — aiodocker 替代 docker-py 热路径
# ============================================================


class AsyncDockerManager:
    """异步 Docker 管理器 — 零线程 aiodocker 替代 docker-py。

    热路径方法（Phase 1 — 状态引擎用）：
      - list_local_containers()  → 替代 docker_manager.list_containers()
      - resolve_ports(names)     → 替代 _resolve_ports()

    CRUD 方法（后续优化 — 路由层用）：
      - action_container(name, action)   → 替代 docker_manager.action_container()
      - create_container(name, ...)      → 替代 docker_manager.create_container()
      - get_logs(name, tail)             → 替代 cluster_manager.get_logs() 本地分支
      - get_used_ports()                 → 替代 docker_manager.get_used_ports()
    """

    def __init__(self):
        self._docker: Optional[aiodocker.Docker] = None
        self._port_lock = asyncio.Lock()
        self._reserved_ports: set = set()

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

        async def _resolve_one(name: str) -> tuple:
            try:
                container = await self._docker.containers.get(name)
                info = await container.show()
                ports = info.get("NetworkSettings", {}).get("Ports", {}) or {}
                return name, {
                    "http_port": self._extract_host_port(ports, "3000/tcp"),
                    "webui_port": self._extract_host_port(ports, "6099/tcp"),
                }
            except Exception as e:
                logger.debug("端口解析失败 [%s]: %s", name, e)
                return name, {"http_port": 0, "webui_port": 0}

        pairs = await asyncio.gather(*[_resolve_one(n) for n in names])
        return dict(pairs)

    # ---- 3. 容器操作（CRUD 异步化 — 替代 docker_manager.action_container） ----

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

    async def restart_container(self, name: str, timeout: int = 30) -> None:
        """异步重启容器（注入后刷新 NapCat 配置使用）。
        timeout: 等待容器停止的秒数，超时后强制 kill。
        """
        if not self._docker:
            raise RuntimeError("AsyncDockerManager 未连接 Docker daemon")
        container = await self._docker.containers.get(name)
        await container.restart(timeout=timeout)
        logger.info("容器 %s 重启完成（timeout=%ds）", name, timeout)

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

            try:
                container = await self._docker.containers.create_or_replace(
                    name=name, config=config,
                )
            except aiodocker.exceptions.DockerError as pull_e:
                if pull_e.status == 404:
                    # 镜像本地不存在，自动拉取后重试
                    logger.info("镜像 %s 本地不存在，自动拉取中（首次部署可能需要数分钟）...", image)
                    await self._docker.images.pull(image)
                    logger.info("镜像 %s 拉取完成，重试创建容器...", image)
                    container = await self._docker.containers.create_or_replace(
                        name=name, config=config,
                    )
                else:
                    raise
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

    # ---- 8. 镜像管理（替代 docker_manager 同步版） ----

    async def list_images(self) -> List[Dict]:
        """异步列出本地 Docker 镜像。"""
        if not self._docker:
            return []
        try:
            images = await self._docker.images.list()
            result = []
            for img in images:
                tags = img.get("RepoTags") or []
                size_mb = round(img.get("Size", 0) / 1024 / 1024, 1)
                created = img.get("Created", "")
                img_id = img.get("Id", "")
                if img_id.startswith("sha256:"):
                    img_id = img_id[7:19]
                else:
                    img_id = img_id[:12]
                result.append({
                    "id": img_id,
                    "tags": tags,
                    "size": size_mb,
                    "created": created,
                })
            return result
        except aiodocker.exceptions.DockerError as e:
            logger.error("异步列举镜像失败: %s", e)
            return []

    async def pull_image(self, image_name: str) -> bool:
        """异步拉取 Docker 镜像。"""
        if not self._docker:
            return False
        try:
            await self._docker.images.pull(image_name)
            logger.info("异步镜像拉取成功: %s", image_name)
            return True
        except aiodocker.exceptions.DockerError as e:
            logger.error("异步镜像拉取失败 %s: %s", image_name, e)
            return False

    async def delete_image(self, image_id: str, force: bool = False) -> bool:
        """异步删除 Docker 镜像。"""
        if not self._docker:
            return False
        try:
            await self._docker.images.delete(image_id, force=force)
            logger.info("异步镜像删除成功: %s", image_id)
            return True
        except aiodocker.exceptions.DockerError as e:
            logger.error("异步镜像删除失败 %s: %s", image_id, e)
            return False

    @staticmethod
    def find_available_port(base: int, used_ports: set) -> int:
        """从 base 开始找到下一个可用端口（纯计算，不涉及 Docker API）。"""
        port = base
        while port in used_ports:
            port += 1
            if port > 65535:
                raise ValueError(f"没有可用端口（从 {base} 开始，所有端口均被占用）")
        return port

    async def allocate_port(self, base: int) -> int:
        """原子化端口分配：获取已用端口 + 查找可用 + 预留，防止竞态。"""
        async with self._port_lock:
            used = await self.get_used_ports()
            used |= self._reserved_ports
            port = self.find_available_port(base, used)
            self._reserved_ports.add(port)
            return port

    def release_port(self, port: int) -> None:
        """容器创建/绑定完成后释放预留（端口已被 Docker 占用，无需继续预留）。"""
        self._reserved_ports.discard(port)

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

