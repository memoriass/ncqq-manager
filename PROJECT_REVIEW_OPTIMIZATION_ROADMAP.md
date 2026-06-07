# 项目审查与优化路线图

审查日期：2026-06-08  
当前分支：`codex/refactor-large-files`  
用途：作为后续模块优化、发布跑通、模型辅助维护的项目级方向文档。

## 当前结论

项目经过大文件拆分后，业务源码已没有超过 800 行的 Python/TypeScript/TSX/HTML/Markdown 大文件。当前发布前基础检查已经从人工记忆升级为可复用脚本和 CI 基线：`scripts/check_release.py` 会串联 ruff、Python compileall、pytest smoke tests 和前端生产构建，`.github/workflows/release-check.yml` 会在 GitHub Actions 中执行同类检查。

发布就绪度评估：中等偏上。
代码结构可继续维护，拆分后的 import/export 未在本轮检查中发现断裂；但距离“稳定发布、真实运行链路完整验证、持续模块级优化可控”仍缺 Docker 镜像/compose 实测、真实 NapCat/BotShepherd/WebSocket/SMTP/备份恢复端到端联调，以及核心大模块二次拆分。

## 本轮已完成

- 已创建并推送回溯标签：`archive/pre-optimization-20260608`。
- 新增 `requirements-dev.txt`，集中声明 ruff、pytest、httpx 等开发检查依赖；`.gitignore` 已明确允许 `requirements.txt` 和 `requirements-dev.txt` 被跟踪。
- 新增 `scripts/check_release.py`，作为本地发布前统一检查入口；支持 Windows 下解析 `npm.cmd`，也可在 Linux CI 中直接调用 `npm`。
- 新增 `.github/workflows/release-check.yml`，覆盖 Python 3.12、Node 20、Python 依赖安装、前端 `npm ci` 和发布检查脚本。
- 新增 `tests/test_smoke_api.py`，覆盖 `/api/health`、`/api/setup/status`、公开容器列表、公开容器分页、管理员操作日志查询。

## 本次审查依据

已通过的检查：

- `python scripts/check_release.py`
- `python -m ruff check main.py start.py middleware routers services scripts tests`
- `python -m ruff check --select F401,F841 main.py start.py middleware routers services scripts tests`
- `python -m compileall -q main.py start.py middleware routers services scripts tests`
- `python -m pytest -q`：5 passed
- `npm run build`

已观察到但不阻断发布检查的问题：

- 本地 pytest 输出 `StarletteDeprecationWarning`，提示 FastAPI/Starlette 的 `TestClient` 对当前 httpx 组合有弃用提醒。当前不影响 smoke tests 通过，但后续升级 FastAPI/Starlette/httpx 时需要关注。

未完成或当前缺失的验证：

- 本轮未执行 Docker 镜像完整构建、`docker compose up`、真实 Docker socket 权限和宿主机 docker group GID 场景验证。
- 未执行真实 NapCat、BotShepherd、WebSocket、SMTP、备份恢复的端到端联调。
- 前端仍只有生产构建验证，尚未建立 Vitest/Jest/Playwright 级别的组件或浏览器 smoke tests。
- 配置安全检查仍需发布侧策略化，例如 `COOKIE_SECURE`、`CORS_ORIGINS`、内部 API key、Docker socket 权限。

## 项目规模概览

当前仓库约 240 个受跟踪文件。按主要源代码类型估算：

- Python：约 49 个文件，约 10500 行。
- TypeScript：75 个 `.ts` 文件，约 3377 行。
- TSX：44 个 `.tsx` 文件，约 9287 行。
- HTML：21 个文件，约 1074 行。
- Markdown：约 20 多个文件，约 900 行以上。

当前业务源码已没有超过 800 行的大文件，但 500 行以上文件仍是后续模型读取、维护和模块优化的重点。

## 仍偏大的核心文件

优先关注这些 500 行以上文件：

- `routers/container_runtime_router.py`：约 736 行，容器运行时、重建、日志、二维码、内部事件和事件流混在一起。
- `services/botshepherd.py`：约 724 行，进程生命周期、API client、配置、日志、雷达端点、注入逻辑仍集中。
- `services/alert_manager.py`：约 597 行，规则、SMTP、Webhook、历史、通知发送混合。
- `frontend/src/pages/BotShepherd.tsx`：约 591 行，数据加载、轮询、日志弹窗、连接区、账号区和确认弹窗仍在一个页面。
- `frontend/src/pages/AlertSettings.tsx`：约 587 行，controller 已拆出，但 JSX section 和 dialog 仍集中。
- `routers/ws_router.py`：约 579 行，多类 WebSocket 通道和 OneBot 事件处理集中。
- `frontend/src/pages/Dashboard.tsx`：约 535 行，首页聚合数据和多个展示块仍集中。
- `frontend/src/components/BasicInfo.tsx`：约 521 行，实例基础信息、状态展示和操作入口可继续拆分。
- `frontend/src/components/NetworkConfig.tsx`：约 517 行，多个网络协议表单在同一文件。

