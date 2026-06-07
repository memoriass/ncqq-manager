## Bot 管理组件模块说明

本目录负责实例内 Bot 的聊天、群管理和群成员管理。它被 `frontend/src/components/BotManager.tsx` 作为兼容入口导出，通常由实例详情或用户面板嵌入。

## 入口关系

- `../BotManager.tsx`：兼容包装，外部仍可从 `components/BotManager` 导入。
- `BotManager.tsx`：真实入口，接收 `name`，在“聊天”和“群管理”两个子 tab 之间切换。
- `types.ts`：共享 props 和 OneBot 群数据类型。

## 文件用途

- `BotManager.tsx`：只负责 tab 状态、通用玻璃样式和子面板切换。
- `ChatPanel.tsx`：聊天会话列表、群/私聊消息缓存、WebSocket 实时消息、发送消息、联系人选择弹窗、手动发起私聊。
- `GroupsPanel.tsx`：群列表、刷新、群改名、群公告、全员禁言、退出群，并在选择群后切换到成员视图。
- `GroupMembersView.tsx`：群成员列表、角色排序、禁言/解禁、踢人、设置/取消管理员、修改群名片。
- `types.ts`：`BotManagerProps`、`GlassStyle`、`GroupItem`、`GroupMember`。

## 数据流

- `BotManager.tsx` 将 `name` 和 `glass` 样式传给子面板。
- `ChatPanel.tsx` 使用 `botApi.call()` 拉群列表和好友列表，使用 `botApi.getMessages()` 拉缓存消息，使用 `botApi.send()` 发消息。
- `ChatPanel.tsx` 通过 `useWebSocket({ path: /ws/bot_messages/{name} })` 接收历史和新增消息。
- `GroupsPanel.tsx` 使用 OneBot action，例如 `get_group_list`、`set_group_name`、`set_group_whole_ban`、`_get_group_notice`。
- `GroupMembersView.tsx` 使用 OneBot action，例如 `get_group_member_list`、`set_group_ban`、`set_group_kick`、`set_group_admin`、`set_group_card`。

## 关联模块

- API client：`frontend/src/services/api/botApi.ts`。
- WebSocket：`frontend/src/hooks/useWebSocket` 和后端 `routers/ws_router.py`。
- 后端 Bot 代理：`routers/bot_api_router.py` 和 `services/napcat_ws_service.py`。
- 头像资源：`routers/resource_router.py` 提供 `/api/resource/avatar/{uin}` 和 `/api/resource/group_avatar/{group_id}`。
- 翻译：`frontend/src/i18n/translations/zh/botManager.ts` 与 `frontend/src/i18n/translations/en/botManager.ts`。
- Toast：`frontend/src/components/Toast.tsx`。

## 推荐读取顺序

1. 读本文件。
2. 读 `BotManager.tsx` 确认入口 props 和 tab 切换。
3. 聊天问题读 `ChatPanel.tsx`。
4. 群级操作读 `GroupsPanel.tsx`。
5. 群成员操作读 `GroupMembersView.tsx`。
6. API 或 WebSocket 问题再读 `botApi.ts`、`routers/bot_api_router.py`、`routers/ws_router.py`。

## 维护规则

- 新增聊天行为优先放在 `ChatPanel.tsx`，不要提升到 `BotManager.tsx`。
- 新增群级操作放在 `GroupsPanel.tsx`，成员级操作放在 `GroupMembersView.tsx`。
- OneBot action 名称要和后端代理保持一致，参数结构以 NapCat/OneBot 约定为准。
- 消息列表需要去重，避免 WebSocket 历史和实时消息重复渲染。
- 群头像和好友头像请求失败时必须保留可用的 fallback UI。
- 新增文案必须同时维护中英文 `botManager` namespace。

## 后续瘦身建议

- `ChatPanel.tsx` 仍较大，可继续拆出 `ConversationList.tsx`、`MessageList.tsx`、`MessageComposer.tsx` 和 `ContactDialog.tsx`。
- `GroupsPanel.tsx` 可拆 `GroupTable.tsx`、`RenameGroupDialog.tsx`、`GroupNoticeDialog.tsx`。
- `GroupMembersView.tsx` 可拆 `MemberTable.tsx`、`MuteDialog.tsx`、`EditCardDialog.tsx`。
