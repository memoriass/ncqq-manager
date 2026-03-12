#!/usr/bin/env python3
"""
NapCat QQ Manager - 一键启动部署脚本
用法:
    python start.py              # 默认启动 (端口 8000)
    python start.py --port 9000  # 指定端口
    python start.py --skip-build # 跳过前端构建
    python start.py --force-build # 强制重新构建前端
    python start.py --dev        # 开发模式 (热重载)
"""
import os
import sys
import subprocess
import argparse
import shutil
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
FRONTEND_DIST = os.path.join(FRONTEND_DIR, "dist")

# 关键 Python 依赖（安装后验证可导入）
REQUIRED_MODULES = ["fastapi", "uvicorn", "docker", "aiohttp", "aiodocker", "orjson"]

# ─── 终端彩色输出 ───
def _c(text: str, code: str) -> str:
    if sys.platform == "win32":
        _ = os.system("")  # 启用 Windows ANSI
    return f"\033[{code}m{text}\033[0m"

def info(msg: str) -> None:  print(_c(f"[✓] {msg}", "32"))
def warn(msg: str) -> None:  print(_c(f"[!] {msg}", "33"))
def fail(msg: str) -> None:  print(_c(f"[✗] {msg}", "31"))
def step(msg: str) -> None:  print(_c(f"\n>>> {msg}", "36;1"))

BANNER = r"""
 _   _             ____      _     __  __
| \ | | __ _ _ __ / ___|__ _| |_  |  \/  | __ _ _ __   __ _  __ _  ___ _ __
|  \| |/ _` | '_ \ |   / _` | __| | |\/| |/ _` | '_ \ / _` |/ _` |/ _ \ '__|
| |\  | (_| | |_) | |__| (_| | |_  | |  | | (_| | | | | (_| | (_| |  __/ |
|_| \_|\__,_| .__/ \____\__,_|\__| |_|  |_|\__,_|_| |_|\__,_|\__, |\___|_|
             |_|                                               |___/
"""

# ─── 检查项 ───

def check_python():
    """检查 Python 版本 >= 3.10"""
    step("检查 Python 环境")
    v = sys.version_info
    if v < (3, 10):
        fail(f"需要 Python >= 3.10，当前版本: {v.major}.{v.minor}.{v.micro}")
        sys.exit(1)
    info(f"Python {v.major}.{v.minor}.{v.micro}")


def check_pip_deps():
    """安装 Python 依赖并验证关键模块"""
    step("安装 Python 依赖")
    req = os.path.join(BASE_DIR, "requirements.txt")
    if not os.path.exists(req):
        fail("requirements.txt 未找到")
        sys.exit(1)
    r = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "-r", req],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        fail("pip install 失败:\n" + r.stderr)
        sys.exit(1)
    info("Python 依赖已安装")

    # 验证关键模块可导入
    missing = []
    for mod in REQUIRED_MODULES:
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    if missing:
        fail(f"以下模块安装后仍无法导入: {', '.join(missing)}")
        fail("请检查 pip 环境或手动安装: pip install " + " ".join(missing))
        sys.exit(1)
    info(f"关键依赖验证通过 ({len(REQUIRED_MODULES)} 个模块)")


def check_node():
    """检查 Node.js / npm"""
    step("检查 Node.js 环境")
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node or not npm:
        warn("未检测到 Node.js / npm，无法构建前端")
        warn("请安装 Node.js >= 16: https://nodejs.org/")
        return False
    v = subprocess.run([node, "--version"], capture_output=True, text=True)
    info(f"Node.js {v.stdout.strip()}")
    return True


def build_frontend():
    """构建前端"""
    step("构建前端资源")
    if not os.path.exists(os.path.join(FRONTEND_DIR, "package.json")):
        warn("frontend/package.json 不存在，跳过构建")
        return
    # npm install
    info("正在安装前端依赖 (npm install)...")
    r = subprocess.run(["npm", "install"], cwd=FRONTEND_DIR, shell=True)
    if r.returncode != 0:
        fail("npm install 失败")
        sys.exit(1)
    # npm run build
    info("正在构建前端 (npm run build)...")
    r = subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR, shell=True)
    if r.returncode != 0:
        fail("前端构建失败")
        sys.exit(1)
    info("前端构建成功")


