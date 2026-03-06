"""
WebSocket 连接管理器 - 实时事件推送
支持多客户端连接，容器状态变更广播
"""
import json
import asyncio
from typing import Dict, Set
from fastapi import WebSocket
from services.log import logger


class WSManager:
    """管理所有 WebSocket 连接，支持分组广播"""

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections.discard(ws)

    async def broadcast(self, event_type: str, data: dict):
        """广播事件给所有连接的客户端"""
        message = json.dumps({"type": event_type, "data": data}, ensure_ascii=False)
        async with self._lock:
            dead = []
            for ws in self._connections:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self._connections.discard(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


ws_manager = WSManager()

