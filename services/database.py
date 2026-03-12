"""
SQLite 数据库层 — 替代所有 JSON 文件存储
单一共享连接 + autocommit + 线程锁，彻底解决并发写入 "database is locked" 问题
"""
import os
import json
import sqlite3
import threading
from typing import Any, Dict, List, Optional

from services.log import logger
from services.config import CONFIG_DIR

DB_PATH = os.path.join(CONFIG_DIR, "app.db")

# 单一共享连接 + 全局锁（SQLite 本身单写入者，Python 层也需串行化）
_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(
            DB_PATH,
            timeout=30,
            check_same_thread=False,   # 允许跨线程使用同一连接
            isolation_level=None,      # autocommit: 每条 DML 自动提交，不持有隐式事务锁
        )
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _conn.execute("PRAGMA busy_timeout=10000")
        _conn.row_factory = sqlite3.Row
    return _conn


def init_db():
    """创建所有表（幂等）+ 执行增量迁移"""
    with _lock:
        conn = _get_conn()
        conn.executescript(_SCHEMA)
    _run_migrations()
    logger.info("SQLite 数据库已就绪: %s", DB_PATH)


def _run_migrations():
    """基于 schema_version 的增量迁移"""
    version = get_setting("schema_version", 0)
    if not isinstance(version, int):
        version = int(version)

    migrations = [
        # version 1: 添加 login_failures 表（S2 IP封禁持久化）
        # 已在 _SCHEMA 中通过 CREATE TABLE IF NOT EXISTS 处理
    ]

    target = len(migrations)
    if version >= target:
        return

    for i in range(version, target):
        try:
            with _lock:
                _get_conn().executescript(migrations[i])
            logger.info("数据库迁移 v%d → v%d 完成", i, i + 1)
        except Exception as e:
            logger.error("数据库迁移 v%d 失败: %s", i + 1, e)
            return

    set_setting("schema_version", target)
    commit()


_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    uuid       TEXT PRIMARY KEY,
    userName   TEXT UNIQUE NOT NULL,
    passWord   TEXT NOT NULL,
    permission INTEGER NOT NULL DEFAULT 1,
    registerTime TEXT DEFAULT '',
    loginTime  TEXT DEFAULT '',
    apiKey     TEXT DEFAULT '',
    instances  TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_users_apiKey ON users(apiKey);
CREATE INDEX IF NOT EXISTS idx_users_userName ON users(userName);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    uuid       TEXT NOT NULL,
    userName   TEXT NOT NULL,
    permission INTEGER NOT NULL,
    loginTime  TEXT DEFAULT '',
    created_at REAL NOT NULL,
    last_active REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_uuid ON sessions(uuid);

CREATE TABLE IF NOT EXISTS nodes (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    address TEXT NOT NULL,
    api_key TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS operation_logs (
    id        TEXT PRIMARY KEY,
    type      TEXT NOT NULL,
    level     TEXT NOT NULL DEFAULT 'info',
    time      TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    payload   TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_oplogs_ts ON operation_logs(timestamp DESC);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_failures (
    ip         TEXT PRIMARY KEY,
    count      INTEGER NOT NULL DEFAULT 0,
    first_fail REAL NOT NULL,
    last_fail  REAL NOT NULL
);
"""

# ──────────── settings 读写助手 ────────────

def get_setting(key: str, default: Any = None) -> Any:
    """从 settings 表读取一个配置值（JSON 反序列化）"""
    row = fetchone("SELECT value FROM settings WHERE key=?", (key,))
    if row is None:
        return default
    try:
        return json.loads(row["value"])
    except (json.JSONDecodeError, TypeError):
        return row["value"]


def set_setting(key: str, value: Any):
    """写入一个配置值（JSON 序列化）"""
    execute(
        "INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)",
        (key, json.dumps(value, ensure_ascii=False)),
    )


def get_all_settings() -> Dict[str, Any]:
    """读取所有 settings 返回字典"""
    rows = fetchall("SELECT key,value FROM settings")
    result: Dict[str, Any] = {}
    for r in rows:
        try:
            result[r["key"]] = json.loads(r["value"])
        except (json.JSONDecodeError, TypeError):
            result[r["key"]] = r["value"]
    return result


def execute(sql: str, params: tuple = ()) -> sqlite3.Cursor:
    with _lock:
        return _get_conn().execute(sql, params)


def executemany(sql: str, params_list: list) -> sqlite3.Cursor:
    with _lock:
        return _get_conn().executemany(sql, params_list)


def commit():
    """autocommit 模式下为 no-op，保持调用兼容"""
    pass


def close_db():
    """关闭数据库连接（应用关闭时调用）"""
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None
            logger.info("数据库连接已关闭")


def fetchone(sql: str, params: tuple = ()) -> Optional[sqlite3.Row]:
    with _lock:
        return _get_conn().execute(sql, params).fetchone()


def fetchall(sql: str, params: tuple = ()) -> List[sqlite3.Row]:
    with _lock:
        return _get_conn().execute(sql, params).fetchall()


def row_to_dict(row: Optional[sqlite3.Row]) -> Optional[dict]:
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows: List[sqlite3.Row]) -> List[dict]:
    return [dict(r) for r in rows]