def check_docker():
    """检查 Docker 可用性与版本"""
    step("检查 Docker 环境")
    docker = shutil.which("docker")
    if not docker:
        warn("未检测到 Docker，容器管理功能将不可用")
        warn("请安装 Docker >= 20.10: https://docs.docker.com/get-docker/")
        return
    r = subprocess.run(["docker", "info"], capture_output=True, text=True)
    if r.returncode != 0:
        warn("Docker 已安装但未运行或无权限")
        return
    # 检查版本号
    rv = subprocess.run(["docker", "version", "--format", "{{.Server.Version}}"],
                        capture_output=True, text=True)
    ver_str = rv.stdout.strip() if rv.returncode == 0 else ""
    m = re.match(r"(\d+)\.(\d+)", ver_str)
    if m:
        major, minor = int(m.group(1)), int(m.group(2))
        if major < 20 or (major == 20 and minor < 10):
            warn(f"Docker 版本 {ver_str} 较旧，建议升级到 >= 20.10")
        else:
            info(f"Docker {ver_str}")
    else:
        info("Docker 运行正常")


def start_server(port: int, dev: bool):
    """启动后端服务"""
    # 从配置读取 host（首次初始化设置中用户选择的绑定地址）
    from services.config import app_config, APP_VERSION
    host = app_config.get("host", "0.0.0.0")
    configured_port = app_config.get("port", 8000)
    # 命令行 --port 优先；否则使用配置文件中的端口
    actual_port = port if port != 8000 else configured_port

    step(f"启动 NapCat Manager v{APP_VERSION}")
    if not os.path.exists(FRONTEND_DIST):
        warn("前端未构建 (frontend/dist 不存在)，页面将显示提示信息")

    addr = f"http://{'localhost' if host == '0.0.0.0' else host}:{actual_port}"
    info(f"面板地址: {addr}")
    info(f"健康检查: {addr}/api/health")
    info(f"用户控制台: {addr}/user")

    if not app_config.get("initialized", False):
        info("首次启动 — 请打开浏览器完成初始化设置")

    # 架构信息
    step("运行时架构")
    info("Docker API: aiodocker 纯异步 (热路径 + CRUD)")
    info("集群通信: aiohttp 异步 HTTP")
    info("WS 推送: /ws/public 按页订阅 + orjson 序列化")
    info("事件驱动: Docker Events 实时感知 + 自适应轮询兜底")
    info("状态引擎: ContainerStateEngine 后台异步刷新")

    info("\n按 Ctrl+C 停止服务\n")
    try:
        import uvicorn
        uvicorn.run(
            "main:app",
            host=host,
            port=actual_port,
            reload=dev,
            log_level="info",
        )
    except KeyboardInterrupt:
        info("\n服务已停止")


# ─── 主流程 ───

def main():
    print(BANNER)
    parser = argparse.ArgumentParser(description="NapCat QQ Manager 一键启动")
    parser.add_argument("--port", type=int, default=8000, help="服务端口 (默认 8000)")
    parser.add_argument("--skip-build", action="store_true", help="跳过前端构建")
    parser.add_argument("--force-build", action="store_true", help="强制重新构建前端")
    parser.add_argument("--dev", action="store_true", help="开发模式 (热重载)")
    args = parser.parse_args()

    os.chdir(BASE_DIR)

    check_python()
    check_pip_deps()
    check_docker()

    if not args.skip_build:
        if check_node():
            if args.force_build or not os.path.exists(FRONTEND_DIST) or args.dev:
                build_frontend()
            else:
                info("前端已构建，使用 --force-build 强制重构建")
    else:
        info("已跳过前端构建 (--skip-build)")

    start_server(args.port, args.dev)


if __name__ == "__main__":
    main()