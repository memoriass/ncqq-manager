"""
Docker 容器管理器 - 重构版
修复: 裸 except → 具体异常, print → logger, import 整理
"""
import os
import re
import io
import json
import time
import tarfile
import urllib.request
import urllib.error
import docker
import docker.errors
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import List, Dict, Optional, Any

from services.log import logger
from services.config import get_data_dir


# 登录状态缓存：{container_name: {uin, nickname, ts, method}}
_login_cache: Dict[str, Dict] = {}
_LOGIN_CACHE_TTL = 30        # 秒，已登录容器无需频繁检查（前端降频后 8s 轮询）
_LOGIN_CACHE_TTL_FAIL = 8   # 秒，未登录容器短缓存（快速发现登录状态变化）

# Stats 缓存：{container_name: {stats_dict, ts}}
_stats_cache: Dict[str, Dict] = {}
_STATS_CACHE_TTL = 15  # 秒，stats 采集较慢(1-2s)，缓存 15s 匹配前端轮询周期

# 容器列表全局缓存（消除 WS/HTTP/batchQR 多路重复调用 Docker API）
_containers_cache: Dict[str, Any] = {"data": [], "ts": 0}
_CONTAINERS_CACHE_TTL = 3  # 秒

# Docker API 调用专用线程池（隔离卡死容器，避免阻塞主线程池）
# 60+ 实例场景：每实例 check_login 需 1-2 个线程，64 workers 可同时处理 32-64 实例
_docker_pool = ThreadPoolExecutor(max_workers=64, thread_name_prefix="docker-api")
_DOCKER_STATS_TIMEOUT = 3   # 秒，c.stats(stream=False) 超时
_DOCKER_LOGS_TIMEOUT = 2    # 秒，c.logs() 超时


def _normalize_uin(raw: str) -> str:
    """归一化 QQ 号：仅保留数字，去除 protocol_ 等前缀。"""
    return ''.join(ch for ch in str(raw) if ch.isdigit())


def read_login_cache(name: str) -> Dict[str, Any]:
    """公开接口：只读访问登录状态缓存（供 router 层使用，零阻塞）。"""
    return _login_cache.get(name, {})


