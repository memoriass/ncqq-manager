## 前端组件层模块说明

`frontend/src/components` 存放可被多个页面使用的组件，以及少量与具体实例功能绑定但被页面嵌入的组件。组件层可以有局部 UI 状态，但不应承担全局路由、启动流程或后端业务规则。

## 根目录组件用途

- `BasicInfo.tsx`：实例基础信息展示。
- `BotManager.tsx`：兼容包装，实际实现位于 `bot-manager/`。
- `ErrorBoundary.tsx`：前端错误边界。
- `FileManager.tsx`：实例文件浏览、读取和删除。
- `LazyQRImage.tsx`：二维码图片懒加载与刷新辅助。
- `MiniChart.tsx`：小型资源趋势图。
- `NapCatIcon.tsx`：NapCat 图标组件。
- `NapcatLogs.tsx`：实例日志展示。
- `NetworkConfig.tsx`：实例网络配置编辑。
- `OperationLogsList.tsx`：操作日志列表。
- `OperationLogsToolbar.tsx`：操作日志查询工具栏。
- `Toast.tsx`：全局 toast provider 和 hook。

## 已拆分功能目录

- `bot-manager/`：Bot 聊天、群列表和群成员管理。详细见 `bot-manager/BOT_MANAGER_MODULE_GUIDE.md`。

## 组件层边界

- 可复用组件应通过 props 接收数据和事件回调。
- 组件可调用 API 的前提是该组件直接拥有用户动作，例如 Bot 聊天发送消息。
- 全局提示通过 `Toast.tsx` 提供的 hook 触发，不在 service 层触发。
- 与特定页面强绑定且只被一个页面使用的组件，应放在页面同级功能目录，而不是 components 根目录。

## 关联模块

- API 调用通过 `frontend/src/services/api`。
- 文案通过 `frontend/src/i18n`。
- 页面通过 props 将容器名、节点 id、刷新函数和布局样式传入组件。
- WebSocket 相关组件通常依赖 `frontend/src/hooks/useWebSocket`。

## 推荐读取顺序

1. 读本文件判断组件是否共享。
2. 读组件入口文件或功能目录文档。
3. 只读目标子组件，不展开所有 siblings。
4. 如组件调用 API，再读对应 API client。

## 维护规则

- 组件超过一个独立工作流时，新建同名目录拆分，并保留旧组件文件作为兼容包装。
- 共享组件不要直接写死页面路径或路由跳转。
- 组件 props 类型应显式命名；多个子组件共享时放到 `types.ts`。
- 视觉样式可以接收 `glass`、`sx` 或明确 props，但不要让子组件隐式读取页面内部变量。

## 后续瘦身候选

- `FileManager.tsx` 如果继续扩展，可拆成文件树、文件操作 toolbar、确认弹窗和 API adapter。
- `NetworkConfig.tsx` 如果增加更多协议，可按 HTTP server、HTTP client、WebSocket server、WebSocket client 子表单拆分。
