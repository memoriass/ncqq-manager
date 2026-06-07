## bot-backend

This folder owns the Bot backend endpoint management page.

- `BotBackend.tsx` owns page state, persistence, probing, auto-collection, and injection orchestration.
- `EndpointCard.tsx` renders one endpoint and opens endpoint-specific dialogs.
- `EditDialog.tsx` validates and saves endpoint URL, alias, and token edits.
- `InjectBSDialog.tsx` injects selected endpoints into BotShepherd connections.
- `InjectNCDialog.tsx` injects selected endpoints into NCQQ instance configs.
- `types.ts` and `validators.ts` keep small shared helpers.

Keep endpoint mutation behavior in `BotBackend.tsx`; keep modal-only UI state inside the dialog components.
