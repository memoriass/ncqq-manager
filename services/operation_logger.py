"""
操作审计日志系统 - SQLite 持久化
缓冲区批量写入 + 事务保证
"""
import json
import uuid
import time
from typing import List, Dict, Any
from collections import deque

from services.log import logger
import services.database as db


class OperationLogger:
    """操作日志记录器 - 缓冲写入 + DB 读取"""

    def __init__(self, buffer_size: int = 20):
        self._buffer: deque = deque(maxlen=buffer_size)

    def log(self, operation_type: str, payload: Dict[str, Any],
            level: str = "info") -> str:
        """记录一条操作日志"""
        operation_id = uuid.uuid4().hex[:16]
        entry = {
            "id": operation_id,
            "type": operation_type,
            "level": level,
            "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp": int(time.time()),
            "payload": payload,
        }
        self._buffer.append(entry)
        if len(self._buffer) >= self._buffer.maxlen:
            self.flush()
        return operation_id

    def info(self, operation_type: str, payload: Dict[str, Any]) -> str:
        return self.log(operation_type, payload, "info")

    def warning(self, operation_type: str, payload: Dict[str, Any]) -> str:
        return self.log(operation_type, payload, "warning")

    def error(self, operation_type: str, payload: Dict[str, Any]) -> str:
        return self.log(operation_type, payload, "error")

    def flush(self):
        """将缓冲区写入 SQLite"""
        if not self._buffer:
            return
        try:
            while self._buffer:
                entry = self._buffer.popleft()
                db.execute(
                    "INSERT OR IGNORE INTO operation_logs (id,type,level,time,timestamp,payload) VALUES (?,?,?,?,?,?)",
                    (entry["id"], entry["type"], entry["level"],
                     entry["time"], entry["timestamp"],
                     json.dumps(entry["payload"], ensure_ascii=False)),
                )
            db.commit()
        except Exception as e:
            logger.error("操作日志写入失败: %s", e)

    def get(self, limit: int = 50) -> List[Dict]:
        """获取最近 N 条操作日志 (缓冲区 + DB)"""
        buffer_items = list(self._buffer)

        if len(buffer_items) >= limit:
            result = list(reversed(buffer_items[-limit:]))
            return self._flatten(result)

        remaining = limit - len(buffer_items)
        rows = db.fetchall(
            "SELECT * FROM operation_logs ORDER BY timestamp DESC LIMIT ?",
            (remaining,),
        )
        db_items = []
        for r in rows:
            entry = dict(r)
            entry["payload"] = json.loads(entry.get("payload", "{}"))
            db_items.append(entry)

        # 缓冲区条目也展平 payload
        buf_flat = self._flatten(buffer_items)
        combined = db_items + buf_flat
        combined.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
        return combined[:limit]

    @staticmethod
    def _flatten(items: List[Dict]) -> List[Dict]:
        """将嵌套 payload 展平到顶层（兼容前端读取）"""
        result = []
        for entry in items:
            flat = {k: v for k, v in entry.items() if k != "payload"}
            if isinstance(entry.get("payload"), dict):
                flat.update(entry["payload"])
            result.append(flat)
        return result


# 全局单例
operation_logger = OperationLogger()

