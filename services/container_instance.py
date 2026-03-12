"""
容器实例对象 — 借鉴 MCSM 的 Instance 模式

每个容器 = 一个 ContainerInstance 对象，状态/stats/QR/login 全部缓存在对象内。
查询时直接读对象属性，零 Docker API 调用。

设计：
  - to_public_dict()  → 替代 state_engine.get_containers() 中的 dict 拼装
  - to_stats_dict()   → 替代 state_engine.get_all_stats() 中的 raw dict
  - to_qr_dict()      → 替代 state_engine.get_qr_states() 中的 per-name dict
"""
import time
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class ContainerInstance:
    """容器实例对象 — 等价于 MCSM 的 Instance 类。"""

    # ---- 基础属性（来自 Docker API / cluster_manager） ----
    name: str
    container_id: str = ""        # Docker short_id
    status: str = "created"       # running / exited / created / ...
    image: str = ""
    node_id: str = "local"
    created: str = ""

    # ---- 端口映射（来自 Docker API inspect，供异步登录检测使用） ----
    http_port: int = 0            # OneBot HTTP 端口 (3000/tcp 映射)
    webui_port: int = 0           # NapCat WebUI 端口 (6099/tcp 映射)

    # ---- 登录状态（来自 check_login_status） ----
    uin: str = ""
    logged_in: bool = False
    login_ts: float = 0.0         # 上次登录检测时间戳

    # ---- QR 码状态（来自本地 qrcode.png 读取） ----
    qr_data: Optional[str] = None  # base64 data URL 或 None
    qr_ts: float = 0.0            # 上次 QR 更新时间戳

    # ---- 资源统计（来自 docker stats API） ----
    cpu_percent: float = 0.0
    mem_usage: float = 0.0        # MB — 字段名与 get_basic_stats() 保持一致
    mem_limit: float = 0.0        # MB
    stats_ts: float = 0.0         # 上次 stats 采集时间戳

    def to_public_dict(self) -> Dict:
        """容器列表 API 返回格式 — 兼容 state_engine.get_containers()。

        返回字段: id, name, status, image, created, node_id, uin(可选)
        """
        d: Dict = {
            "id": self.container_id,
            "name": self.name,
            "status": self.status,
            "image": self.image,
            "created": self.created,
            "node_id": self.node_id,
        }
        if self.logged_in and self.uin:
            d["uin"] = self.uin
        return d

    def to_stats_dict(self) -> Dict:
        """Stats API 返回格式 — 兼容 get_basic_stats() 输出。"""
        return {
            "status": self.status,
            "created": self.created,
            "cpu_percent": self.cpu_percent,
            "mem_usage": self.mem_usage,
            "mem_limit": self.mem_limit,
        }

    def to_qr_dict(self) -> Dict:
        """QR 状态 API 返回格式 — 兼容 state_engine.get_qr_states()[name]。"""
        if self.logged_in:
            return {"status": "logged_in", "uin": self.uin}
        if self.qr_data:
            return {"status": "ok", "url": self.qr_data, "type": "file"}
        return {"status": "waiting"}

    def update_login(self, logged_in: bool, uin: str = "", **_kw) -> None:
        """更新登录状态。"""
        self.logged_in = logged_in
        if logged_in and uin:
            self.uin = uin
        self.login_ts = time.time()

    def update_stats(self, cpu_percent: float = 0.0,
                     mem_usage: float = 0.0, mem_limit: float = 0.0,
                     **_kw) -> None:
        """更新资源统计。"""
        self.cpu_percent = cpu_percent
        self.mem_usage = mem_usage
        self.mem_limit = mem_limit
        self.stats_ts = time.time()

    def update_qr(self, qr_data: Optional[str]) -> None:
        """更新 QR 码数据。"""
        self.qr_data = qr_data
        self.qr_ts = time.time()

    def clear_runtime(self) -> None:
        """容器停止时清理运行时数据。"""
        self.cpu_percent = 0.0
        self.mem_usage = 0.0
        self.mem_limit = 0.0
        self.stats_ts = 0.0
        self.qr_data = None
        self.qr_ts = 0.0

