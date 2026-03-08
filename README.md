# NapCat QQ Manager

<p align="center">
  <strong>NapCat 容器管理面板</strong><br>
  优雅地进行 NapCat QQ Bot Docker 容器生命周期管理
</p>

---

## ✨ 功能特性

- 🐳 **容器管理** — 一键创建、启动、停止、重启、删除 NapCat Docker 容器
- 📱 **扫码登录** — WebUI 内直接展示二维码，扫码即可登录 QQ Bot
- 🌐 **多节点集群** — 支持多台服务器的远程节点管理，统一面板操控
- 🔧 **配置管理** — 在线编辑 OneBot11 网络配置（HTTP/WS/SSE 服务端与客户端）
- 👥 **用户系统** — 管理员/普通用户分权，普通用户仅可管理自己的实例
- 📊 **实时监控** — CPU/内存使用率实时图表，节点延迟检测
- 📝 **操作日志** — 完整的操作审计记录
- ⏰ **定时任务** — 支持定时重启等自动化运维
- 🔔 **告警系统** — 容器异常通知
- 🌙 **深色模式** — 自动适配系统主题，支持毛玻璃透明卡片
- 🌍 **国际化** — 中文 / English 双语支持

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Python 3.8+ · FastAPI · Uvicorn · Docker SDK |
| **前端** | React 18 · TypeScript · Vite · Material UI (MUI) |
| **数据库** | SQLite（零配置，自动初始化） |
| **容器化** | Docker · Docker Compose |

## 🚀 快速开始

### 方式一：Docker Compose（推荐）

```bash
git clone https://github.com/your-repo/ncqq-manager.git
cd ncqq-manager
docker compose up -d
```

打开浏览器访问 `http://localhost:8000`，按引导完成初始化设置。

### 方式二：手动部署

**环境要求**：Python 3.8+、Node.js 18+、Docker

```bash
# 克隆项目
git clone https://github.com/your-repo/ncqq-manager.git
cd ncqq-manager

# 一键启动（自动安装依赖 + 构建前端 + 启动服务）
python start.py
```

或手动分步执行：

```bash
# 安装后端依赖
pip install -r requirements.txt

# 构建前端
cd frontend && npm install && npm run build && cd ..

# 启动服务
uvicorn main:app --host 0.0.0.0 --port 8000
```

## 📁 项目结构

```
ncqq-manager/
├── main.py                 # FastAPI 应用入口
├── start.py                # 一键启动脚本
├── requirements.txt        # Python 依赖
├── Dockerfile              # Docker 构建文件
├── docker-compose.yml      # Docker Compose 编排
├── services/               # 业务服务层
│   ├── config.py           # 配置管理
│   ├── docker_manager.py   # Docker 容器操作
│   ├── cluster_manager.py  # 集群节点管理
│   ├── user_manager.py     # 用户管理
│   ├── database.py         # SQLite 数据库
│   └── ...
├── routers/                # API 路由层
│   ├── auth_router.py      # 认证路由
│   ├── container_router.py # 容器管理路由
│   ├── node_router.py      # 节点管理路由
│   └── ...
├── middleware/              # 中间件
│   ├── auth.py             # JWT 认证
│   └── rate_limiter.py     # 速率限制
├── frontend/               # React 前端
│   └── src/
│       ├── pages/          # 页面组件
│       ├── components/     # 通用组件
│       ├── services/       # API 调用
│       └── i18n.ts         # 国际化
└── resource/               # 静态资源（壁纸等）
```

## ⚙️ 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CORS_ORIGINS` | 允许的 CORS 源（逗号分隔） | 空（开发模式允许 localhost） |
| `COOKIE_SECURE` | 是否启用安全 Cookie（HTTPS） | `false` |

## 📋 API 文档

启动服务后访问 `http://localhost:8000/docs` 查看 Swagger API 文档。

## 📄 License

MIT

---

**v1.0.0** — NapCat QQ Manager

