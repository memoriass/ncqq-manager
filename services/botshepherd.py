"""
BotShepherd 集成管理器 - 已嵌入本项目，负责初始化、进程启停和状态查询
"""
import os, sys, signal, subprocess, asyncio, json, glob, shutil, threading, collections
from typing import Optional, Dict, Any, List
import aiohttp
from services.log import logger
from services.config import BASE_DIR


def _resolve_botshepherd_dir() -> str:
    """在 BASE_DIR 下查找 BotShepherd 目录，大小写不敏感（兼容 Linux/Windows）。"""
    for candidate in ("BotShepherd", "botshepherd", "BOTSHEPHERD"):
        path = os.path.join(BASE_DIR, candidate)
        if os.path.isdir(path):
            return path
    # fallback：扫描目录匹配（最健壮，适配任意大小写）
    try:
        for entry in os.listdir(BASE_DIR):
            if entry.lower() == "botshepherd" and os.path.isdir(os.path.join(BASE_DIR, entry)):
                return os.path.join(BASE_DIR, entry)
    except OSError:
        pass
    return os.path.join(BASE_DIR, "BotShepherd")  # 默认回退


BOTSHEPHERD_DIR = _resolve_botshepherd_dir()
BOTSHEPHERD_DEFAULT_PORT = 5100


def _get_venv_python() -> Optional[str]:
    """返回 BS venv 中的 python 路径（优先 .venv，fallback 旧 venv/）。"""
    for venv_name in (".venv", "venv"):
        venv_dir = os.path.join(BOTSHEPHERD_DIR, venv_name)
        if sys.platform == "win32":
            p = os.path.join(venv_dir, "Scripts", "python.exe")
        else:
            p = os.path.join(venv_dir, "bin", "python")
        if os.path.isfile(p):
            return p
    return None


def _ensure_bs_deps_async(uv_bin: str) -> bool:
    """在后台线程中用 uv 维护 BS/.venv：首次或 requirements.txt 更新后自动重装。"""
    req_file = os.path.join(BOTSHEPHERD_DIR, "requirements.txt")
    venv_dir = os.path.join(BOTSHEPHERD_DIR, ".venv")
    cfg_file = os.path.join(venv_dir, "pyvenv.cfg")

    if not os.path.isfile(req_file):
        return True

    need_install = not os.path.isfile(cfg_file)
    if not need_install:
        need_install = os.path.getmtime(req_file) > os.path.getmtime(cfg_file)
    if not need_install:
        return True

    if not os.path.isfile(cfg_file):
        r = subprocess.run(
            [uv_bin, "venv", ".venv", "--seed"],
            capture_output=True, text=True, cwd=BOTSHEPHERD_DIR,
        )
        if r.returncode != 0:
            logger.error(f"BS uv venv 创建失败: {r.stderr or r.stdout}")
            return False

    env = {**os.environ, "VIRTUAL_ENV": venv_dir, "PYTHONIOENCODING": "utf-8"}
    r = subprocess.run(
        [uv_bin, "pip", "install", "-q", "-r", "requirements.txt"],
        capture_output=True, text=True, cwd=BOTSHEPHERD_DIR,
        env=env, timeout=300,
    )
    if r.returncode != 0:
        logger.error(f"BS 依赖安装失败: {r.stderr or r.stdout}")
        return False
    logger.info("BS 依赖同步完成")
    return True


class BSApiClient:
    """异步 BS API 客户端 — 持久 aiohttp.ClientSession + cookie 复用 + 401 自动重登"""

    def __init__(self, manager: "BotShepherdManager"):
        self._mgr = manager
        self._session: Optional[aiohttp.ClientSession] = None
        self._authed = False

    @property
    def _base(self) -> str:
        return f"http://127.0.0.1:{self._mgr.port}"

    async def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            jar = aiohttp.CookieJar(unsafe=True)
            self._session = aiohttp.ClientSession(cookie_jar=jar)
            self._authed = False
        return self._session

    async def _login(self) -> bool:
        sess = await self._ensure_session()
        auth = self._mgr._read_bs_auth()
        try:
            async with sess.post(f"{self._base}/login", data=auth,
                                 timeout=aiohttp.ClientTimeout(total=5),
                                 allow_redirects=False) as r:
                self._authed = r.status in (200, 302)
                return self._authed
        except Exception:
            self._authed = False
            return False

    async def request(self, method: str, path: str, **kwargs) -> Optional[Any]:
        """通用请求：自动登录 + 401 重试"""
        if not self._mgr.running:
            return None
        sess = await self._ensure_session()
        if not self._authed:
            if not await self._login():
                return None
        url = f"{self._base}{path}"
        try:
            async with sess.request(method, url,
                                    timeout=aiohttp.ClientTimeout(total=10),
                                    **kwargs) as resp:
                if resp.status == 401:
                    if await self._login():
                        async with sess.request(method, url,
                                                timeout=aiohttp.ClientTimeout(total=10),
                                                **kwargs) as r2:
                            if r2.status == 200:
                                return await r2.json()
                    return None
                if resp.status == 200:
                    return await resp.json()
                body = await resp.json()
                return {"_error": True, "status": resp.status, **(body if isinstance(body, dict) else {"detail": body})}
        except Exception as e:
            logger.debug("BS API %s %s failed: %s", method, path, e)
            return None

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None
            self._authed = False

    def invalidate(self):
        """BS 重启后失效 session"""
        self._authed = False


