## 前端 API 客户端架构

本目录是前端访问后端 `/api` 的集中封装层。页面和组件应从 `frontend/src/services/api.ts` 或 `frontend/src/services/api/index.ts` 暴露的对象导入 API，不直接拼接重复的 `fetch` 逻辑。

## 入口关系

- `frontend/src/services/api.ts` 是稳定兼容入口，继续服务旧代码中的 `../services/api` 导入。
- `index.ts` 聚合本目录所有客户端和共享类型，是新增 API 模块后必须更新的出口。
- `client.ts` 统一处理 `API_BASE`、cookie 携带、JSON header、`X-Requested-With`、401 事件和错误抛出。
- `types.ts` 存放跨多个 API client 使用的 DTO，页面不要在局部重复定义后端响应结构。

## 文件用途

- `client.ts`：封装 `request<T>()`，所有需要鉴权的 JSON API 都应走这里。遇到 401 时会触发 `auth:unauthorized` 浏览器事件，由上层路由或认证逻辑处理跳转。
- `types.ts`：定义容器、节点、用户、告警、初始化、BotShepherd、Bot 后端端点、网络注入和 Bot 消息等共享类型。
- `publicApi.ts`：处理不希望触发全局 401 的公开或半公开接口，例如用户面板容器列表、二维码状态、刷新登录状态。
- `containerApi.ts`：容器列表、统计、日志、生命周期动作、创建、二维码、配置文件、文件列表和文件删除。
- `nodeApi.ts`：集群配置、节点增删改查、管理员节点详情、节点日志和主机监控。生产端管理器对外调用凭证从用户管理中的管理员用户 API Key 获取；节点详情接口仅供管理员编辑弹窗查看和复制节点连接凭证。
- `userApi.ts`：用户列表、创建、编辑、删除、实例授权和 API Key 重新生成。`regenerateApiKey()` 返回的 `apiKey` 只用于前端一次性展示；列表 DTO 只暴露 `hasApiKey`。
- `imageApi.ts`：Docker 镜像列表、拉取、流式拉取和删除。`pullStream()` 需要原生 `fetch`，因为调用方要消费 NDJSON 响应流，并用 Docker `progressDetail.current/total` 渲染实时分层进度。
- `alertApi.ts`：告警规则、告警历史、SMTP 设置和 SMTP 测试。
- `backupApi.ts`：备份下载、备份上传和备份信息查询。
- `authApi.ts`：登录、登出和认证状态。
- `setupApi.ts`：初始化状态和首次初始化提交。
- `botshepherdApi.ts`：BotShepherd 安装状态、启动停止、日志、连接、账号、心跳、端点探测、雷达端点持久化和别名注入。
- `instanceNetworkApi.ts`：向指定实例注入 OneBot 网络配置。
- `botApi.ts`：Bot 列表、OneBot action 代理、消息缓存读取和快捷发消息。
- `index.ts`：只做导出，不写业务逻辑。

## 后端关联

- `containerApi.ts` 对应 `routers/container_crud_router.py`、`routers/container_runtime_router.py`、`routers/container_config_router.py` 和 `routers/container_public_router.py`。
- `nodeApi.ts` 对应 `routers/node_router.py`，并间接关联 `services/cluster_manager.py`。
- `userApi.ts` 和 `authApi.ts` 对应 `routers/user_router.py`、`routers/auth_router.py`，核心服务是 `services/user_manager.py`。
- `imageApi.ts` 对应 `routers/image_router.py`，核心服务是 `services/docker_async.py`。
- `alertApi.ts` 对应 `routers/alert_router.py` 和 `services/alert_manager.py`。
- `backupApi.ts` 对应 `routers/backup_router.py`。
- `botshepherdApi.ts` 对应 `routers/botshepherd_router.py`、`services/botshepherd.py`、`services/bs_activation_service.py` 和 `services/bot_heartbeat.py`。
- `botApi.ts` 对应 `routers/bot_api_router.py`、`routers/ws_router.py` 和 `services/napcat_ws_service.py`。

## 推荐读取顺序

1. 先读本文件确认目标 API client。
2. 读 `client.ts`，确认是否应该走统一鉴权请求。
3. 读 `types.ts` 中相关 DTO。
4. 只读目标 domain client，例如容器功能读 `containerApi.ts`。
5. 若改接口路径、请求体或响应体，再读对应后端 router 和 service。

## 维护规则

- 新增后端 domain 时，新建 `xxxApi.ts`，从 `client.ts` 导入 `request`，从 `types.ts` 导入共享类型，并在 `index.ts` 导出。
- 只有确实不能触发全局鉴权事件的接口才绕开 `request()` 使用原生 `fetch`。
- 类型变化应先改 `types.ts`，再改 client 和页面。不要让页面直接写 `Record<string, unknown>` 来掩盖后端契约变化。
- URL 参数要使用 `encodeURIComponent()`，尤其是文件路径、搜索词、镜像名、容器名等用户可输入内容。
- API client 不处理 toast、页面跳转、复杂 UI 状态，这些留在页面或 controller 中。

## 常见风险

- `request()` 自动解析 JSON；如果后端返回文件、流或非 JSON，需要像 `imageApi.pullStream()` 那样单独处理。
- 镜像拉取流依赖后端 `Cache-Control: no-cache` 和 `X-Accel-Buffering: no`，不要改回普通 JSON 响应，否则右下角进度窗口会失去实时反馈。
- 401 会触发全局事件，公开页面不应随意走 `request()`。
- `types.ts` 是共享契约文件，新增字段可以是可选字段，删除字段需要先全局搜索使用点。
- `botshepherdApi` 同时服务 BotShepherd 页面和 Bot 后端端点页面，改连接或端点结构要同时检查两个模块。
- 用户 API Key 明文只应出现在重置接口响应中，不应加入用户列表、日志、持久化前端状态或全局 store。
