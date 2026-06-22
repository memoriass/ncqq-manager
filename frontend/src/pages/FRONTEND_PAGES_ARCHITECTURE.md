## 前端页面层架构

`frontend/src/pages` 存放路由级页面。页面文件负责“加载页面、组织布局、连接服务与组件”，不应长期承担所有表单、弹窗、表格行、业务校验和复杂状态。

## 页面文件用途

- `Dashboard.tsx`：管理面板首页，聚合容器、节点、资源和状态信息。
- `UserDashboard.tsx`：普通用户视角的实例面板，通常使用公开或受限 API。
- `Login.tsx`：登录页面。
- `Setup.tsx`：首次初始化页面。
- `Nodes.tsx`：节点和集群配置页面。
- `ClusterSettings.tsx`：集群运行参数、镜像和端口等配置。
- `ConfigEditor.tsx`：实例配置文件编辑页面。
- `ImageManager.tsx`：Docker 镜像管理页面。
- `BackupRestore.tsx`：备份下载、上传和恢复页面。
- `Users.tsx`：用户管理与实例授权页面。
- `OperationLogs.tsx`、`OperationLogsPage.tsx`：操作日志查询和展示。
- `AlertSettings.tsx`：告警设置页面，状态控制已拆到 `alert-settings/`。
- `BotBackend.tsx`：兼容包装，实际页面在 `bot-backend/`。
- `BotShepherd.tsx`：BotShepherd 页面主入口，部分 UI 组件已拆到 `bot-shepherd/`。

## 已拆分功能目录

- `alert-settings/`：告警设置的默认值、类型和 controller。详细见 `alert-settings/ALERT_SETTINGS_MODULE_GUIDE.md`。
- `bot-backend/`：Bot 后端端点雷达和注入页面。详细见 `bot-backend/BOT_BACKEND_MODULE_GUIDE.md`。
- `bot-shepherd/`：BotShepherd 页面辅助组件。详细见 `bot-shepherd/BOT_SHEPHERD_UI_MODULE_GUIDE.md`。
- `nodes/`：节点管理页面的表单弹窗等辅助组件，避免 `Nodes.tsx` 承担过多 JSX。

## 页面层边界

- 页面可以持有路由级状态、tab 选择、加载状态和主要数据刷新节奏。
- 复杂弹窗应拆到同级功能目录中的 `*Dialog.tsx`。
- 表格行、卡片、统计块应拆到 `*Row.tsx`、`*Card.tsx` 或小组件文件。
- 多个子组件共享的类型放在同级 `types.ts`。
- 表单默认值、枚举、preset 放在同级 `constants.ts`。
- 与页面强绑定的数据加载和 mutation 状态可以放在 `useXxxController.ts`。

## 关联模块

- 页面通过 `frontend/src/services/api` 调后端。
- 页面文案通过 `frontend/src/i18n` 的 `useTranslate()` 获取。
- 共享 UI 组件来自 `frontend/src/components`。
- Bot 相关页面还会使用 `frontend/src/hooks/useWebSocket` 和后端 `routers/ws_router.py`。

## 推荐读取顺序

1. 读本文件确认目标页面是否已有功能目录。
2. 读页面文件，理解页面数据流和布局。
3. 如果有同名功能目录，读该目录的模块文档。
4. 再读具体 `Dialog`、`Card`、`Row`、`controller` 或 `types` 文件。
5. 改 API 时同步读 `frontend/src/services/api/SERVICE_API_ARCHITECTURE.md` 和对应后端 router。

## 维护规则

- 新增页面时保持页面文件聚焦，不要一次性把所有弹窗和表格行写入同一个文件。
- 页面超过 500 行时，优先拆出弹窗、列表行、卡片和 controller。
- 路由兼容包装可以保留，例如 `BotBackend.tsx` 继续导出 `./bot-backend`，避免大范围修改引用。
- 页面不应重复定义后端 DTO；优先从 `services/api` 导入类型。

## 后续瘦身候选

- `BotShepherd.tsx` 仍承担数据刷新、日志弹窗、连接区、账号区和确认弹窗，后续可继续拆成 `useBotShepherdController.ts`、`BotShepherdLogsDialog.tsx`、`ConnectionPanel.tsx` 和 `AccountPanel.tsx`。
- `AlertSettings.tsx` 已拆出 controller，但 JSX 仍较多，后续可拆 `QqNotifySection.tsx`、`WebhookSection.tsx`、`SmtpSection.tsx` 和相关 dialog。
