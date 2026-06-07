## 项目审查与优化路线图

审查日期：2026-06-08  
当前分支：`codex/refactor-large-files`  
用途：作为后续模块优化、发布跑通、模型辅助维护的项目级方向文档。

## 当前结论

项目经过大文件拆分后，前端生产构建和 Python 静态检查已经能通过，拆分后的主要入口没有发现 import/export 断裂。当前更大的问题不再是“能不能编译”，而是缺少自动化测试、CI/CD、端到端发布验证，以及部分核心模块仍然偏大、职责仍然偏集中。

发布就绪度评估：中等。  
代码结构可继续维护，但距离“稳定发布、持续迭代、模块级优化可控”还需要补齐测试、发布流水线、运行时验证和关键模块二次拆分。

## 本次审查依据

已通过的检查：

- `python -m ruff check main.py start.py middleware routers services scripts`
- `python -m ruff check --select F401,F841 main.py start.py middleware routers services scripts`
- `python -m compileall -q main.py start.py middleware routers services scripts`
- `npm run build`
- 旧 `README.md` 模块说明和旧路径引用扫描

未完成或当前缺失的验证：

- 未发现后端 pytest、前端 vitest/jest/playwright 等测试入口。
- 未发现根目录 `.github` CI 配置。
- 本轮未执行 Docker 镜像完整构建和真实 Docker socket 场景验证。
- 未执行真实 NapCat、BotShepherd、WebSocket、SMTP、备份恢复的端到端联调。

## 项目规模概览

当前仓库约 236 个受跟踪文件。按主要文本类型统计：

- Python：47 个文件，约 10204 行。
- TypeScript：75 个 `.ts` 文件，约 3377 行。
- TSX：44 个 `.tsx` 文件，约 9287 行。
- HTML：21 个文件，约 1074 行。
- Markdown：21 个文件，约 834 行。

当前源码已没有超过 800 行的大文件，但 500 行以上文件仍是后续优化重点。

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

P0：发布前必须补齐

- 自动化测试入口：至少增加后端 pytest 冒烟测试、前端构建测试和核心 API contract 测试。
- CI 流水线：把 ruff、Python compile、npm build、基础测试放进 GitHub Actions 或等价 CI。
- Docker 发布验证：执行 `docker build`、`docker compose up`、`/api/health`、前端静态资源、`/manual` 路由验证。
- 运行时关键链路：容器列表、创建/启动/停止、登录二维码、WebSocket 事件、BotShepherd 启停、告警设置、备份恢复。
- 配置安全检查：生产环境下 `COOKIE_SECURE`、`CORS_ORIGINS`、内部 API key、Docker socket 权限需要明确发布策略。

P1：继续解耦和提高可维护性

- 拆 `container_runtime_router.py`：按数据清理/重建、生命周期动作、统计日志二维码、内部事件、事件流拆分。
- 拆 `services/botshepherd.py`：按 process、API client、config、radar、logs 拆分。
- 拆 `services/alert_manager.py`：按 rules、SMTP notifier、Webhook notifier、history 拆分。
- 拆 `BotShepherd.tsx`：补 `useBotShepherdController.ts`，再拆连接面板、账号面板、日志弹窗、activation popover。
- 拆 `AlertSettings.tsx`：拆 QQ 通知、Webhook 规则、SMTP 设置和各 dialog。
- 拆 `NetworkConfig.tsx`：按 HTTP server/client、WebSocket server/client、通用 endpoint 行组件拆分。

P2：长期质量建设

- 增加 API schema 或 contract 文档，避免前后端 DTO 靠人工同步。
- 增加 WebSocket 集成测试，覆盖断线、重连、消息缓存、心跳和权限。
- 增加操作日志、告警、备份恢复的回归测试。
- 引入前端组件级测试或 Playwright 冒烟测试，至少覆盖登录、Dashboard、容器详情、BotShepherd、告警设置。
- 增加发布版本说明和升级迁移说明，特别是 SQLite settings、config/data 目录、BotShepherd 子模块。

## 欠优化点

模块拆分已经启动，但多个模块仍处于“入口拆分完成、深层职责未拆完”的状态：

