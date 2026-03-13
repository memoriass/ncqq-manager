"""
容器状态引擎 — 后台异步刷新，API/WS 零阻塞读内存

架构（v5 — 全异步，零线程池）：
  后台引擎 ─── 定时循环 ──→ aiodocker (list/inspect: 纯异步) ⭐ Phase 1
                            ──→ aiohttp  (login check: 纯异步)
                            ──→ aiohttp  (remote nodes: 纯异步)     ⭐ Phase 4
                            ──→ 写入 InstanceSubsystem
  API 请求 → 读 InstanceSubsystem → 立即返回 (<1ms)

关键设计（v5 变更）：
  1. 容器列表：本地 aiodocker + 远程 aiohttp 均为纯异步（零线程）
  2. 端口解析：aiodocker container.show() 纯异步
  3. 登录检测：纯 aiohttp 异步
  4. QR 码：只处理未登录 & running 的容器，读本地 qrcode.png
  5. Stats：按需采集，实例详情页面访问时通过单独API获取
"""
import asyncio
import base64
import os
import time
from typing import Dict, List

from services.log import logger
from services.instance_subsystem import instance_subsystem
from services.docker_async import async_login_checker, async_docker_manager

# ============ 常量 ============

_REFRESH_INTERVAL_MIN = 3      # 事件活跃时的刷新间隔（秒）
_REFRESH_INTERVAL_MAX = 30     # 长时间无事件时的最大兜底间隔
_REFRESH_INTERVAL_STEP = 3     # 每次无事件时递增量
_LOGIN_TTL_OK = 60             # 已登录容器的登录检测间隔
_LOGIN_TTL_FAIL = 8            # 未登录容器的登录检测间隔
_QR_MAX_AGE = 120              # QR 文件最大有效期（秒）


