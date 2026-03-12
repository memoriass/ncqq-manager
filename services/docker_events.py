"""
Docker Events 监听器 — 事件驱动替代定时轮询

核心优化：
  轮询模式: 每 3s 调用 Docker API（无论有无变化）
  事件模式: Docker daemon 主动推送事件，状态变化时才刷新

设计：
  - 后台线程运行 docker-py 的 events() 阻塞迭代器
  - 收到容器事件 → 通过 asyncio.Event 通知 StateEngine 立即刷新
  - 连接断开自动重连（5s 间隔）
  - start()/stop() 管理生命周期（在 FastAPI lifespan 中调用）
"""
import threading
import time
from typing import Optional, Callable

import docker
import docker.errors

from services.log import logger

# 只关注容器生命周期事件
_EVENT_FILTERS = {
    "type": ["container"],
    "event": ["start", "stop", "die", "destroy", "create", "restart", "pause", "unpause"],
}
_RECONNECT_INTERVAL = 5  # 断线重连间隔（秒）


class DockerEventWatcher:
    """Docker 事件监听器 — 后台线程，事件驱动通知 StateEngine。"""

    def __init__(self):
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._notify_fn: Optional[Callable] = None

    def start(self, notify_fn: Callable):
        """启动事件监听线程。

        Args:
            notify_fn: 收到事件时的回调（通常是 state_engine.notify_change）
        """
        if self._running:
            return
        self._notify_fn = notify_fn
        self._running = True
        self._thread = threading.Thread(
            target=self._watch_loop,
            name="docker-events",
            daemon=True,
        )
        self._thread.start()
        logger.info("Docker 事件监听器已启动")

    def stop(self):
        """停止监听。"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None

    def _watch_loop(self):
        """后台线程主循环 — 断线自动重连。"""
        while self._running:
            try:
                client = docker.from_env(timeout=10)
                logger.info("Docker Events 已连接")
                self._consume_events(client)
            except docker.errors.DockerException as e:
                logger.debug("Docker Events 连接失败: %s", e)
            except Exception as e:
                logger.debug("Docker Events 异常: %s", e)

            if self._running:
                time.sleep(_RECONNECT_INTERVAL)

    def _consume_events(self, client):
        """消费事件流（阻塞，直到断线或 stop）。"""
        for event in client.events(decode=True, filters=_EVENT_FILTERS):
            if not self._running:
                break
            name = event.get("Actor", {}).get("Attributes", {}).get("name", "?")
            action = event.get("Action", "?")
            logger.debug("Docker event: %s %s", action, name)

            if self._notify_fn:
                self._notify_fn()


# ============ 单例 ============
docker_event_watcher = DockerEventWatcher()

