## bot-manager

This folder owns the Bot management UI.

- `BotManager.tsx` switches between chat and group management tabs.
- `ChatPanel.tsx` handles message history, realtime message updates, and sending messages.
- `GroupsPanel.tsx` lists groups and owns group-level actions.
- `GroupMembersView.tsx` handles member-level moderation and card edits.
- `types.ts` stores shared Bot manager types.

Keep API calls close to the panel that owns the user action. Shared view state should go through `types.ts` only when more than one panel needs it.
