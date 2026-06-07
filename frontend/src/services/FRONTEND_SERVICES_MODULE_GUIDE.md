## 前端服务层模块说明

`frontend/src/services` 存放前端侧可复用服务。它不负责渲染 UI，也不直接持有页面状态；页面和组件通过这里访问后端 API 或复用跨页面工具。

## 文件和目录

- `api.ts`：稳定公共入口。当前只转发 `api/index.ts` 和操作日志导出，用来保留历史导入路径。
- `api/`：按后端业务域拆分的 API client 目录。详细结构见 `api/SERVICE_API_ARCHITECTURE.md`。
- `operationLogs.ts`：操作日志查询、分页和下载相关 helper。它和 `api/` 分开，是因为操作日志页面有独立查询模型和下载行为。

## 调用方向

- 页面层：`frontend/src/pages/*` 通过 `../services/api` 或 `../services/operationLogs` 调用服务。
- 组件层：`frontend/src/components/*` 在确实拥有用户动作时可以调用服务，例如 Bot 管理组件调用 `botApi`。
- 后端层：服务文件最终对应 `routers/` 下的 FastAPI endpoint。

## 新增服务的放置规则

- 新增 REST API domain：放到 `api/<domain>Api.ts`，并在 `api/index.ts` 导出。
- 新增跨页面非 API 工具：放在 `frontend/src/services` 根目录，但要确保它没有 UI 依赖。
- 新增只属于一个页面的 hook 或状态控制器：不要放 services，放到页面同级功能目录，例如 `pages/alert-settings/`。

## 推荐读取顺序

1. 先读本文件确认服务边界。
2. 如果是后端 API，读 `api/SERVICE_API_ARCHITECTURE.md`。
3. 读对应 API client。
4. 回到调用页面或组件确认 UI 状态如何消费结果。

## 维护规则

- 保持 `api.ts` 轻量，避免在稳定入口里添加业务逻辑。
- 服务层不要直接引用 React hook、MUI、toast 或路由对象。
- 服务层返回原始后端语义，错误提示和用户文案由页面或组件处理。
- 多页面共享类型应放在 `api/types.ts` 或专门类型文件，不要在多个页面复制。

## 后续瘦身建议

- 如果 `operationLogs.ts` 继续增长，可按“查询构造、下载、类型定义”拆为子目录。
- 如果 `api/types.ts` 超过模型可读舒适区，可进一步按 `containerTypes.ts`、`botTypes.ts`、`alertTypes.ts` 拆分，再由 `types.ts` 聚合导出。
