"""
统一日志模块 - 替代全项目的 print()
内含环形内存缓冲区，供 Web 控制台读取节点程序日志。
控制台输出结构化 JSON 格式，内存缓冲保持人类可读格式。
"""
import json
import logging
import sys
import time
from collections import deque
from typing import List


# ============ JSON Formatter ============

class JSONFormatter(logging.Formatter):
    """输出单行 JSON 日志，便于日志收集系统解析。"""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


# ============ 内存环形缓冲 Handler ============

class MemoryLogHandler(logging.Handler):
    """将日志写入内存 deque，供 API 层实时读取。"""

    def __init__(self, max_lines: int = 2000, level: int = logging.DEBUG):
        super().__init__(level)
        self._buffer: deque = deque(maxlen=max_lines)

    def emit(self, record: logging.LogRecord):
        try:
            self._buffer.append(self.format(record))
        except Exception:
            pass

    def get_logs(self, lines: int = 500) -> List[str]:
        """返回最近 N 行日志（从旧到新）"""
        buf = list(self._buffer)
        return buf[-lines:] if lines < len(buf) else buf


# 全局唯一内存 Handler 实例（人类可读格式，供 Web 控制台）
_memory_handler = MemoryLogHandler(max_lines=2000, level=logging.DEBUG)
_human_fmt = logging.Formatter(
    "[%(asctime)s] [%(name)s/%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
_memory_handler.setFormatter(_human_fmt)

# JSON formatter 用于控制台输出
_json_fmt = JSONFormatter()


def setup_logger(name: str = "ncqq", level: int = logging.INFO) -> logging.Logger:
    _logger = logging.getLogger(name)
    if _logger.handlers:
        return _logger
    _logger.setLevel(level)

    # 控制台输出（结构化 JSON）
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(_json_fmt)
    _logger.addHandler(handler)

    # 内存缓冲（Web 控制台读取，人类可读）
    _logger.addHandler(_memory_handler)
    return _logger


def attach_memory_handler_to(logger_name: str):
    """为第三方 logger（如 uvicorn）挂载内存 Handler，并将控制台输出改为 JSON。"""
    target = logging.getLogger(logger_name)
    if _memory_handler not in target.handlers:
        target.addHandler(_memory_handler)
    # 将已有的 StreamHandler 格式改为 JSON
    for h in target.handlers:
        if isinstance(h, logging.StreamHandler) and not isinstance(h, MemoryLogHandler):
            h.setFormatter(_json_fmt)


def get_node_logs(lines: int = 500) -> str:
    """供 API 层调用：读取节点程序日志"""
    return "\n".join(_memory_handler.get_logs(lines))


class _BSPollingFilter(logging.Filter):
    """过滤 BS 页面高频轮询的 access 日志，防止刷屏。

    匹配 uvicorn.access 格式：`GET /api/botshepherd/xxx HTTP/1.1`
    """
    _SKIP = (
        "/api/botshepherd/status",
        "/api/botshepherd/connections",
        "/api/botshepherd/accounts",
    )

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(p in msg for p in self._SKIP)


def suppress_bs_polling_logs() -> None:
    """在 uvicorn.access logger 及内存 handler 上挂载轮询过滤器，避免 BS 心跳请求刷屏。"""
    f = _BSPollingFilter()
    uvi_access = logging.getLogger("uvicorn.access")
    uvi_access.addFilter(f)
    # 同时过滤写入内存缓冲区的记录
    _memory_handler.addFilter(f)


logger = setup_logger()

