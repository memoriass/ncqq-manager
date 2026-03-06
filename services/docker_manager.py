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
from typing import List, Dict, Optional, Any

from services.log import logger
from services.config import get_data_dir


# 登录状态缓存：{container_name: {uin, nickname, ts, method}}
_login_cache: Dict[str, Dict] = {}
_LOGIN_CACHE_TTL = 15  # 秒，轮询间隔较大时缓存 15s

# Stats 缓存：{container_name: {stats_dict, ts}}
_stats_cache: Dict[str, Dict] = {}
_STATS_CACHE_TTL = 8  # 秒，stats 采集较慢(1-2s)，缓存 8s


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

    def list_containers(self) -> List[Dict]:
        if not self.client:
            return []
        try:
            containers = self.client.containers.list(all=True)
        except docker.errors.DockerException as e:
            logger.error("列举容器失败: %s", e)
            return []

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
        return res

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
            return c.logs(tail=lines).decode("utf-8", errors="replace")
        except docker.errors.NotFound:
            return ""
        except docker.errors.APIError as e:
            logger.error("获取容器 %s 日志失败: %s", name, e)
            return ""

    def get_container_file_binary(self, name: str, path: str) -> Optional[bytes]:
        """通过 docker cp (tar) 从容器内读取文件"""
        if not self.client:
            return None
        try:
            c = self.client.containers.get(name)
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
        except docker.errors.NotFound:
            return None
        except (docker.errors.APIError, tarfile.TarError, OSError) as e:
            logger.debug("读取容器文件 %s:%s 失败: %s", name, path, e)
            return None
        return None

    def get_basic_stats(self, name: str) -> Dict:
        """获取容器基础资源统计 (CPU / 内存)，带内存缓存（TTL 8s）"""
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

            stats = c.stats(stream=False)
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

        # Network endpoints — 从宿主机本地文件读取
        if info["uin"] != "未登录 / Not Logged In":
            try:
                cfg_path = os.path.join(get_data_dir(), name, "config", f"napcat_{info['uin']}.json")
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

        # Version from logs — 只取尾部 200 行（够用且快）
        try:
            logs_tail = c.logs(tail=200).decode("utf-8", errors="ignore")
            ver_match = re.search(r"NapCat\.Core Version:\s*([\d.]+)", logs_tail)
            if ver_match:
                info["version"] = ver_match.group(1)
        except docker.errors.APIError:
            pass

        return info

    def get_stats(self, name: str) -> Dict:
        """获取完整统计 (基础资源 + NapCat 信息 + 登录状态)

        登录检测在这里独立触发（有 15s 缓存），与 get_napcat_info 分离。
        get_napcat_info 只读缓存（零阻塞），确保页面不会因登录检测而卡住。
        """
        basic = self.get_basic_stats(name)
        if not basic:
            return {}
        napcat = self.get_napcat_info(name)
        # 独立触发登录检测（有缓存，大部分时间秒回）
        login = self.check_login_status(name)
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
        3. napcat_{uin}.json 存在 → 可提取 uin

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

            # 检查 1：/api/qrcode — 有 url 直接否决（确认未登录）
            try:
                qr_req = urllib.request.Request(
                    f"http://127.0.0.1:{webui_port}/api/qrcode",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                with urllib.request.urlopen(qr_req, timeout=1) as resp:
                    qr_data = json.loads(resp.read().decode("utf-8"))
                if qr_data.get("url"):
                    return {"logged_in": False}  # 有二维码 → 确认未登录
            except (urllib.error.URLError, json.JSONDecodeError, OSError):
                pass  # Unauthorized 或连接失败，继续后续检查

            # 检查 2：public/info 是否正常（NapCat 在运行）
            napcat_alive = False
            try:
                info_req = urllib.request.Request(
                    f"http://127.0.0.1:{webui_port}/plugin/napcat-plugin-builtin/api/public/info",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                with urllib.request.urlopen(info_req, timeout=1) as resp:
                    info_data = json.loads(resp.read().decode("utf-8"))
                if info_data.get("code") == 0 and "data" in info_data:
                    napcat_alive = True
            except (urllib.error.URLError, json.JSONDecodeError, OSError):
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

            # 检查 4：napcat_{uin}.json 存在 → 可提取 uin
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
        """从本地 napcat_*.json 文件名提取 uin（辅助信息，不用于登录判断）"""
        try:
            config_dir = os.path.join(get_data_dir(), name, "config")
            if not os.path.exists(config_dir):
                return ""
            napcat_files = [
                f for f in os.listdir(config_dir)
                if f.startswith("napcat_") and f.endswith(".json")
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

        带内存缓存（TTL=15s），force=True 跳过缓存（用户主动刷新时）。
        返回 {logged_in, uin, nickname, method} 或 {logged_in: False}

        预留方案 C：未来插件事件可直接写入 _login_cache，
        本方法读取时若缓存有效则直接返回，无需 API 调用。
        """
        now = time.time()

        if not force and name in _login_cache:
            cached = _login_cache[name]
            if now - cached.get("ts", 0) < _LOGIN_CACHE_TTL:
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
            images = self.client.images.list()
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

