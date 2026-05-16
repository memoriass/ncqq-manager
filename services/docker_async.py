"""
异步 Docker 管理器

AsyncDockerManager — aiodocker 替代 docker-py 热路径，零线程池开销

登录检测已全面转为内联插件 WS 推送（/ws/plugin/{name}），本文件仅保留 Docker API 封装。
"""
import asyncio
import time
from collections import defaultdict
from typing import AsyncIterator, Dict, List, Optional

import aiodocker

from services.log import logger


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
        self._event_task: Optional[asyncio.Task] = None
        self._event_callbacks: List = []
        # SSE 订阅分发（从 docker_events.py 迁移）
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._last_event: dict[str, dict] = {}

    async def start(self):
        """创建 aiodocker 连接（自动探测 Windows npipe / Linux socket）。"""
        self._docker = aiodocker.Docker()
        # 启动时清理过期的端口预留（>5分钟未释放视为泄漏）
        self._cleanup_stale_reservations()
        # 启动 Docker Events 监听
        self._event_task = asyncio.create_task(self._watch_events())
        logger.info("异步Docker管理器已启动")

    async def stop(self):
        """关闭 aiodocker 连接。"""
        if self._event_task:
            self._event_task.cancel()
            self._event_task = None
        if self._docker:
            await self._docker.close()
            self._docker = None

    def on_container_event(self, callback) -> None:
        """注册容器事件回调（start/stop/die 时触发）。"""
        self._event_callbacks.append(callback)

    # ---- SSE 订阅分发（从 docker_events.py 迁移） ----

    def get_last_event(self, name: str) -> Optional[dict]:
        """返回指定容器最近一次 Docker 事件 {action, time}，无记录时返回 None。"""
        return self._last_event.get(name)

    def subscribe(self, name: str) -> asyncio.Queue:
        """为指定容器名注册一个事件队列，返回该队列供 SSE handler 消费。"""
        q: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._subscribers[name].append(q)
        return q

    def unsubscribe(self, name: str, q: asyncio.Queue) -> None:
        """移除指定队列。"""
        lst = self._subscribers.get(name, [])
        try:
            lst.remove(q)
        except ValueError:
            pass
        if not lst:
            self._subscribers.pop(name, None)

    async def _watch_events(self) -> None:
        """后台监听 Docker container events，触发即时刷新 + SSE 分发。"""
        _RELEVANT_ACTIONS = {"start", "stop", "die", "destroy", "kill", "pause", "unpause", "create", "restart"}
        while True:
            try:
                subscriber = self._docker.events.subscribe()
                while True:
                    event = await subscriber.get()
                    if event is None:
                        break
                    if event.get("Type") != "container":
                        continue
                    action = event.get("Action", "").split(":")[0]
                    if action not in _RELEVANT_ACTIONS:
                        continue
                    actor = event.get("Actor", {})
                    name = actor.get("Attributes", {}).get("name", "")
                    image = actor.get("Attributes", {}).get("image", "")

                    # SSE 分发 + last_event（所有容器）
                    self._dispatch_event(name, action, event)

                    # 回调仅限 napcat 容器
                    if "napcat" not in name.lower() and "napcat" not in image.lower():
                        continue
                    logger.debug("Docker event: %s container=%s", action, name)
                    for cb in self._event_callbacks:
                        try:
                            result = cb(name, action)
                            if asyncio.iscoroutine(result):
                                await result
                        except Exception as e:
                            logger.debug("Docker event callback error: %s", e)
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.debug("Docker events 监听异常，5s 后重连: %s", e)
                await asyncio.sleep(5)

    def _dispatch_event(self, name: str, action: str, raw: dict) -> None:
        """将事件投递到订阅该容器名的所有队列，并更新 last_event 缓存。"""
        ts = raw.get("time", int(time.time()))
        self._last_event[name] = {"action": action, "time": ts}

        queues = self._subscribers.get(name)
        if not queues:
            return
        payload = {
            "name": name,
            "action": action,
            "time": ts,
            "status": raw.get("status", action),
            "exit_code": raw.get("Actor", {}).get("Attributes", {}).get("exitCode"),
        }
        for q in list(queues):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

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

    # ---- 4b. 容器 inspect（异步获取完整容器信息） ----

    async def inspect_container(self, name: str) -> Optional[Dict]:
        """异步 inspect 容器，返回完整 attrs dict，失败返回 None。"""
        if not self._docker:
            return None
        try:
            container = await self._docker.containers.get(name)
            return await container.show()
        except Exception:
            return None

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

    async def get_stats(self, name: str) -> Dict:
        """异步获取容器完整统计（委托给同步 docker_manager，避免阻塞事件循环）。"""
        from services.docker_manager import docker_manager
        return await asyncio.to_thread(docker_manager.get_stats, name)

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

    async def pull_image_stream(self, image_name: str) -> AsyncIterator[Dict]:
        """异步流式拉取 Docker 镜像，逐条返回 Docker pull 事件。"""
        if not self._docker:
            yield {"error": "Docker engine not available", "status": "error"}
            return
        try:
            async for item in self._docker.images.pull(image_name, stream=True):
                if isinstance(item, dict):
                    yield item
                else:
                    yield {"status": str(item)}
        except aiodocker.exceptions.DockerError as e:
            logger.error("异步镜像流式拉取失败 %s: %s", image_name, e)
            yield {"error": str(e), "status": "error"}

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
        import time as _time
        import services.database as db
        async with self._port_lock:
            used = await self.get_used_ports()
            # 从 SQLite 加载已预留端口
            rows = db.fetchall("SELECT port FROM reserved_ports")
            used |= {r["port"] for r in rows}
            port = self.find_available_port(base, used)
            db.execute(
                "INSERT OR REPLACE INTO reserved_ports (port, reserved_at) VALUES (?,?)",
                (port, _time.time()),
            )
            return port

    def release_port(self, port: int) -> None:
        """容器创建/绑定完成后释放预留（端口已被 Docker 占用，无需继续预留）。"""
        import services.database as db
        db.execute("DELETE FROM reserved_ports WHERE port=?", (port,))

    def _cleanup_stale_reservations(self) -> None:
        """清理超过 5 分钟的过期预留（进程重启后的残留）。"""
        import time as _time
        import services.database as db
        cutoff = _time.time() - 300
        db.execute("DELETE FROM reserved_ports WHERE reserved_at < ?", (cutoff,))

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

