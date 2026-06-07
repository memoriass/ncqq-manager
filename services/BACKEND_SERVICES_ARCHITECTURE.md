## 后端服务层架构

`services/` 存放后端业务逻辑、外部进程控制、Docker 编排、WebSocket 注册表、指标、日志和持久化 helper。路由层应该调用这里的服务，而不是在 router 中复制业务规则。

## 基础设施服务

- `config.py`：应用路径、版本、配置文件、运行时 settings、数据目录解析。许多模块依赖 `app_config` 和 `get_data_dir()`。
- `database.py`：SQLite 连接、迁移、settings 表读写、通用 execute/fetch helper、事务上下文。
- `log.py`：结构化日志、内存日志缓冲、uvicorn 日志接入、BotShepherd 高频轮询日志过滤。
- `metrics.py`：轻量指标计数和快照。
- `operation_logger.py`：操作日志缓冲、落盘、查询和下载数据源。
- `operation_log_context.py`：构造操作者上下文 payload。
- `daemon_monitor.py`：后台 tick 监控，用于检测主循环是否存活。

## 用户与权限服务

- `user_manager.py`：用户角色、登录校验、失败登录记录、用户 CRUD、实例授权、API Key。

## Docker 与实例服务

- `docker_async.py`：基于 `aiodocker` 的异步 Docker 管理，热路径优先使用；负责连接、列表、创建、动作、日志、镜像、事件订阅等。
- `docker_manager.py`：同步 Docker manager，组合 `LoginMixin` 和 `LifecycleMixin`，部分健康检查或兼容路径仍会使用。
- `docker_lifecycle.py`：同步生命周期 mixin，封装容器创建、启动停止、删除等策略。
- `docker_login.py`：登录状态、uin 归一化、二维码/登录结果相关 mixin。
- `docker_events.py`：Docker 事件 watcher。
- `container_instance.py`：单实例运行时状态模型。
- `instance_subsystem.py`：实例状态注册表，维护实例集合和快照。
- `container_state.py`：容器状态引擎，后台刷新 Docker 状态并写入 `instance_subsystem`，为 API/WS 提供低阻塞快照。

## 集群与节点服务

- `cluster_manager.py`：节点配置、远程节点健康、远程 API 代理、集群初始化和 aiohttp session 生命周期。

## Bot、WebSocket 与 OneBot 服务

- `ws_manager.py`：前端 WebSocket 连接管理、广播和连接数指标。
- `napcat_ws_service.py`：NapCat/OneBot 连接注册、API 代理、消息缓存、在线状态、按实例发送消息。
- `ob11_events.py`：OneBot v11 事件解析，输出 heartbeat、lifecycle、message、notice 等结构化事件。
- `bot_heartbeat.py`：Bot heartbeat 状态缓存、连接/断开、GC。

## BotShepherd 服务

- `botshepherd.py`：BotShepherd 安装目录解析、虚拟环境、进程启动停止、状态、日志、HTTP API client、连接/账号配置、端点探测、雷达端点库、别名注入。
- `bs_activation_service.py`：BotShepherd connection 健康监控和 activation 状态管理。

## 告警与通知服务

- `alert_manager.py`：告警规则、设置、历史、Webhook 校验、SMTP 设置和发送、登录丢失等通知流程。

## 路由关联

- `routers/auth_router.py`、`routers/user_router.py` 主要调用 `user_manager.py`、`config.py`、`operation_logger.py`。
- `routers/container_*_router.py` 调用 `docker_async.py`、`cluster_manager.py`、`container_state.py`、`instance_subsystem.py`、`napcat_ws_service.py`。
- `routers/node_router.py` 调用 `cluster_manager.py` 和 `config.py`。
- `routers/image_router.py` 调用 `docker_async.py`。
- `routers/alert_router.py` 调用 `alert_manager.py` 和 `database.py`。
- `routers/botshepherd_router.py` 调用 `botshepherd.py`、`bs_activation_service.py`、`bot_heartbeat.py`。
- `routers/bot_api_router.py` 和 `routers/ws_router.py` 调用 `napcat_ws_service.py`、`ws_manager.py`、`ob11_events.py`、`bot_heartbeat.py`。
- `routers/backup_router.py` 使用 `config.py` 路径常量和 `operation_logger.py`。

## 启动和关闭生命周期

- `main.py` 的 lifespan 初始化数据库、加载 runtime 配置、确保默认管理员、初始化集群、启动 aiohttp session、清理 token、接入日志、启动 daemon monitor、启动异步 Docker manager、启动容器状态引擎、按配置自动启动 BotShepherd、恢复 activation monitor。
- 关闭时停止状态引擎、Docker manager、集群 session、BotShepherd、activation service，刷新操作日志并关闭数据库。

## 推荐读取顺序

1. 读本文件确认目标 service 所属类别。
2. 读调用它的 router，确认请求边界和返回结构。
3. 读目标 service 的类和公开方法。
4. 如果 service 依赖配置或数据库，再读 `config.py`、`database.py`。
5. 如果 service 影响前端，回读对应 `frontend/src/services/api/*Api.ts`。

## 服务层维护规则

- 服务层可以持有业务状态，但要明确线程/协程安全边界。
- Docker、WebSocket、外部进程和文件系统操作要尽量集中在 service，不要散落到 router。
- 后台任务必须在 `main.py` lifespan 或 service 自身生命周期中有启动和停止路径。
- 写日志和操作日志时，不记录密码、token、API Key 明文。
- 数据库 migration 修改要保持向后兼容，启动时可从旧配置恢复关键状态。

## 后续瘦身重点

- `botshepherd.py` 可拆为 `botshepherd_process.py`、`botshepherd_api_client.py`、`botshepherd_config.py`、`botshepherd_radar.py`、`botshepherd_logs.py`。
- `alert_manager.py` 可拆为 `alert_rules.py`、`smtp_notifier.py`、`webhook_notifier.py`、`alert_history.py`。
- `docker_async.py` 可拆镜像、容器生命周期、日志、事件订阅、端口分配。
- `docker_manager.py` 应继续弱化为兼容层，避免同步 Docker 路径重新扩张。
- `napcat_ws_service.py` 可拆 API proxy、连接注册表、消息缓存、在线状态。
- `container_state.py` 可拆状态采集、diff、健康信息和订阅发布。
