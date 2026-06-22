## FastAPI 路由层架构

`routers/` 存放后端 FastAPI 路由模块。路由层负责请求/响应边界、参数校验、权限依赖、限速依赖、错误码和调用服务层。业务规则、Docker 操作、数据库读写、WebSocket 注册表等应尽量放在 `services/`。

## 注册入口

- `main.py` 导入本目录 router，并通过 `app.include_router(...)` 注册。
- 大多数 HTTP API 使用 `/api` 前缀。
- WebSocket router 不使用统一 `/api` 前缀，直接暴露 `/ws/...`。
- 静态手册 `/manual` 和 SPA catch-all 在 `main.py` 中，不属于本目录。

## 文件用途

- `auth_router.py`：登录、登出、认证状态、首次初始化状态和初始化提交。依赖 `services/user_manager.py`、`services/config.py`、`middleware/auth.py`。
- `user_router.py`：用户列表、数量、创建、编辑、删除、实例授权、API Key 重新生成。依赖 `services/user_manager.py`。
- `container_public_router.py`：公开或用户面板容器列表、批量二维码、分页容器信息。依赖 `services/container_state.py`、`services/instance_subsystem.py`。
- `container_crud_router.py`：容器列表、创建、初始插件配置注入、WS client 注入、网络配置注入。依赖 `services/docker_async.py`、`services/cluster_manager.py`、`services/config.py`。
- `container_runtime_router.py`：容器运行态路由兼容入口，仅导出 `routers/container_runtime/` 聚合 router，保持 `main.py` 旧导入路径不变。
- `container_runtime/`：容器数据清理/重建、生命周期动作、统计日志二维码、内部事件、事件流的分层实现。先读 `container_runtime/CONTAINER_RUNTIME_ROUTER_GUIDE.md`，再按目标能力读取 `data_recreate.py`、`actions.py`、`status.py`、`internal.py`、`events.py`。
- `container_config_router.py`：实例配置文件读取/保存、文件列表、文件删除。负责路径安全检查。
- `node_router.py`：集群配置、集群 API Key 一次性轮换展示、节点增删改查、节点日志、远程节点代理。依赖 `services/cluster_manager.py` 和 `services/config.py`。
- `operation_logs_router.py`：操作日志查询和下载。依赖 `services/operation_logger.py`。
- `image_router.py`：Docker 镜像列表、拉取、流式拉取、删除。依赖 `services/docker_async.py`。
- `alert_router.py`：告警设置、规则、历史、SMTP 测试。依赖 `services/alert_manager.py` 和 `services/database.py`。
- `backup_router.py`：配置和实例 config 的备份下载、上传恢复、备份信息。依赖 `services/config.py` 和 `services/operation_logger.py`。
- `resource_router.py`：壁纸、QQ 头像、群头像等本地/远程资源响应。
- `botshepherd_router.py`：BotShepherd 状态、日志、安装启动停止、连接、账号、心跳、activation、端点探测、雷达端点库、别名注入、移除端点。依赖 `services/botshepherd.py`、`services/bs_activation_service.py`、`services/bot_heartbeat.py`。
- `bot_api_router.py`：Bot 列表、状态、OneBot action 代理、快捷发消息、消息缓存。依赖 `services/napcat_ws_service.py`。
- `internal_plugin_router.py`：容器内插件向管理器报告实例状态。依赖 `services/config.py`、`services/instance_subsystem.py`、`services/container_state.py`。
- `ws_router.py`：前端事件 WS、容器日志 WS、Bot 消息 WS、公开 WS、NapCat/OneBot 接入 WS、插件 WS。依赖 `services/ws_manager.py`、`services/napcat_ws_service.py`、`services/ob11_events.py`、`services/bot_heartbeat.py`。

## 前端关联

- `frontend/src/services/api/containerApi.ts` 对应 `container_*_router.py`。
- `frontend/src/services/api/nodeApi.ts` 对应 `node_router.py`。
- `frontend/src/services/api/userApi.ts` 和 `authApi.ts` 对应 `user_router.py`、`auth_router.py`。
- `frontend/src/services/api/imageApi.ts` 对应 `image_router.py`。
- `frontend/src/services/api/alertApi.ts` 对应 `alert_router.py`。
- `frontend/src/services/api/backupApi.ts` 对应 `backup_router.py`。
- `frontend/src/services/api/botshepherdApi.ts` 对应 `botshepherd_router.py`。
- `frontend/src/services/api/botApi.ts` 对应 `bot_api_router.py` 和 `ws_router.py`。

## 推荐读取顺序

1. 读本文件确认目标 router。
2. 读对应前端 API client，确认路径、请求体和响应体。
3. 读目标 router，关注权限依赖、限速、参数模型和返回结构。
4. 读 router 调用的 service，确认业务规则。
5. 改共享配置或数据库时，再读 `services/config.py`、`services/database.py`。

## 路由层维护规则

- 路由函数中可以做输入校验、权限判断和响应组装，不应堆放复杂业务流程。
- 新增写操作要考虑 `middleware/auth.py` 的 CSRF 要求，前端统一 request 会带 `X-Requested-With`。
- 管理员接口使用 `require_admin`，普通登录接口使用 `get_current_user`，公开接口要显式限速。
- 远程节点代理要保留 `node_id` 语义，避免本地和远程分支返回结构不一致。
- 操作日志应记录操作者、目标资源和关键参数，但不要记录 token、密码、完整 API Key。

## 后续瘦身重点

- `container_runtime_router.py` 已拆为 `routers/container_runtime/` 包，后续优化重点转为把 `data_recreate.py` 中的 Docker 重建编排逐步下沉到 service 层，并给重建/清理补更细的 contract tests。
- `ws_router.py` 可按“前端事件通道”“容器日志通道”“Bot 消息通道”“NapCat/OneBot 接入”“插件接入”拆分。
- `backup_router.py` 可拆出 zip 校验、过滤复制、恢复清理工具到 service。
- `node_router.py` 可拆远程代理逻辑到 `services/cluster_manager.py` 或单独 proxy helper。