class ContainerStateEngine:
    """容器状态引擎单例 — 后台定时刷新，数据写入 InstanceSubsystem。"""

    def __init__(self):
        # ---- 内部状态 ----
        self._tick = 0
        self._idle_interval = _REFRESH_INTERVAL_MIN    # 自适应刷新间隔
        self._running = False
        self._task: asyncio.Task | None = None
        self._force_event: asyncio.Event | None = None  # 操作/事件后立即触发刷新

        # ---- 监控指标（§9 — 观测性） ----
        self._last_tick_duration: float = 0.0   # 最近一次 tick 耗时（秒）
        self._slow_tick_count: int = 0          # 慢 tick 累计次数（>5s）
        self._container_count: int = 0          # 最近一次刷新的容器数

    # ============ 公开读接口（委托给 instance_subsystem，零阻塞） ============

    def get_containers(self) -> List[Dict]:
        """返回容器列表快照（附带 uin）— 兼容旧接口。"""
        return instance_subsystem.get_containers_list()

    def get_login_state(self, name: str) -> Dict:
        inst = instance_subsystem.get(name)
        if not inst:
            return {}
        return {"logged_in": inst.logged_in, "uin": inst.uin, "ts": inst.login_ts}

    def get_qr_states(self) -> Dict[str, Dict]:
        """返回所有 QR 快照 — 兼容旧接口。"""
        return instance_subsystem.get_qr_states()

    def get_all_stats(self) -> Dict[str, Dict]:
        """返回所有 Stats — 兼容旧接口。"""
        return instance_subsystem.get_all_stats()

    # ============ 控制接口 ============

    async def start(self):
        """在 FastAPI lifespan 中调用，启动后台任务。"""
        if self._running:
            return
        self._running = True
        self._force_event = asyncio.Event()
        self._task = asyncio.create_task(self._loop())
        logger.info("容器状态引擎已启动")

    async def stop(self):
        self._running = False
        if self._force_event:
            self._force_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("容器状态引擎已停止")

    def notify_change(self):
        """容器操作后调用，立即唤醒主循环刷新。"""
        if self._force_event:
            self._force_event.set()

    # ============ 后台主循环（自适应间隔 — 事件驱动） ============

    async def _loop(self):
        while self._running:
            t0 = time.monotonic()
            try:
                await self._tick_once()
            except Exception as e:
                logger.error("状态引擎异常: %s", e, exc_info=True)

            # §9 tick 耗时记录
            elapsed = time.monotonic() - t0
            self._last_tick_duration = elapsed
            if elapsed > 5.0:
                self._slow_tick_count += 1
                logger.warning("状态引擎 tick #%d 耗时 %.1fs（>5s），容器数=%d",
                               self._tick, elapsed, self._container_count)

            # 等待事件唤醒 或 自适应超时
            # 收到 Docker 事件 / 用户操作 → 立即刷新 + 重置为高频
            # 长时间无事件 → 逐渐降频（3s → 6s → ... → 30s）
            try:
                await asyncio.wait_for(
                    self._force_event.wait(), timeout=self._idle_interval)
                self._force_event.clear()
                # 事件活跃 → 重置为高频
                self._idle_interval = _REFRESH_INTERVAL_MIN
            except asyncio.TimeoutError:
                # 无事件 → 逐渐降频
                self._idle_interval = min(
                    self._idle_interval + _REFRESH_INTERVAL_STEP,
                    _REFRESH_INTERVAL_MAX,
                )

            self._tick += 1

    @property
    def health_info(self) -> Dict:
        """返回引擎健康指标 — 供 /api/health 读取。"""
        return {
            "running": self._running,
            "tick": self._tick,
            "last_tick_ms": round(self._last_tick_duration * 1000, 1),
            "slow_ticks": self._slow_tick_count,
            "interval": self._idle_interval,
            "containers": self._container_count,
        }

    async def _tick_once(self):
        """单次刷新周期 — 写入 instance_subsystem。

        v5: 全部走纯异步 — 本地 aiodocker + 远程 aiohttp，零线程池。
        """
        from services.cluster_manager import cluster_manager
        from services.config import get_data_dir

        # ---- 1. 刷新容器列表 → upsert 到 instance_subsystem ----
        # 本地容器：aiodocker 纯异步 ⭐
        try:
            local_containers = await async_docker_manager.list_local_containers()
        except Exception as e:
            logger.debug("引擎: 本地容器列表异步获取异常: %s", e)
            local_containers = []
        for c in local_containers:
            c["node_id"] = "local"

        # 远程节点容器：aiohttp 纯异步 ⭐ Phase 4
        try:
            remote_containers = await asyncio.wait_for(
                cluster_manager.list_remote_containers_async(),
                timeout=5,
            )
        except (asyncio.TimeoutError, Exception) as e:
            logger.debug("引擎: 远程容器列表异步获取超时/异常: %s", e)
            remote_containers = []

        containers = local_containers + remote_containers
        if not containers and not instance_subsystem.count:
            return  # 首次空列表且无缓存，跳过

        # upsert 每个容器到 instance_subsystem
        active_names: set = set()
        running_local_names: List[str] = []
        for c in containers:
            name = c["name"]
            active_names.add(name)
            inst = instance_subsystem.upsert(
                name,
                container_id=c.get("id", ""),
                status=c.get("status", "created"),
                image=c.get("image", ""),
                node_id=c.get("node_id", "local"),
                created=c.get("created", ""),
            )
            # 容器停止时清理运行时数据
            if inst.status != "running":
                inst.clear_runtime()
            elif inst.node_id == "local":
                running_local_names.append(name)

        # 清理已不存在的容器
        instance_subsystem.cleanup(active_names)

        # ---- 1.5 批量解析端口（运行中的本地容器）— aiodocker 纯异步 ⭐ ----
        need_ports = [n for n in running_local_names
                      if instance_subsystem.get(n)
                      and instance_subsystem.get(n).http_port == 0]
        if need_ports:
            try:
                port_map = await async_docker_manager.resolve_ports(need_ports)
            except Exception:
                port_map = {}
            for name, ports in port_map.items():
                inst = instance_subsystem.get(name)
                if inst:
                    inst.http_port = ports.get("http_port", 0)
                    inst.webui_port = ports.get("webui_port", 0)

        # ---- 2. 增量登录检测 — 纯异步 aiohttp ⭐ ----
        now = time.time()
        need_login_instances = []
        for name in running_local_names:
            inst = instance_subsystem.get(name)
            if not inst:
                continue
            ttl = _LOGIN_TTL_OK if inst.logged_in else _LOGIN_TTL_FAIL
            if now - inst.login_ts >= ttl:
                need_login_instances.append(inst)

        if need_login_instances:
            login_results = await async_login_checker.batch_check_login(
                need_login_instances
            )
            for name, result in login_results.items():
                inst = instance_subsystem.get(name)
                if inst:
                    inst.update_login(
                        logged_in=result.get("logged_in", False),
                        uin=result.get("uin", ""),
                    )

        # ---- 3. QR 码刷新（未登录 & running） ----
        data_dir = get_data_dir()
        for name in running_local_names:
            inst = instance_subsystem.get(name)
            if not inst or inst.logged_in:
                continue
            qr_data = None
            try:
                qr_path = os.path.join(data_dir, name, "cache", "qrcode.png")
                if os.path.exists(qr_path):
                    age = now - os.path.getmtime(qr_path)
                    if age < _QR_MAX_AGE:
                        with open(qr_path, "rb") as f:
                            b64 = base64.b64encode(f.read()).decode("utf-8")
                        qr_data = f"data:image/png;base64,{b64}"
            except Exception:
                pass
            inst.update_qr(qr_data)

        # 记录本轮容器数（供 health_info 使用）
        self._container_count = len(containers)


# ============ 单例 ============
state_engine = ContainerStateEngine()
