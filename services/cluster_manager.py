"""
集群/节点管理器 - SQLite 持久化

Phase 4: 新增 list_remote_containers_async() — aiohttp 替代 requests，
         消除 container_state.py 中最后的 run_in_executor 线程池依赖。
"""
import json
import os
import time
import asyncio
from typing import List, Dict, Optional, Any

import aiohttp
import requests
from concurrent.futures import ThreadPoolExecutor

from services.log import logger
from services.config import CONFIG_FILE, APP_VERSION
from services.docker_manager import docker_manager
import services.database as db


class ClusterManager:
    def __init__(self, config_file: str):
        self.config_file = config_file
        self._executor = ThreadPoolExecutor(max_workers=32)

    def init(self):
        """启动后初始化：同步 local 节点 api_key"""
        self._sync_local_node_key()

    def _sync_local_node_key(self):
        """启动时同步 local 节点的 api_key 与 config.json 保持一致"""
        from services.config import app_config
        config_key = app_config.get("api_key") or ""
        node = self._get_node("local")
        if node and node.get("api_key", "") != config_key:
            db.execute("UPDATE nodes SET api_key=? WHERE id='local'", (config_key,))
            db.commit()
            logger.info("已同步 local 节点 api_key 与 config.json")

    @staticmethod
    def _get_node(node_id: str) -> Optional[dict]:
        row = db.fetchone("SELECT * FROM nodes WHERE id=?", (node_id,))
        return db.row_to_dict(row)

    def get_nodes(self) -> List[Dict]:
        rows = db.fetchall("SELECT * FROM nodes")
        return db.rows_to_list(rows)

    def save_nodes(self, nodes: List[Dict]):
        """兼容旧调用：全量覆盖（先删后插）"""
        db.execute("DELETE FROM nodes")
        for n in nodes:
            db.execute(
                "INSERT INTO nodes (id,name,address,api_key) VALUES (?,?,?,?)",
                (n["id"], n["name"], n["address"], n.get("api_key", "")),
            )
        db.commit()

    def add_node(self, node_id: str, name: str, address: str, api_key: str = ""):
        db.execute(
            "INSERT INTO nodes (id,name,address,api_key) VALUES (?,?,?,?)",
            (node_id, name, address, api_key),
        )
        db.commit()

    def update_node(self, node_id: str, name: str, address: str, api_key: str = None):
        if api_key is not None:
            db.execute("UPDATE nodes SET name=?,address=?,api_key=? WHERE id=?",
                       (name, address, api_key, node_id))
        else:
            db.execute("UPDATE nodes SET name=?,address=? WHERE id=?",
                       (name, address, node_id))
        db.commit()

    def delete_node(self, node_id: str) -> bool:
        cur = db.execute("DELETE FROM nodes WHERE id=?", (node_id,))
        db.commit()
        return cur.rowcount > 0

    @staticmethod
    def _normalize_address(addr: str) -> str:
        if not addr.startswith("http"):
            addr = "http://" + addr
        return addr.rstrip("/")

    def get_nodes_with_status(self) -> List[Dict]:
        nodes = self.get_nodes()
        has_local = any(n.get("id") == "local" for n in nodes)
        if not has_local:
            nodes.insert(0, {
                "id": "local",
                "name": "本地节点",
                "address": "127.0.0.1"
            })

        def check_node(node: Dict) -> Dict:
            node_copy = node.copy()
            if node.get("id") == "local":
                import sys
                from services.config import app_config
                from services.daemon_monitor import daemon_monitor

                node_copy["status"] = "online"
                node_copy["ping"] = 0
                node_copy["api_key"] = app_config.get("api_key")
                node_copy["system"] = {
                    "cpu_percent": daemon_monitor.current_cpu,
                    "mem_percent": daemon_monitor.current_mem,
                    "platform": sys.platform,
                    "python_version": sys.version.split()[0],
                    "app_version": APP_VERSION,
                }
                node_copy["instances"] = daemon_monitor.get_instance_status()
                node_copy["chart"] = daemon_monitor.get_chart_data()
                return node_copy

            status = "offline"
            ping = -1
            system_info = {}
            instances_info = {}
            chart_info = {}
            try:
                addr = self._normalize_address(node["address"])
                start_time = time.time()
                resp = requests.get(
                    f"{addr}/api/cluster/status",
                    headers={"x-request-api-key": node.get("api_key", "")},
                    timeout=1.0,
                )
                ping = int((time.time() - start_time) * 1000)
                if resp.status_code == 200:
                    status = "online"
                    data = resp.json()
                    system_info = data.get("system", {})
                    instances_info = data.get("instances", {})
                    chart_info = data.get("chart", {})
            except requests.RequestException as e:
                logger.debug("节点 %s 连接失败: %s", node.get("id"), e)

            node_copy["status"] = status
            node_copy["ping"] = ping
            node_copy["system"] = system_info
            node_copy["instances"] = instances_info
            node_copy["chart"] = chart_info
            return node_copy

        # 复用实例级线程池，避免每次请求创建/销毁
        return list(self._executor.map(check_node, nodes))

    def list_all_containers(self) -> List[Dict]:
        nodes = self.get_nodes()
        all_containers = []

        local_containers = docker_manager.list_containers()
        for c in local_containers:
            c["node_id"] = "local"
            all_containers.append(c)

        all_containers.extend(self.list_remote_containers())
        return all_containers

    def list_remote_containers(self) -> List[Dict]:
        """获取所有远程节点的容器列表（sync requests + 线程池并行）。

        保留为 fallback — 供非异步上下文使用。
        container_state.py 已改用 list_remote_containers_async()。
        """
        nodes = self.get_nodes()

        def fetch_node_containers(node: Dict) -> List[Dict]:
            if node["id"] == "local":
                return []
            try:
                addr = self._normalize_address(node["address"])
                resp = requests.get(
                    f"{addr}/api/containers",
                    headers={"x-request-api-key": node.get("api_key", "")},
                    timeout=1.5,
                )
                if resp.status_code == 200:
                    containers = resp.json().get("containers", [])
                    for c in containers:
                        c["node_id"] = node["id"]
                    return containers
            except requests.RequestException as e:
                logger.warning("从节点 %s 获取容器失败: %s", node.get("id"), e)
            return []

        result: List[Dict] = []
        for containers in self._executor.map(fetch_node_containers, nodes):
            result.extend(containers)
        return result

    # ---- Phase 4: 全异步版本 — aiohttp 替代 requests ----

    async def list_remote_containers_async(self) -> List[Dict]:
        """异步获取所有远程节点的容器列表 — 并发 aiohttp，零线程。"""
        nodes = self.get_nodes()
        remote_nodes = [n for n in nodes if n.get("id") != "local"]
        if not remote_nodes:
            return []

        timeout = aiohttp.ClientTimeout(total=2, connect=1)

        async def _fetch_one(session: aiohttp.ClientSession,
                             node: Dict) -> List[Dict]:
            try:
                addr = self._normalize_address(node["address"])
                async with session.get(
                    f"{addr}/api/containers",
                    headers={"x-request-api-key": node.get("api_key", "")},
                    timeout=timeout,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json(content_type=None)
                        containers = data.get("containers", [])
                        for c in containers:
                            c["node_id"] = node["id"]
                        return containers
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                logger.debug("异步: 从节点 %s 获取容器失败: %s",
                             node.get("id"), e)
            return []

        async with aiohttp.ClientSession() as session:
            results = await asyncio.gather(
                *[_fetch_one(session, n) for n in remote_nodes],
                return_exceptions=True,
            )
        all_containers: List[Dict] = []
        for r in results:
            if isinstance(r, list):
                all_containers.extend(r)
        return all_containers

    def _proxy_to_node(self, node_id: str, method: str, path: str,
                       timeout: float = 2.5, **kwargs) -> Optional[requests.Response]:
        """通用远程节点请求代理"""
        nodes = self.get_nodes()
        node = next((n for n in nodes if n["id"] == node_id), None)
        if not node:
            logger.warning("节点 %s 不存在", node_id)
            return None
        try:
            addr = self._normalize_address(node["address"])
            resp = requests.request(
                method, f"{addr}{path}",
                headers={"x-request-api-key": node.get("api_key", "")},
                timeout=timeout,
                **kwargs,
            )
            return resp
        except requests.RequestException as e:
            logger.warning("代理请求到节点 %s 失败: %s", node_id, e)
            return None

    def action_container(self, node_id: str, name: str, action: str) -> bool:
        if node_id == "local" or not node_id:
            return docker_manager.action_container(name, action)
        resp = self._proxy_to_node(node_id, "POST", f"/api/containers/{name}/action?action={action}")
        return resp is not None and resp.status_code == 200

    def get_stats(self, node_id: str, name: str) -> Dict:
        if node_id == "local" or not node_id:
            return docker_manager.get_stats(name)
        resp = self._proxy_to_node(node_id, "GET", f"/api/containers/{name}/stats")
        if resp and resp.status_code == 200:
            stats = resp.json()
            stats["node_id"] = node_id
            return stats
        return {}

    def get_logs(self, node_id: str, name: str, lines: int = 100) -> str:
        if node_id == "local" or not node_id:
            return docker_manager.get_logs(name, lines)
        resp = self._proxy_to_node(node_id, "GET", f"/api/containers/{name}/logs?lines={lines}")
        if resp and resp.status_code == 200:
            return resp.json().get("logs", "")
        return ""

    def get_qr_status(self, node_id: str, name: str) -> Optional[Dict]:
        if node_id == "local" or not node_id:
            return None  # 本地由上层直接处理
        resp = self._proxy_to_node(node_id, "GET", f"/api/qr/{name}")
        if resp and resp.status_code == 200:
            return resp.json()
        return None


cluster_manager = ClusterManager(config_file=CONFIG_FILE)

