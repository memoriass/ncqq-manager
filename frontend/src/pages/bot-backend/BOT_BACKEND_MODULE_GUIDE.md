## Bot 后端端点模块说明

本目录负责 Bot 后端 WebSocket 端点库管理，也就是页面中的“Bot 雷达/后端端点”功能。它可以探测端点、保存别名和 token，并把端点注入到 BotShepherd 连接或 NCQQ 实例网络配置中。

## 入口关系

- `../BotBackend.tsx`：路由兼容包装，默认导出本目录入口。
- `index.ts`：导出 `BotBackend.tsx`，用于保持页面导入路径稳定。
- `BotBackend.tsx`：真实页面入口。

## 文件用途

- `BotBackend.tsx`：页面状态、初始数据加载、端点持久化 debounce、端点新增/删除/编辑、探测、自动收集、注入编排。
- `EndpointCard.tsx`：单个端点卡片，展示状态、延迟、别名、URL，并打开编辑/注入弹窗。
- `EditDialog.tsx`：编辑 URL、alias、token，负责本地表单状态和基础校验。
- `InjectBSDialog.tsx`：选择一个或多个 BotShepherd connection，将当前端点追加到 `target_endpoints`。
- `InjectNCDialog.tsx`：选择一个或多个 NCQQ 容器，将当前端点写入实例 `onebot11_<uin>.json` 的 `websocketClients`。
- `types.ts`：`EndpointEntry`，是前端端点卡片内部状态结构。
- `validators.ts`：`isValidWsUrl()`，约束端点必须是 `ws://` 或 `wss://`。

## 数据流

- 页面加载时调用 `botshepherdApi.backendEndpoints()` 读取已保存端点库。
- 同时调用 `botshepherdApi.connections()` 读取 BotShepherd connection，用于 BS 注入弹窗。
- 同时调用 `containerApi.list()` 读取容器列表，用于 NC 注入弹窗。
- `endpoints` 变化后 1 秒 debounce 调用 `botshepherdApi.saveBackendEndpoints()` 持久化。
- 单点探测调用 `botshepherdApi.probeTarget(url, token)`。
- 自动收集会读取所有 BS connection 的 `target_endpoints`，把合法且未存在的 URL 加入端点库。
- 注入 BS 时，页面逐个读取 connection，合并 `target_endpoints`，再调用 `botshepherdApi.updateConnection()`。
- 注入 NC 时，页面先读取实例配置，再调用 `instanceNetworkApi.injectNetworkConfig()` 合并写入 websocket client。

## 关联模块

- API client：`frontend/src/services/api/botshepherdApi.ts`、`containerApi.ts`、`instanceNetworkApi.ts`。
- DTO：`frontend/src/services/api/types.ts` 中的 `BackendEndpoint`、`BSConnection`、`Container`、`NetworkEndpointConfig`。
- 后端路由：`routers/botshepherd_router.py`、`routers/container_crud_router.py`、`routers/container_config_router.py`。
- 后端服务：`services/botshepherd.py` 负责端点库、探测、连接配置和别名注入。
- 翻译：`frontend/src/i18n/translations/zh/botBackend.ts` 与 `frontend/src/i18n/translations/en/botBackend.ts`。

## 推荐读取顺序

1. 读本文件。
2. 读 `BotBackend.tsx`，理解端点数组和所有 mutation。
3. 卡片展示或按钮问题读 `EndpointCard.tsx`。
4. 编辑问题读 `EditDialog.tsx` 和 `validators.ts`。
5. BS 注入问题读 `InjectBSDialog.tsx`，再读 `botshepherdApi.ts`。
6. NC 注入问题读 `InjectNCDialog.tsx`，再读 `instanceNetworkApi.ts` 和容器配置后端。

## 维护规则

- 端点库的最终持久化结构应保持为 `BackendEndpoint[]`，即 `{ alias, url, token }`。
- `EndpointEntry` 可以包含前端展示状态，但保存给后端时不要带 `online`、`latency_ms`、`probing`。
- alias 应保持唯一，别名注入依赖它作为稳定标识。
- 注入 NC 时要保留已有 `websocketClients`，只追加缺失 URL。
- token 只能按用户输入传递，不应在页面展示额外明文提示或写入日志。
- 新增按钮或弹窗时，优先放在 `EndpointCard.tsx` 或新的 dialog 文件，不继续扩大主页面。

## 常见风险

- `handleProbe()` 使用当前 `endpoints[index]`，如果未来引入并发删除或排序，需要改成按稳定 id/url 查找。
- 自动收集内部循环调用 `setEndpoints(prev => ...)`，如果改成异步批处理，需要保证不会重复加入同一 URL。
- 注入 NC 读取本地配置后再写入，后端合并规则变更时必须同步检查 `instanceNetworkApi.ts`。

## 后续瘦身建议

- `BotBackend.tsx` 可继续拆出 `useBotBackendController.ts`，把加载、保存、探测、注入逻辑移出 JSX。
- 页面头部统计和新增端点输入栏可拆为 `EndpointSummaryBar.tsx` 和 `EndpointCreateBar.tsx`。
