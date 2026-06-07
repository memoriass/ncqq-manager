## BotShepherd UI 模块说明

本目录存放 BotShepherd 页面拆出来的 UI 辅助组件。当前主页面仍是 `../BotShepherd.tsx`，这里的文件主要用于压缩表格行、统计卡片和编辑弹窗的上下文。

## 入口关系

- `../BotShepherd.tsx`：页面主入口，负责数据加载、轮询、生命周期动作、日志弹窗、连接区和账号区编排。
- `index.ts`：聚合导出本目录组件，供 `../BotShepherd.tsx` 一次性导入。
- `types.ts`：导出 dialog 内部辅助类型。

## 文件用途

- `InfoItem.tsx`：服务状态面板里的小型标签和值展示。
- `StatCard.tsx`：连接和账号统计卡片。
- `ConnRow.tsx`：BotShepherd connection 表格行，展示连接 id、名称、client endpoint、target endpoints、状态、self id 和行操作。
- `ConnDialog.tsx`：connection 新建、编辑、复制表单，处理 connection id、名称、描述、client endpoint、target endpoints、启用状态。
- `AcctDialog.tsx`：账号名称、描述和启用状态编辑表单。
- `types.ts`：`ConnDialogData`，补充 copy/edit 临时字段。
- `index.ts`：导出 `AcctDialog`、`ConnDialog`、`ConnRow`、`InfoItem`、`StatCard` 和 `ConnDialogData`。

## 主页面数据流

- `../BotShepherd.tsx` 调用 `botshepherdApi.status()` 获取安装、初始化、运行、端口、pid、auto start 和 activation 状态。
- 页面调用 `botshepherdApi.connections()` 获取 connection 列表，并交给 `ConnRow` 渲染。
- 页面调用 `botshepherdApi.accounts()` 获取账号列表，并在账号表格中打开 `AcctDialog`。
- 生命周期按钮调用 `setup()`、`start()`、`stop()`，成功后刷新 status、connections、accounts。
- 日志弹窗调用 `botshepherdApi.logs(lines)`，支持自动刷新。
- connection 保存调用 `updateConnection()` 或 `copyConnection()`，删除调用 `deleteConnection()`。
- account 保存调用 `updateAccount()`，删除调用 `deleteAccount()`，在线检测调用 `accountOnline()`。

## 关联模块

- API client：`frontend/src/services/api/botshepherdApi.ts`。
- DTO：`frontend/src/services/api/types.ts` 中的 `BotShepherdStatus`、`BSConnection`、`BSAccount`、`BSConnectionsResponse`、`BSAccountsResponse`。
- 后端路由：`routers/botshepherd_router.py`。
- 后端服务：`services/botshepherd.py`、`services/bs_activation_service.py`、`services/bot_heartbeat.py`。
- 相关页面：`frontend/src/pages/bot-backend/` 会读取 BotShepherd connections 并向其中注入 target endpoint。
- 翻译：`frontend/src/i18n/translations/zh/botshepherd.ts` 与 `frontend/src/i18n/translations/en/botshepherd.ts`。

## 推荐读取顺序

1. 读本文件。
2. 读 `../BotShepherd.tsx` 理解状态、轮询和页面区块。
3. 连接行展示或行操作读 `ConnRow.tsx`。
4. 连接新建/编辑/复制读 `ConnDialog.tsx` 和 `types.ts`。
5. 账号编辑读 `AcctDialog.tsx`。
6. 统计展示读 `InfoItem.tsx` 或 `StatCard.tsx`。
7. 后端行为再读 `botshepherdApi.ts` 和 `routers/botshepherd_router.py`。

## 维护规则

- 本目录组件不主动请求后端，后端调用留在 `../BotShepherd.tsx` 或未来的 controller。
- `ConnDialog.tsx` 内部表单字段要保持和 `BSConnection` 兼容，临时 copy 字段只能用于前端，不应直接写给后端。
- `ConnRow.tsx` 的状态映射要和后端 `client_status` 枚举一致。
- `target_endpoints` 是数组，新增 UI 时要保留多端点编辑能力。
- 只有 BotShepherd running 时才允许部分 connection/account 变更，这个约束由主页面决定。

## 后续瘦身建议

- 将 `../BotShepherd.tsx` 的数据加载和 mutation 拆成 `useBotShepherdController.ts`。
- 将连接面板拆成 `ConnectionsPanel.tsx`，账号面板拆成 `AccountsPanel.tsx`。
- 将日志弹窗拆成 `BotShepherdLogsDialog.tsx`。
- 将 activation popover 拆成 `ActivationStatusPopover.tsx`。
