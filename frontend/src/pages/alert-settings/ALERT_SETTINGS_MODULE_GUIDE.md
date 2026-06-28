## 告警设置模块说明

本目录存放 `../AlertSettings.tsx` 的非视觉支持代码。当前页面 JSX 仍在父级页面文件中，数据加载、弹窗状态和告警规则 mutation 已集中到 controller。

## 入口关系

- `../AlertSettings.tsx`：页面渲染层，负责布局、卡片、表单和弹窗 JSX。
- `useAlertSettingsController.ts`：页面状态和业务操作入口。
- `constants.ts`：默认表单值和 SMTP provider preset。
- `types.ts`：页面内部共享的小类型。

## 文件用途

- `constants.ts`：`EMPTY_FORM`、`EMPTY_SMTP`、`QQ_SMTP_DEFAULTS`、`SMTP_PROVIDER_PRESETS`、`EMPTY_QQ_NOTIFY`、`EMPTY_SMTP_NOTIFY`、`EMPTY_API_FALLBACK`。新增表单字段时先更新这里。
- `types.ts`：`QqBotTarget`、QQ 通知和 API 兜底表单类型。
- `useAlertSettingsController.ts`：读取告警规则和设置，维护 create/QQ notify/API fallback/SMTP notify/delete/advanced SMTP 等弹窗状态，执行创建、更新、删除、切换、保存 SMTP、应用 provider preset。

## 页面数据流

- 首次加载调用 `alertApi.listRules()` 和 `alertApi.getSettings()`。
- QQ 通知弹窗会调用 `containerApi.list()` 获取实例，作为 sender bot 候选。
- Webhook 规则通过 `alertApi.createRule()`、`updateRule()`、`deleteRule()` 管理。
- QQ bot 通知本质上创建或更新 type 为 `qq_bot` 的规则，config 中包含 `instances`、`sender_bots`、`targets` 和 `api_fallback_enabled`，后端会按 `instances` 过滤，并由该开关决定是否触发 API 兜底。
- API 兜底通知创建或更新 type 为 `plugin_api` 的规则，URL 存在 `webhook_url`，config 不绑定实例，只维护 POST 地址。
- SMTP 通知会为选中的实例创建 type 为 `login_lost` 且 config 含 `smtp_recipients` 的规则。
- SMTP 全局设置通过 `alertApi.updateSettings()` 保存。
- 允许本地 webhook 的开关直接更新 `allow_local_webhook`，失败时回滚前端状态。

## 关联模块

- API client：`frontend/src/services/api/alertApi.ts` 和 `containerApi.ts`。
- DTO：`frontend/src/services/api/types.ts` 中的 `AlertRule`、`AlertSettings`、`Container`。
- 后端路由：`routers/alert_router.py`。
- 后端服务：`services/alert_manager.py`。
- 实例列表来源：`routers/container_crud_router.py` 和 `services/container_state.py`。
- 翻译：`frontend/src/i18n/translations/zh/alerts.ts` 与 `frontend/src/i18n/translations/en/alerts.ts`。
- Toast：`frontend/src/components/Toast.tsx`。

## 推荐读取顺序

1. 读本文件。
2. 读 `../AlertSettings.tsx`，确认页面区块和弹窗结构。
3. 读 `useAlertSettingsController.ts`，确认目标状态和 mutation。
4. 表单默认值或 SMTP provider 问题读 `constants.ts`。
5. QQ 通知目标结构读 `types.ts`。
6. 后端行为变化再读 `alertApi.ts`、`routers/alert_router.py`、`services/alert_manager.py`。

## 维护规则

- 新增告警规则类型时，要同步更新页面 `alertTypes`、后端 `alert_manager` 处理逻辑和中英文翻译。
- 新增 SMTP 字段时，要同步更新 `EMPTY_SMTP`、controller 的 `setSmtpForm()` 初始化、`AlertSettings` 类型和后端 settings。
- 弹窗开关和表单 state 优先放 controller，不继续堆到 `AlertSettings.tsx`。
- 页面渲染层不要直接复制 API mutation，统一走 controller，便于后续拆分子 section。
- 删除规则需要保留确认弹窗状态，避免误删。

## 后续瘦身建议

- `../AlertSettings.tsx` 可拆成 `QqNotifySection.tsx`、`WebhookRulesSection.tsx`、`SmtpSettingsSection.tsx`。
- 弹窗可拆成 `CreateWebhookRuleDialog.tsx`、`QqNotifyDialog.tsx`、`SmtpNotifyDialog.tsx`、`SmtpAdvancedDialog.tsx`、`DeleteRuleDialog.tsx`。
- controller 可继续拆出 `useAlertRules()` 和 `useSmtpSettings()`，但要避免过早拆成难追踪的小 hook。
