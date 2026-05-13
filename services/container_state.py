"""
容器状态引擎 — 后台异步刷新，API/WS 零阻塞读内存

架构：后台循环 → aiodocker(本地列表/端口) + aiohttp(登录检测/远程节点)
     → 写入 InstanceSubsystem；API 读内存快照，响应 <1ms。
自适应刷新：事件活跃时 3s，长时间无变化逐步降频至 30s。
"""

import asyncio
import base64
import os
import time
from typing import Dict, List

from services.log import logger
from services.instance_subsystem import instance_subsystem
from services.docker_async import async_docker_manager


# ============ 常量 ============

_REFRESH_INTERVAL_MIN = 3  # 事件活跃时的刷新间隔（秒）
_REFRESH_INTERVAL_MAX = 30  # 长时间无事件时的最大兜底间隔
_REFRESH_INTERVAL_STEP = 3  # 每次无事件时递增量
_QR_MAX_AGE = 120  # QR 文件最大有效期（秒）


class ContainerStateEngine:
    """容器状态引擎单例 — 后台定时刷新，数据写入 InstanceSubsystem。"""

    def __init__(self):
        # ---- 内部状态 ----
        self._tick = 0
        self._idle_interval = _REFRESH_INTERVAL_MIN  # 自适应刷新间隔
        self._running = False
        self._task: asyncio.Task | None = None
        self._force_event: asyncio.Event | None = None  # 操作/事件后立即触发刷新
        self._change_condition: asyncio.Condition = asyncio.Condition()
        # 首次 tick 完成前不发上线通知（避免启动时误报所有在线容器）
        self._engine_initialized: bool = False

        # ---- 监控指标（§9 — 观测性） ----
        self._last_tick_duration: float = 0.0  # 最近一次 tick 耗时（秒）
        self._slow_tick_count: int = 0  # 慢 tick 累计次数（>5s）
        self._container_count: int = 0  # 最近一次刷新的容器数

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
        # 注册 Docker Events 回调 — 容器状态变化时立即唤醒引擎
        async_docker_manager.on_container_event(self._on_docker_event)
        self._task = asyncio.create_task(self._loop())
        logger.info("容器状态引擎已启动")

    def _on_docker_event(self, name: str, action: str):
        """Docker 容器事件回调 — 立即唤醒主循环。"""
        self.notify_change()

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

    async def wait_for_change(self, timeout: float = 10.0) -> bool:
        """等待状态变更通知，返回 True 表示有变更，False 表示超时。"""
        try:
            async with self._change_condition:
                await asyncio.wait_for(self._change_condition.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    # ============ 后台主循环（自适应间隔 — 事件驱动） ============

    async def _loop(self):
        while self._running:
            t0 = time.monotonic()
            try:
                await self._tick_once()
            except Exception as e:
                logger.error("状态引擎异常: %s", e, exc_info=True)

            # 通知所有等待状态变更的 WS 客户端
            async with self._change_condition:
                self._change_condition.notify_all()

            # §9 tick 耗时记录
            elapsed = time.monotonic() - t0
            self._last_tick_duration = elapsed
            if elapsed > 5.0:
                self._slow_tick_count += 1
                logger.warning(
                    "状态引擎 tick #%d 耗时 %.1fs（>5s），容器数=%d",
                    self._tick,
                    elapsed,
                    self._container_count,
                )

            # 等待事件唤醒 或 自适应超时
            # 收到 Docker 事件 / 用户操作 → 立即刷新 + 重置为高频
            # 长时间无事件 → 逐渐降频（3s → 6s → ... → 30s）
            try:
                await asyncio.wait_for(
                    self._force_event.wait(), timeout=self._idle_interval
                )
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
        v6: 新增实例离线检测 — running → 非 running 时触发 webhook 告警。
        """
        from services.cluster_manager import cluster_manager
        from services.config import get_data_dir

        # ---- 0. 记录刷新前的运行状态（用于离线检测） ----
        prev_running: set = set()
        for inst in instance_subsystem.get_all():
            if inst.status == "running":
                prev_running.add((inst.name, inst.node_id))

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

        # ---- 1.6 实例上线/离线检测 — running 集合差集触发通知 ----
        curr_running: set = set()
        for inst in instance_subsystem.get_all():
            if inst.status == "running":
                curr_running.add((inst.name, inst.node_id))
        from services.alert_manager import alert_manager

        # 离线：running → 非 running
        went_offline = prev_running - curr_running
        if went_offline:
            for name, node_id in went_offline:
                inst = instance_subsystem.get(name)
                uin = inst.uin if inst else ""
                try:
                    await alert_manager.notify_instance_offline(name, node_id, uin)
                except Exception as e:
                    logger.debug("离线通知异常: %s", e)

        # 上线：非 running → running（首次 tick 跳过，避免启动时误报）
        came_online = curr_running - prev_running
        if came_online and self._engine_initialized:
            for name, node_id in came_online:
                inst = instance_subsystem.get(name)
                uin = inst.uin if inst else ""
                try:
                    await alert_manager.notify_instance_online(name, node_id, uin)
                except Exception as e:
                    logger.debug("上线通知异常: %s", e)

        # 首次 tick 完成后标记初始化完成
        if not self._engine_initialized:
            self._engine_initialized = True

        # ---- 1.5 批量解析端口（运行中的本地容器）— aiodocker 纯异步 ⭐ ----
        need_ports = [
            n
            for n in running_local_names
            if instance_subsystem.get(n)
            and (
                instance_subsystem.get(n).http_port == 0
                or instance_subsystem.get(n).webui_port == 0
            )
        ]
        if need_ports:
            try:
                port_map = await async_docker_manager.resolve_ports(need_ports)
            except Exception as e:
                logger.warning("端口解析批量失败: %s", e)
                port_map = {}
            for name, ports in port_map.items():
                inst = instance_subsystem.get(name)
                if inst:
                    inst.http_port = ports.get("http_port", 0)
                    inst.webui_port = ports.get("webui_port", 0)

        # ---- 2. 插件心跳超时检测 — 心跳连续缺失 → 视为掉线 ----
        # 登录状态由插件 /internal/login-event 推送写入 inst.update_login()，
        # 此处仅做心跳超时兜底：连续 90s（3 × 30s 间隔）无心跳 → 标记掉线。
        _HEARTBEAT_TIMEOUT = 90

        now = time.time()
        prev_login: Dict[str, tuple] = {}

        for name in running_local_names:
            inst = instance_subsystem.get(name)
            if not inst or not inst.logged_in:
                continue
            # 已收到过心跳 + 超时 → 视为掉线
            if inst.bot_heartbeat_ts > 0 and now - inst.bot_heartbeat_ts > _HEARTBEAT_TIMEOUT:
                prev_login[name] = (True, inst.uin, inst.node_id)
                inst.update_login(
                    logged_in=False,
                    uin=inst.uin,
                    stage="waiting",
                    method="plugin",
                    reason="heartbeat_timeout",
                )
                logger.info(
                    "插件心跳超时 [%s]: uin=%s 距上次心跳 %.0fs",
                    name, inst.uin, now - inst.bot_heartbeat_ts,
                )

        # ---- 2.5 掉线通知 ----
        for name, (was_logged_in, old_uin, nid) in prev_login.items():
            if not was_logged_in:
                continue
            inst = instance_subsystem.get(name)
            if inst and not inst.logged_in:
                try:
                    from services.alert_manager import alert_manager
                    await alert_manager.notify_login_lost(name, old_uin, nid)
                except Exception as e:
                    logger.debug("掉线扫码通知异常: %s", e)

        # ---- 3. QR 码刷新（未登录 & running） ----
        data_dir = get_data_dir()
        for name in running_local_names:
            inst = instance_subsystem.get(name)
            if not inst or inst.logged_in:
                continue
            qr_data = None
            is_expired = False
            try:
                qr_path = os.path.join(data_dir, name, "cache", "qrcode.png")
                exists = await asyncio.to_thread(os.path.exists, qr_path)
                if exists:
                    age = now - await asyncio.to_thread(os.path.getmtime, qr_path)
                    if age < _QR_MAX_AGE:
                        def _read_qr(p=qr_path):
                            with open(p, "rb") as f:
                                return f.read()
                        raw = await asyncio.to_thread(_read_qr)
                        b64 = base64.b64encode(raw).decode("utf-8")
                        qr_data = f"data:image/png;base64,{b64}"
                    else:
                        is_expired = True
            except Exception as e:
                logger.debug("QR 读取失败 [%s]: %s", name, e)
            inst.update_qr(qr_data, expired=is_expired)

        # 记录本轮容器数（供 health_info 使用）
        self._container_count = len(containers)


# ============ 单例 ============
state_engine = ContainerStateEngine()