- 前端页面层仍有多个页面同时负责数据请求、表单状态、弹窗状态和 JSX 渲染。
- 后端 router 层仍有较多业务逻辑，服务层边界还不够稳定。
- `frontend/src/services/api/types.ts` 仍是共享 DTO 大集合，后续可以按 domain 分组后聚合。
- WebSocket 相关逻辑贯穿 `ws_router.py`、`napcat_ws_service.py`、`bot_heartbeat.py`、前端 hooks，缺少端到端测试保护。
- 部分源码注释和少量可见文案存在编码异常痕迹，后续应按模块清理，优先处理用户可见文本。
- `.dockerignore` 排除了 Markdown，因此根目录审查文档不会进入镜像；这对运行时没有影响，但发布文档需要另行归档到仓库或发布说明。

## 当前能力不足

自动化能力不足：

- 没有测试脚本和 CI，无法持续证明重构没有破坏功能。
- 没有发布前一键检查脚本，当前依赖人工记忆执行 ruff、compile、npm build。
- 没有 Docker 镜像构建和容器启动的自动化验证。

质量保障能力不足：

- 缺少后端 API contract 测试，前端 DTO 和后端响应容易漂移。
- 缺少 WebSocket/OneBot/NapCat 的模拟器或 fixture，实时链路难回归。
- 缺少数据库迁移测试，settings 和用户数据升级风险较难量化。

运维发布能力不足：

- Docker socket 权限、非 root 用户、宿主机 docker group GID 兼容需要更明确的发布方案。
- 生产安全配置默认值仍需发布前审查，例如 `COOKIE_SECURE=false` 只适合非 HTTPS 或开发场景。
- BotShepherd 作为子模块和外部进程，安装、启动、日志、恢复链路需要单独发布验证。

可观测能力不足：

- `/api/health` 已有基础健康信息，但缺少细分 readiness/liveness 和关键依赖状态阈值。
- 前端缺少错误上报和关键操作埋点。
- WebSocket、告警、Docker 事件的故障定位仍主要依赖日志。

## 推荐优化顺序

第一阶段：发布跑通基线

1. 新增 `scripts/check_release` 或等价脚本，串联 ruff、compileall、npm build、基础测试。
2. 新增 GitHub Actions，至少运行同样的检查。
3. 新增后端最小 pytest：`/api/health`、auth setup status、公开容器接口空态、操作日志查询。
4. 新增 Docker 构建验证文档和脚本：build、启动、健康检查、手册访问、前端访问。
5. 整理生产环境变量和 docker compose 发布模板。

第二阶段：核心模块继续拆分

1. 后端先拆 `container_runtime_router.py` 和 `ws_router.py`，因为它们是运行时风险最高的 router。
2. 服务层先拆 `botshepherd.py` 和 `alert_manager.py`，因为它们外部依赖多、发布故障影响大。
3. 前端先拆 `BotShepherd.tsx` 和 `AlertSettings.tsx`，因为已具备功能目录和文档入口。
4. 每拆一个模块，同步补模块文档和最小测试。

第三阶段：端到端能力

1. 建立 NapCat/OneBot mock WebSocket 服务，用于测试 Bot 列表、消息缓存、发送消息、心跳。
2. 建立 Docker manager mock 或本地集成测试 profile，覆盖容器生命周期。
3. 增加 Playwright 冒烟测试，覆盖登录、Dashboard、容器详情、BotShepherd、告警设置。
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

- ruff 全量通过。
- Python compileall 通过。
- 前端 `npm run build` 通过。
- Docker 镜像构建通过。
- 容器启动后 `/api/health` 返回 `ok` 或明确可解释的 `degraded`。
- `/manual` 能打开，章节 iframe 能正常加载。
- 初始化、登录、退出、用户管理、容器列表、容器创建、容器操作、日志、二维码链路可用。
- BotShepherd 安装、启动、停止、日志、连接列表、账号列表、端点探测可用。
- 告警设置保存、SMTP 测试、QQ bot 通知规则创建可用。
- 备份下载、上传恢复在沙箱环境验证通过。

## 不建议立即做的事

- 不建议一次性重写后端服务层。应按高风险模块拆分，并在每个拆分点补测试。
- 不建议在没有 contract 测试前大改 API 返回结构。
- 不建议把所有页面都拆成过多小文件；优先拆状态控制、dialog、row、panel 这些自然边界。
- 不建议在发布前引入大型新框架或复杂状态库，当前更缺的是测试和发布验证。

## 当前建议结论

下一步最务实的方向是先建立发布基线：自动化检查脚本、CI、最小测试、Docker 构建和健康检查。等发布基线稳定后，再围绕 `container_runtime_router.py`、`ws_router.py`、`botshepherd.py`、`alert_manager.py`、`BotShepherd.tsx`、`AlertSettings.tsx` 做模块级优化。