## 需要优化的重点

P0：发布前必须补齐或确认

- 已完成基础自动化入口：`scripts/check_release.py`、后端 smoke tests、前端生产构建、ruff、compileall 已纳入统一检查。
- 已完成 CI 基线：GitHub Actions 会执行同类发布检查。
- 待完成 Docker 发布验证：执行 `docker build`、`docker compose up`、容器内 `/api/health`、前端静态资源、`/manual` 路由验证。
- 待完成运行时关键链路验证：容器列表、创建、启动/停止、登录二维码、WebSocket 事件、BotShepherd 启停、告警设置、备份恢复。
- 待完成配置安全检查：生产环境下 `COOKIE_SECURE`、`CORS_ORIGINS`、内部 API key、Docker socket 权限需要明确发布策略。

P1：继续解耦和提高可维护性

- 拆 `container_runtime_router.py`：按数据清理/重建、生命周期动作、统计日志二维码、内部事件、事件流拆分。
- 拆 `services/botshepherd.py`：按 process、API client、config、radar、logs、inject 拆分。
- 拆 `services/alert_manager.py`：按 rules、SMTP notifier、Webhook notifier、history 拆分。
- 拆 `BotShepherd.tsx`：补 `useBotShepherdController.ts`，再拆连接面板、账号面板、日志弹窗、activation popover。
- 拆 `AlertSettings.tsx`：拆 QQ 通知、Webhook 规则、SMTP 设置和各 dialog。
- 拆 `NetworkConfig.tsx`：按 HTTP server/client、WebSocket server/client、通用 endpoint row 组件拆分。

P2：长期质量建设

- 增加 API schema 或 contract 文档，避免前后端 DTO 靠人工同步。
- 增加 WebSocket 集成测试，覆盖断线、重连、消息缓存、心跳和权限。
- 增加操作日志、告警、备份恢复的回归测试。
- 引入前端组件级测试或 Playwright smoke tests，至少覆盖登录、Dashboard、容器详情、BotShepherd、告警设置。
- 增加发布版本说明和升级迁移说明，特别是 SQLite settings、config/data 目录、BotShepherd 子模块。

## 欠优化点

模块拆分已经启动，但多个模块仍处于“入口拆分完成、深层职责未拆完”的状态：

- 前端页面层仍有多个页面同时负责数据请求、表单状态、弹窗状态和 JSX 渲染。
- 后端 router 层仍有较多业务逻辑，服务层边界还不够稳定。
- `frontend/src/services/api/types.ts` 仍是共享 DTO 大集合，后续可以按 domain 分组后再聚合。
- WebSocket 相关逻辑贯穿 `ws_router.py`、`napcat_ws_service.py`、`bot_heartbeat.py`、前端 hooks，缺少端到端测试保护。
- 部分源码注释和少量可见文案存在编码异常痕迹，后续应按模块清理，优先处理用户可见文本。
- `.dockerignore` 排除了 Markdown，因此根目录审查文档不会进入镜像；这对运行时没有影响，但发布文档需要通过仓库或发布说明归档。

## 当前能力不足

自动化能力：

- 基础检查脚本和 CI 已建立，可以持续证明静态检查、编译、后端 smoke 和前端 build 未破坏。
- 仍缺 Docker 镜像构建和容器启动的自动化验证。
- 仍缺真实运行依赖的测试 profile，例如 Docker manager mock、本地 Docker 集成测试、NapCat/OneBot mock WebSocket。

质量保障能力：

- 后端已有最小 API smoke tests，但覆盖面仍偏窄，尚不能替代完整 API contract tests。
- 缺少 WebSocket/OneBot/NapCat 的模拟器或 fixture，实时链路难回归。
- 缺少数据库迁移测试，settings 和用户数据升级风险较难量化。
- 前端缺少组件和浏览器层回归，当前只能证明 TypeScript 编译和 Vite 构建可通过。

运维发布能力：

- Docker socket 权限、非 root 用户、宿主机 docker group GID 兼容需要更明确的发布方案。
- 生产安全配置默认值仍需发布前审查，例如 `COOKIE_SECURE=false` 只适合非 HTTPS 或开发场景。
- BotShepherd 作为子模块和外部进程，安装、启动、日志、恢复链路需要单独发布验证。

可观测能力：