class BotShepherdManager:
    _LOG_BUFFER_MAX = 500  # 环形缓冲区最大行数

    def __init__(self):
        self._process: Optional[subprocess.Popen] = None
        self._port: int = BOTSHEPHERD_DEFAULT_PORT
        self._auto_start: bool = True
        self.api: BSApiClient = None  # type: ignore  — 延迟初始化
        self._log_buffer: collections.deque = collections.deque(maxlen=self._LOG_BUFFER_MAX)
        self._log_thread: Optional[threading.Thread] = None

    # ---- 进程日志捕获 ----

    def _reader_worker(self, stream) -> None:
        """后台线程：持续从进程 stdout/stderr 读取行并存入环形缓冲区"""
        try:
            for raw_line in iter(stream.readline, b""):
                line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                self._log_buffer.append(line)
        except Exception:
            pass
        finally:
            try:
                stream.close()
            except Exception:
                pass

    def read_logs(self, lines: int = 100) -> List[str]:
        """返回最近 N 行进程控制台输出"""
        buf = list(self._log_buffer)
        return buf[-lines:] if lines < len(buf) else buf

    def _ensure_api(self) -> BSApiClient:
        if self.api is None:
            self.api = BSApiClient(self)
        return self.api

    @property
    def installed(self) -> bool:
        return os.path.isfile(os.path.join(BOTSHEPHERD_DIR, "main.py"))

    @property
    def initialized(self) -> bool:
        return os.path.isdir(os.path.join(BOTSHEPHERD_DIR, "config"))

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    @property
    def port(self) -> int:
        if self.installed:
            try:
                cfg = os.path.join(BOTSHEPHERD_DIR, "config", "global_config.json")
                if os.path.isfile(cfg):
                    with open(cfg, "r", encoding="utf-8") as f:
                        return json.load(f).get("web_port", self._port)
            except Exception:
                pass
        return self._port

    @property
    def pid(self) -> Optional[int]:
        return self._process.pid if self.running else None

    def status(self) -> Dict[str, Any]:
        return {
            "installed": self.installed, "initialized": self.initialized,
            "running": self.running, "port": self.port, "pid": self.pid,
            "auto_start": self._auto_start, "dir": BOTSHEPHERD_DIR,
            "webui_url": f"http://localhost:{self.port}" if self.running else None,
        }

    async def setup(self) -> Dict[str, Any]:
        if not self.installed:
            return {"status": "error", "message": f"botshepherd/ 目录缺失（检查路径: {BOTSHEPHERD_DIR}）"}
        logger.info("BotShepherd setup 开始...")

        # ── 步骤 1：用 uv 维护 .venv 与依赖 ──────────────────────────
        uv_bin = os.environ.get("UV_BIN") or shutil.which("uv")
        if uv_bin:
            ok = await asyncio.to_thread(_ensure_bs_deps_async, uv_bin)
            if not ok:
                return {"status": "error", "message": "BotShepherd 依赖安装失败，请查看服务端日志"}
        else:
            logger.warning("未检测到 uv，跳过依赖安装（若缺少依赖将在启动时报错）")

        # ── 步骤 2：用 .venv python 初始化配置目录（--setup）──────────
        python = _get_venv_python() or sys.executable
        env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
        proc = await asyncio.to_thread(
            subprocess.run,
            [python, "main.py", "--setup"],
            capture_output=True, text=True, cwd=BOTSHEPHERD_DIR, timeout=300, env=env,
        )
        if proc.returncode != 0:
            return {"status": "error", "message": proc.stderr or proc.stdout}
        logger.info("BotShepherd setup 完成")
        return {"status": "ok", "message": "setup complete"}

    def start(self) -> Dict[str, Any]:
        if self.running:
            return {"status": "ok", "message": "already running"}
        if not self.installed:
            return {"status": "error", "message": "not installed"}
        venv_py = _get_venv_python()
        python = venv_py if venv_py else sys.executable
        try:
            kw: Dict[str, Any] = {}
            if sys.platform == "win32":
                kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
            env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
            # BS WebServer 需要 BOTSHEPHERD_SECRET_KEY 作为 Flask session secret
            if "BOTSHEPHERD_SECRET_KEY" not in env:
                import secrets
                env["BOTSHEPHERD_SECRET_KEY"] = secrets.token_hex(32)
            self._log_buffer.clear()
            self._process = subprocess.Popen(
                [python, "main.py"], cwd=BOTSHEPHERD_DIR,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, **kw)
            # 后台线程读取进程输出，避免 PIPE 缓冲区满阻塞
            self._log_thread = threading.Thread(
                target=self._reader_worker, args=(self._process.stdout,),
                daemon=True, name="bs-log-reader")
            self._log_thread.start()
            logger.info("BotShepherd started, PID=%s", self._process.pid)
            self._ensure_api().invalidate()
            return {"status": "ok", "message": f"PID={self._process.pid}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def stop(self) -> Dict[str, Any]:
        if not self.running:
            return {"status": "ok", "message": "not running"}
        try:
            if sys.platform == "win32":
                self._process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                self._process.terminate()
            self._process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._process.kill()
        except Exception as e:
            return {"status": "error", "message": str(e)}
        self._process = None
        if self._log_thread and self._log_thread.is_alive():
            self._log_thread.join(timeout=2)
        self._log_thread = None
        self._ensure_api().invalidate()
        return {"status": "ok", "message": "stopped"}

    def set_auto_start(self, enabled: bool):
        self._auto_start = enabled

    def _read_bs_auth(self) -> Dict[str, str]:
        try:
            cfg = os.path.join(BOTSHEPHERD_DIR, "config", "global_config.json")
            if os.path.isfile(cfg):
                with open(cfg, "r", encoding="utf-8") as f:
                    data = json.load(f)
                auth = data.get("web_auth", {})
                return {"username": auth.get("username", "admin"),
                        "password": auth.get("password", "admin")}
        except Exception:
            pass
        return {"username": "admin", "password": "admin"}

    def _read_configs_from_dir(self, subdir: str) -> Dict[str, Any]:
        """从 BS config 子目录读取 JSON 文件（降级用）"""
        result: Dict[str, Any] = {}
        d = os.path.join(BOTSHEPHERD_DIR, "config", subdir)
        if not os.path.isdir(d):
            return result
        for fp in glob.glob(os.path.join(d, "*.json")):
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    result[os.path.splitext(os.path.basename(fp))[0]] = json.load(f)
            except Exception:
                pass
        return result

    # ---- 连接管理 ----

    async def get_connections(self) -> Dict[str, Any]:
        api = self._ensure_api()
        data = await api.request("GET", "/api/connections")
        if data is not None and not (isinstance(data, dict) and data.get("_error")):
            return {"source": "api", "connections": data}
        return {"source": "file", "connections": self._read_configs_from_dir("connections")}

    async def update_connection(self, conn_id: str, config: dict) -> Dict[str, Any]:
        api = self._ensure_api()
        r = await api.request("PUT", f"/api/connections/{conn_id}", json=config)
        if r is None:
            return {"success": False, "error": "BS 未运行或无法连接"}
        return r

    async def copy_connection(self, conn_id: str, body: dict) -> Dict[str, Any]:
        api = self._ensure_api()
        r = await api.request("POST", f"/api/connections/{conn_id}/copy", json=body)
        if r is None:
            return {"success": False, "error": "BS 未运行或无法连接"}
        return r

    async def delete_connection(self, conn_id: str) -> Dict[str, Any]:
        api = self._ensure_api()
        r = await api.request("DELETE", f"/api/connections/{conn_id}")
        if r is None:
            return {"success": False, "error": "BS 未运行或无法连接"}
        return r

    # ---- 账号管理 ----

    async def get_accounts(self) -> Dict[str, Any]:
        api = self._ensure_api()
        data = await api.request("GET", "/api/accounts")
        if data is not None and not (isinstance(data, dict) and data.get("_error")):
            return {"source": "api", "accounts": data}
        return {"source": "file", "accounts": self._read_configs_from_dir("account")}

    async def update_account(self, account_id: str, config: dict) -> Dict[str, Any]:
        api = self._ensure_api()
        r = await api.request("PUT", f"/api/accounts/{account_id}", json=config)
        if r is None:
            return {"success": False, "error": "BS 未运行或无法连接"}
        return r

    async def delete_account(self, account_id: str) -> Dict[str, Any]:
        api = self._ensure_api()
        r = await api.request("DELETE", f"/api/accounts/{account_id}")
        if r is None:
            return {"success": False, "error": "BS 未运行或无法连接"}
        return r

    async def get_account_online(self, account_id: str) -> Dict[str, Any]:
        api = self._ensure_api()
        r = await api.request("GET", f"/api/accounts/{account_id}/online-status")
        if r is None:
            return {"online": False, "error": "BS 未运行或无法连接"}
        return r


botshepherd_manager = BotShepherdManager()