class DockerManager:
    def __init__(self):
        try:
            self.client = docker.from_env()
            logger.info("Docker 连接成功")
        except docker.errors.DockerException as e:
            logger.error("Docker 连接失败: %s", e)
            self.client = None

    def list_containers(self, use_cache: bool = True) -> List[Dict]:
        """获取本地 NapCat 容器列表。

        use_cache=True 时使用全局缓存（3s TTL），避免 WS/HTTP/batchQR 多路重复调 Docker API。
        容器操作后应调 invalidate_containers_cache() 立即失效。
        """
        now = time.time()
        if use_cache and now - _containers_cache["ts"] < _CONTAINERS_CACHE_TTL:
            return _containers_cache["data"]

        if not self.client:
            return []
        try:
            future = _docker_pool.submit(self.client.containers.list, all=True)
            containers = future.result(timeout=5)
        except FuturesTimeoutError:
            logger.warning("Docker 容器列表获取超时")
            # 超时返回缓存兜底
            return _containers_cache.get("data", [])
        except docker.errors.DockerException as e:
            logger.error("列举容器失败: %s", e)
            return _containers_cache.get("data", [])

        res = []
        for c in containers:
            try:
                tags_str = str(c.image.tags).lower()
            except (AttributeError, IndexError):
                tags_str = ""
            if "napcat" in tags_str or "napcat" in c.name.lower():
                res.append({
                    "id": c.short_id,
                    "name": c.name,
                    "status": c.status,
                    "image": str(c.image.tags[0]) if c.image.tags else "unknown",
                    "created": c.attrs.get("Created", ""),
                })
        _containers_cache["data"] = res
        _containers_cache["ts"] = now
        return res

    @staticmethod
    def invalidate_containers_cache():
        """操作后立即失效容器列表缓存，使下次请求直接查询 Docker。"""
        _containers_cache["ts"] = 0

    def create_container(
        self, name: str,
        volumes: Optional[Dict] = None,
        ports: Optional[Dict] = None,
        docker_image: str = "mlikiowa/napcat-docker:latest",
        **extra_kwargs,
    ) -> Optional[str]:
        if not self.client:
            return None
        try:
            run_kwargs = {
                "name": name,
                "detach": True,
                "environment": extra_kwargs.pop("environment", {"ACCOUNT": ""}),
                "restart_policy": extra_kwargs.pop("restart_policy", {"Name": "always"}),
            }
            if volumes:
                run_kwargs["volumes"] = volumes
            if ports:
                run_kwargs["ports"] = ports
            # 合并高级参数 (mem_limit, network_mode 等)
            run_kwargs.update(extra_kwargs)

            container = self.client.containers.run(docker_image, **run_kwargs)
            logger.info("容器 %s 创建成功 (id=%s)", name, container.short_id)
            return container.short_id
        except docker.errors.ImageNotFound:
            logger.error("镜像 %s 不存在，请先拉取", docker_image)
            return None
        except docker.errors.APIError as e:
            logger.error("创建容器 %s 失败: %s", name, e)
            return None

    def action_container(self, name: str, action: str) -> bool:
        if not self.client:
            return False
        try:
            c = self.client.containers.get(name)
            if action == "start":
                c.start()
            elif action == "stop":
                c.stop()
            elif action == "restart":
                c.restart()
            elif action == "pause":
                c.pause()
            elif action == "unpause":
                c.unpause()
            elif action == "kill":
                c.kill()
            elif action == "delete":
                try:
                    c.stop(timeout=2)
                except docker.errors.APIError:
                    pass
                c.remove(force=True)
            else:
                logger.warning("未知操作: %s", action)
                return False
            logger.info("容器 %s 执行 [%s] 成功", name, action)
            return True
        except docker.errors.NotFound:
            logger.error("容器 %s 不存在", name)
            return False
        except docker.errors.APIError as e:
            logger.error("容器 %s 执行 [%s] 失败: %s", name, action, e)
            return False

    def get_logs(self, name: str, lines: int = 100) -> str:
        if not self.client:
            return ""
        try:
            c = self.client.containers.get(name)
            future = _docker_pool.submit(c.logs, tail=lines)
            raw = future.result(timeout=_DOCKER_LOGS_TIMEOUT + 3)
            return raw.decode("utf-8", errors="replace")
        except docker.errors.NotFound:
            return ""
        except FuturesTimeoutError:
            logger.warning("容器 %s 日志获取超时", name)
            return "[日志获取超时，容器可能无响应]\n"
        except docker.errors.APIError as e:
            logger.error("获取容器 %s 日志失败: %s", name, e)
            return ""

    def get_container_file_binary(self, name: str, path: str) -> Optional[bytes]:
        """通过 docker cp (tar) 从容器内读取文件，带超时保护"""
        if not self.client:
            return None
        try:
            c = self.client.containers.get(name)

            def _read_archive():
                bits, _ = c.get_archive(path)
                tar_stream = io.BytesIO()
                for chunk in bits:
                    tar_stream.write(chunk)
                tar_stream.seek(0)
                with tarfile.open(fileobj=tar_stream) as tar:
                    member = tar.next()
                    if member:
                        file_obj = tar.extractfile(member)
                        if file_obj:
                            return file_obj.read()
                return None

            future = _docker_pool.submit(_read_archive)
            return future.result(timeout=5)
        except FuturesTimeoutError:
            logger.warning("容器 %s 文件读取超时: %s", name, path)
            return None
        except docker.errors.NotFound:
            return None
        except (docker.errors.APIError, tarfile.TarError, OSError) as e:
            logger.debug("读取容器文件 %s:%s 失败: %s", name, path, e)
            return None
        return None

    def get_basic_stats(self, name: str) -> Dict:
        """获取容器基础资源统计 (CPU / 内存)，带内存缓存（TTL 8s）。
        Docker stats API 有超时保护，避免卡死容器阻塞线程池。
        """
        now = time.time()
        cached = _stats_cache.get(name)
        if cached and now - cached.get("_ts", 0) < _STATS_CACHE_TTL:
            return {k: v for k, v in cached.items() if k != "_ts"}

        if not self.client:
            return {}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                result = {
                    "status": c.status,
                    "created": c.attrs.get("Created", ""),
                    "cpu_percent": 0.0,
                    "mem_usage": 0.0,
                    "mem_limit": 0.0,
                }
                _stats_cache[name] = {**result, "_ts": now}
                return result

            # 用线程池 + 超时包裹 Docker stats API，防止卡死容器阻塞
            future = _docker_pool.submit(c.stats, stream=False)
            try:
                stats = future.result(timeout=_DOCKER_STATS_TIMEOUT)
            except (FuturesTimeoutError, Exception) as e:
                logger.warning("容器 %s stats 超时或异常: %s", name, e)
                # 超时时返回上次缓存或零值
                if cached:
                    return {k: v for k, v in cached.items() if k != "_ts"}
                return {
                    "status": c.status,
                    "created": c.attrs.get("Created", ""),
                    "cpu_percent": 0.0, "mem_usage": 0.0, "mem_limit": 0.0,
                }

            mem_usage = stats.get("memory_stats", {}).get("usage", 0)
            mem_limit = stats.get("memory_stats", {}).get("limit", 0)
            cpu_delta = (
                stats.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
                - stats.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
            )
            system_delta = (
                stats.get("cpu_stats", {}).get("system_cpu_usage", 0)
                - stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
            )
            cpu_percent = 0.0
            if system_delta > 0 and cpu_delta > 0:
                percpu = stats.get("cpu_stats", {}).get("cpu_usage", {}).get("percpu_usage", [1])
                cpu_percent = (cpu_delta / system_delta) * len(percpu) * 100.0

            result = {
                "status": c.status,
                "created": c.attrs.get("Created", ""),
                "cpu_percent": round(cpu_percent, 2),
                "mem_usage": round(mem_usage / 1024 / 1024, 2),
                "mem_limit": round(mem_limit / 1024 / 1024, 2),
            }
            _stats_cache[name] = {**result, "_ts": now}
            return result
        except docker.errors.NotFound:
            return {}
        except docker.errors.APIError as e:
            logger.error("获取容器 %s 统计失败: %s", name, e)
            return {}

    def get_napcat_info(self, name: str) -> Dict:
        """获取 NapCat 扩展信息 (UIN, 版本, WebUI token 等)"""
        info: Dict = {
            "uin": "未登录 / Not Logged In",
            "version": "Unknown",
            "webui_token": "",
            "webui_port": 0,
            "http_port": 0,
            "platform": "",
            "uptime_formatted": "",
            "network_endpoints": {"http": 0, "ws": 0, "http_client": 0, "ws_client": 0},
        }
        if not self.client:
            return info

        try:
            c = self.client.containers.get(name)
        except docker.errors.NotFound:
            return info

        # 端口解析 — 使用公共方法
        info["webui_port"] = self.resolve_host_port(c, "6099/tcp")
        info["http_port"] = self.resolve_host_port(c, "3000/tcp")

        # WebUI token — 优先从宿主机本地文件读取
        try:
            local_webui = os.path.join(get_data_dir(), name, "config", "webui.json")
            if os.path.exists(local_webui):
                with open(local_webui, "r", encoding="utf-8") as f:
                    w_config = json.loads(f.read())
                    if "token" in w_config:
                        info["webui_token"] = w_config["token"]
        except (json.JSONDecodeError, OSError):
            pass

        # UIN — 只读内存缓存（由 get_stats 定期写入，不在此触发 API 调用）
        cached = _login_cache.get(name, {})
        if cached.get("logged_in") and cached.get("uin"):
            info["uin"] = cached["uin"]
            self._sync_webui_auto_login(name, cached["uin"])

        # NapCat API info
        try:
            if info.get("webui_port"):
                url = f"http://127.0.0.1:{info['webui_port']}/plugin/napcat-plugin-builtin/api/public/info"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=1) as response:
                    api_out = json.loads(response.read().decode("utf-8"))
                    if api_out.get("code") == 0 and "data" in api_out:
                        info["uptime_formatted"] = api_out["data"].get("uptimeFormatted", "")
                        info["platform"] = api_out["data"].get("platform", "")
        except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
            pass

        # Network endpoints — 从宿主机本地 onebot11_{uin}.json 文件读取
        if info["uin"] != "未登录 / Not Logged In":
            try:
                cfg_path = os.path.join(get_data_dir(), name, "config", f"onebot11_{info['uin']}.json")
                if os.path.exists(cfg_path):
                    with open(cfg_path, "r", encoding="utf-8") as f:
                        uin_config = json.loads(f.read())
                    net = uin_config.get("network", {})
                    info["network_endpoints"]["http"] = len([s for s in net.get("httpServers", []) if s.get("enable")])
                    info["network_endpoints"]["ws"] = len([s for s in net.get("websocketServers", []) if s.get("enable")])
                    info["network_endpoints"]["http_client"] = len([s for s in net.get("httpClients", []) if s.get("enable")])
                    info["network_endpoints"]["ws_client"] = len([s for s in net.get("websocketClients", []) if s.get("enable")])
            except (json.JSONDecodeError, OSError):
                pass

        # Version from logs — 用线程池 + 超时包裹，防止卡死容器阻塞
        try:
            future = _docker_pool.submit(c.logs, tail=200)
            raw_logs = future.result(timeout=_DOCKER_LOGS_TIMEOUT)
            logs_tail = raw_logs.decode("utf-8", errors="ignore")
            ver_match = re.search(r"NapCat\.Core Version:\s*([\d.]+)", logs_tail)
            if ver_match:
                info["version"] = ver_match.group(1)
        except (FuturesTimeoutError, docker.errors.APIError, Exception):
            pass

        return info

    def get_stats(self, name: str) -> Dict:
        """获取完整统计 (基础资源 + NapCat 信息 + 登录状态)。

        三个子任务并行执行，各自有超时保护，单个子任务失败不阻塞其他。
        """
        # 并行提交三个子任务
        f_basic = _docker_pool.submit(self.get_basic_stats, name)
        f_napcat = _docker_pool.submit(self.get_napcat_info, name)
        f_login = _docker_pool.submit(self.check_login_status, name)

        try:
            basic = f_basic.result(timeout=_DOCKER_STATS_TIMEOUT + 1)
        except Exception:
            basic = {}
        if not basic:
            return {}

        try:
            napcat = f_napcat.result(timeout=_DOCKER_LOGS_TIMEOUT + 2)
        except Exception:
            napcat = {}

        try:
            login = f_login.result(timeout=4)
        except Exception:
            login = {}

        if login.get("logged_in") and login.get("uin"):
            napcat["uin"] = login["uin"]
        return {**basic, **napcat}

    # ============ 端口解析 ============

    def resolve_host_port(self, container, internal_port: str) -> int:
        """从容器对象解析内部端口对应的宿主机映射端口，返回 0 表示未找到"""
        try:
            ports_dict = container.attrs.get("NetworkSettings", {}).get("Ports", {})
            if internal_port in ports_dict and ports_dict[internal_port]:
                return int(ports_dict[internal_port][0]["HostPort"])
        except (KeyError, IndexError, ValueError):
            pass
        try:
            hc_ports = container.attrs.get("HostConfig", {}).get("PortBindings", {})
            if internal_port in hc_ports and hc_ports[internal_port]:
                return int(hc_ports[internal_port][0]["HostPort"])
        except (KeyError, IndexError, ValueError):
            pass
        return 0

    # ============ 登录状态检测（A+B 级联，预留 C 插件事件） ============

    def check_login_via_onebot(self, name: str) -> Dict:
        """方案 A：通过 OneBot 11 HTTP API /get_login_info 检测。
        已登录 → {logged_in: True, uin, nickname, method: 'onebot'}
        未登录 → {logged_in: False}
        """
        if not self.client:
            return {"logged_in": False}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                return {"logged_in": False}
            http_port = self.resolve_host_port(c, "3000/tcp")
            if not http_port:
                return {"logged_in": False}
            req = urllib.request.Request(
                f"http://127.0.0.1:{http_port}/get_login_info",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            if result.get("status") == "ok" and result.get("data", {}).get("user_id"):
                uid = str(result["data"]["user_id"])
                if uid and uid != "0":
                    return {
                        "logged_in": True,
                        "uin": uid,
                        "nickname": result["data"].get("nickname", ""),
                        "method": "onebot",
                    }
        except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
            pass
        except docker.errors.NotFound:
            pass
        return {"logged_in": False}

    def check_login_via_webui(self, name: str) -> Dict:
        """方案 B：通过 NapCat WebUI + 本地文件综合检测。

        三重验证（全部满足才确认已登录）：
        1. public/info 正常返回 → NapCat 在运行
        2. qrcode.png 停止刷新（mtime > 30s）→ 不在输出二维码
        3. onebot11_{uin}.json 或 napcat_{uin}.json 存在 → 可提取 uin

        单一否决：
        - /api/qrcode 返回包含 url 的有效数据 → 确认未登录
        """
        if not self.client:
            return {"logged_in": False}
        try:
            c = self.client.containers.get(name)
            if c.status != "running":
                return {"logged_in": False}
            webui_port = self.resolve_host_port(c, "6099/tcp")
            if not webui_port:
                return {"logged_in": False}

            # 检查 1 + 2 并行：qrcode 和 public/info 同时请求（从 2s→1s）
            def _fetch_qrcode():
                try:
                    qr_req = urllib.request.Request(
                        f"http://127.0.0.1:{webui_port}/api/qrcode",
                        headers={"User-Agent": "Mozilla/5.0"},
                    )
                    with urllib.request.urlopen(qr_req, timeout=1) as resp:
                        return json.loads(resp.read().decode("utf-8"))
                except (urllib.error.URLError, json.JSONDecodeError, OSError):
                    return None

            def _fetch_public_info():
                try:
                    info_req = urllib.request.Request(
                        f"http://127.0.0.1:{webui_port}/plugin/napcat-plugin-builtin/api/public/info",
                        headers={"User-Agent": "Mozilla/5.0"},
                    )
                    with urllib.request.urlopen(info_req, timeout=1) as resp:
                        return json.loads(resp.read().decode("utf-8"))
                except (urllib.error.URLError, json.JSONDecodeError, OSError):
                    return None

            f_qr = _docker_pool.submit(_fetch_qrcode)
            f_info = _docker_pool.submit(_fetch_public_info)

            try:
                qr_data = f_qr.result(timeout=2)
            except Exception:
                qr_data = None
            if qr_data and qr_data.get("url"):
                return {"logged_in": False}  # 有二维码 → 确认未登录

            napcat_alive = False
            try:
                info_data = f_info.result(timeout=2)
                if info_data and info_data.get("code") == 0 and "data" in info_data:
                    napcat_alive = True
            except Exception:
                pass

            # 检查 3：qrcode.png 是否停止刷新（mtime > 30s = 不在活跃输出二维码）
            qr_stale = False
            try:
                qr_path = os.path.join(get_data_dir(), name, "cache", "qrcode.png")
                if os.path.exists(qr_path):
                    age = time.time() - os.path.getmtime(qr_path)
                    qr_stale = age > 30
                else:
                    # 文件不存在也视为"不在输出"（可能登录后被清理）
                    qr_stale = True
            except OSError:
                pass

            # 检查 4：onebot11_{uin}.json / napcat_{uin}.json 存在 → 可提取 uin
            uin = self._get_uin_from_config(name)

            # 三重验证：NapCat 在运行 + 二维码停止刷新 + 有 uin
            if napcat_alive and qr_stale and uin:
                return {
                    "logged_in": True,
                    "uin": uin,
                    "nickname": "",
                    "method": "webui",
                }

        except docker.errors.NotFound:
            pass
        return {"logged_in": False}

    def _get_uin_from_config(self, name: str) -> str:
        """从本地 onebot11_*.json 文件名提取 uin（辅助信息，不用于登录判断）"""
        try:
            config_dir = os.path.join(get_data_dir(), name, "config")
            if not os.path.exists(config_dir):
                return ""
            # 优先匹配 onebot11_{uin}.json（最可靠）
            ob_files = [
                f for f in os.listdir(config_dir)
                if f.startswith("onebot11_") and f.endswith(".json")
            ]
            if ob_files:
                latest = max(
                    ob_files,
                    key=lambda f: os.path.getmtime(os.path.join(config_dir, f)),
                )
                raw = latest.replace("onebot11_", "").replace(".json", "")
                return _normalize_uin(raw)
            # 回退：napcat_{uin}.json（排除 napcat_protocol_*）
            napcat_files = [
                f for f in os.listdir(config_dir)
                if f.startswith("napcat_") and f.endswith(".json")
                and not f.startswith("napcat_protocol_")
            ]
            if napcat_files:
                latest = max(
                    napcat_files,
                    key=lambda f: os.path.getmtime(os.path.join(config_dir, f)),
                )
                raw = latest.replace("napcat_", "").replace(".json", "")
                return _normalize_uin(raw)
        except OSError:
            pass
        return ""

    def _sync_webui_auto_login(self, name: str, uin: str) -> None:
        """登录成功后自动同步 webui.json 中的 autoLoginAccount"""
        try:
            local_webui = os.path.join(get_data_dir(), name, "config", "webui.json")
            if not os.path.exists(local_webui):
                return
            with open(local_webui, "r", encoding="utf-8") as wf:
                w_config = json.loads(wf.read())

            modified = False
            if "login" not in w_config or not isinstance(w_config["login"], dict):
                w_config["login"] = {}
                modified = True

            login_cfg = w_config["login"]
            if login_cfg.get("account") != uin:
                login_cfg["account"] = uin
                login_cfg["password"] = ""
                modified = True
            if login_cfg.get("autoLoginAccount") != uin:
                login_cfg["autoLoginAccount"] = uin
                modified = True
            if w_config.get("autoLoginAccount") != uin:
                w_config["autoLoginAccount"] = uin
                modified = True

            if modified:
                with open(local_webui, "w", encoding="utf-8") as wf:
                    json.dump(w_config, wf, indent=4, ensure_ascii=False)
        except (json.JSONDecodeError, OSError, KeyError) as e:
            logger.debug("同步自动登录配置失败: %s", e)

    def check_login_status(self, name: str, force: bool = False) -> Dict:
        """级联检测登录状态：A(OneBot) → B(WebUI)。

        双层 TTL 缓存：已登录 30s / 未登录 8s。force=True 跳过缓存（用户主动刷新时）。
        返回 {logged_in, uin, nickname, method} 或 {logged_in: False}
        """
        now = time.time()

        if not force and name in _login_cache:
            cached = _login_cache[name]
            ttl = _LOGIN_CACHE_TTL if cached.get("logged_in") else _LOGIN_CACHE_TTL_FAIL
            if now - cached.get("ts", 0) < ttl:
                return cached

        # 层 1: OneBot HTTP API（最可靠）
        result = self.check_login_via_onebot(name)
        if result["logged_in"]:
            result["ts"] = now
            _login_cache[name] = result
            return result

        # 层 2: WebUI API
        result = self.check_login_via_webui(name)
        if result["logged_in"]:
            result["ts"] = now
            _login_cache[name] = result
            return result

        # 全部失败 → 未登录（短缓存避免频繁请求）
        result = {"logged_in": False, "ts": now}
        _login_cache[name] = result
        return result

    def batch_check_login(self, names: List[str], timeout: float = 6.0) -> Dict[str, Dict]:
        """批量并行检测多个容器的登录状态。

        双层缓存 TTL：已登录 30s / 未登录 8s。
        缓存命中的直接返回，未命中的并行 API 探测（线程池）。
        """
        results: Dict[str, Dict] = {}
        need_check: List[str] = []
        now = time.time()

        # 先过滤：缓存命中的直接返回，无需占线程池
        for name in names:
            cached = _login_cache.get(name, {})
            ttl = _LOGIN_CACHE_TTL if cached.get("logged_in") else _LOGIN_CACHE_TTL_FAIL
            if now - cached.get("ts", 0) < ttl:
                results[name] = cached
            else:
                need_check.append(name)

        if not need_check:
            return results

        # 并行提交未命中缓存的检测任务
        futures = {
            _docker_pool.submit(self.check_login_status, name): name
            for name in need_check
        }
        from concurrent.futures import as_completed
        for future in as_completed(futures, timeout=timeout):
            name = futures[future]
            try:
                results[name] = future.result(timeout=0.1)
            except Exception:
                results[name] = {"logged_in": False}
        # 超时未完成的标记为未登录
        for name in need_check:
            if name not in results:
                results[name] = {"logged_in": False}
        return results

    @staticmethod
    def update_login_cache(name: str, event: Dict) -> None:
        """方案 C 预留：插件事件直接更新缓存。
        event 格式: {event: 'login'|'logout', uin, nickname}
        """
        if event.get("event") == "login" and event.get("uin"):
            _login_cache[name] = {
                "logged_in": True,
                "uin": str(event["uin"]),
                "nickname": event.get("nickname", ""),
                "method": "plugin",
                "ts": time.time(),
            }
        elif event.get("event") == "logout":
            _login_cache[name] = {
                "logged_in": False,
                "ts": time.time(),
            }

    def get_used_ports(self) -> set:
        """扫描所有已使用的宿主机端口（Docker容器 + 系统监听）"""
        used = set()
        # 1. Docker 容器端口
        if self.client:
            try:
                for c in self.client.containers.list(all=True):
                    ports_dict = c.attrs.get("NetworkSettings", {}).get("Ports", {})
                    for _, bindings in ports_dict.items():
                        if bindings:
                            for b in bindings:
                                try:
                                    used.add(int(b["HostPort"]))
                                except (KeyError, ValueError):
                                    pass
            except docker.errors.APIError:
                pass
        # 2. 系统监听端口（用 psutil 快速获取，避免逐端口 socket 扫描）
        try:
            import psutil
            for conn in psutil.net_connections(kind="tcp"):
                if conn.status == "LISTEN" and conn.laddr:
                    used.add(conn.laddr.port)
        except (ImportError, OSError, AttributeError):
            pass
        return used

    def find_available_port(self, base: int, used_ports: set) -> int:
        """从 base 开始找到下一个可用端口（不超过 65535）"""
        port = base
        while port in used_ports:
            port += 1
            if port > 65535:
                raise ValueError(f"没有可用端口（从 {base} 开始，所有端口均被占用）")
        return port

    # ============ 镜像管理 ============

    def list_images(self) -> List[Dict]:
        """列出本地 Docker 镜像"""
        if not self.client:
            return []
        try:
            future = _docker_pool.submit(self.client.images.list)
            images = future.result(timeout=_DOCKER_STATS_TIMEOUT)
            result = []
            for img in images:
                tags = img.tags or []
                size_mb = round(img.attrs.get("Size", 0) / 1024 / 1024, 1)
                created = img.attrs.get("Created", "")
                result.append({
                    "id": img.short_id.replace("sha256:", ""),
                    "tags": tags,
                    "size": size_mb,
                    "created": created,
                })
            return result
        except FuturesTimeoutError:
            logger.warning("Docker 镜像列表获取超时")
            return []
        except docker.errors.DockerException as e:
            logger.error("列举镜像失败: %s", e)
            return []

    def pull_image(self, image_name: str) -> bool:
        """拉取 Docker 镜像"""
        if not self.client:
            return False
        try:
            self.client.images.pull(image_name)
            logger.info("镜像拉取成功: %s", image_name)
            return True
        except docker.errors.DockerException as e:
            logger.error("镜像拉取失败 %s: %s", image_name, e)
            return False

    def delete_image(self, image_id: str, force: bool = False) -> bool:
        """删除 Docker 镜像"""
        if not self.client:
            return False
        try:
            self.client.images.remove(image_id, force=force)
            logger.info("镜像删除成功: %s", image_id)
            return True
        except docker.errors.DockerException as e:
            logger.error("镜像删除失败 %s: %s", image_id, e)
            return False


docker_manager = DockerManager()