- `/api/health` 已有基础健康信息，并已纳入 smoke tests；但仍缺少细分 readiness/liveness 和关键依赖状态阈值。
- 前端缺少错误上报和关键操作埋点。
- WebSocket、告警、Docker 事件的故障定位仍主要依赖日志。

## 推荐优化顺序

第一阶段：发布跑通基线

1. 已完成：新增 `scripts/check_release.py`，串联 ruff、compileall、pytest、npm build。
2. 已完成：新增 GitHub Actions，运行同类检查。
3. 已完成：新增后端最小 pytest，覆盖 `/api/health`、auth setup status、公开容器接口、操作日志查询。
4. 下一步：新增 Docker 构建验证文档和脚本，覆盖 build、启动、健康检查、手册访问、前端访问。
5. 下一步：整理生产环境变量和 docker compose 发布模板。

第二阶段：核心模块继续拆分

1. 后端先拆 `container_runtime_router.py` 和 `ws_router.py`，因为它们是运行时风险最高的 router。
2. 服务层先拆 `botshepherd.py` 和 `alert_manager.py`，因为它们外部依赖多、发布故障影响大。
3. 前端先拆 `BotShepherd.tsx` 和 `AlertSettings.tsx`，因为已具备功能目录和文档入口。
4. 每拆一个模块，同步补模块文档和最小测试。

第三阶段：端到端能力

1. 建立 NapCat/OneBot mock WebSocket 服务，用于测试 Bot 列表、消息缓存、发送消息、心跳。
2. 建立 Docker manager mock 或本地集成测试 profile，覆盖容器生命周期。
3. 增加 Playwright smoke tests，覆盖登录、Dashboard、容器详情、BotShepherd、告警设置。
4. 增加备份恢复沙箱测试，确认只恢复允许的 config/data 内容。

## 模块级优化入口

后续模型读取时，先读：

- `docs/MODEL_READING_GUIDE.md`
- `routers/ROUTERS_ARCHITECTURE.md`
- `services/BACKEND_SERVICES_ARCHITECTURE.md`
- `frontend/src/pages/FRONTEND_PAGES_ARCHITECTURE.md`
- `frontend/src/services/api/SERVICE_API_ARCHITECTURE.md`

具体模块再读：

- Bot 管理：`frontend/src/components/bot-manager/BOT_MANAGER_MODULE_GUIDE.md`
- Bot 后端端点：`frontend/src/pages/bot-backend/BOT_BACKEND_MODULE_GUIDE.md`
- BotShepherd UI：`frontend/src/pages/bot-shepherd/BOT_SHEPHERD_UI_MODULE_GUIDE.md`
- 告警设置：`frontend/src/pages/alert-settings/ALERT_SETTINGS_MODULE_GUIDE.md`
- 国际化：`frontend/src/i18n/I18N_ARCHITECTURE.md`
- 静态手册：`docs/manual/MANUAL_DOCUMENTATION_ARCHITECTURE.md`

## 发布前验收清单

- 已通过：ruff 全量检查。
- 已通过：ruff `F401,F841` 未使用 import/local 检查。
- 已通过：Python compileall。
- 已通过：后端 pytest smoke tests。
- 已通过：前端 `npm run build`。
- 已建立：GitHub Actions 发布检查基线。
- 待验证：Docker 镜像构建通过。
- 待验证：容器启动后 `/api/health` 返回 `ok` 或明确可解释的 `degraded`。
- 待验证：`/manual` 能打开，章节 iframe 能正常加载。
- 待验证：初始化、登录、退出、用户管理、容器列表、容器创建、容器操作、日志、二维码链路可用。
- 待验证：BotShepherd 安装、启动、停止、日志、连接列表、账号列表、端点探测可用。
- 待验证：告警设置保存、SMTP 测试、QQ bot 通知规则创建可用。
- 待验证：备份下载、上传恢复在沙箱环境验证通过。

## 不建议立即做的事

- 不建议一次性重写后端服务层。应按高风险模块拆分，并在每个拆分点补测试。
- 不建议在没有 contract tests 前大改 API 返回结构。
- 不建议把所有页面都拆成过多小文件；优先拆状态控制、dialog、row、panel 这些自然边界。
- 不建议在发布前引入大型新框架或复杂状态库，当前更缺的是测试、Docker 验证和运行链路验证。

## 当前建议结论

发布跑通的基础检查基线已经建立，下一步最务实的方向是补 Docker 构建/启动验证和真实运行链路联调。等 Docker 与端到端基线稳定后，再围绕 `container_runtime_router.py`、`ws_router.py`、`botshepherd.py`、`alert_manager.py`、`BotShepherd.tsx`、`AlertSettings.tsx` 做模块级优化；每次拆分都要同步更新对应模块文档和最小测试。
