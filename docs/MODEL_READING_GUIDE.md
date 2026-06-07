## Model Reading Guide

Use this file as the first stop before model-assisted maintenance.

Recommended read order:

1. Read the README in the feature folder being changed.
2. Read the route/page entry file.
3. Read only the focused component, hook, service, or API client file that owns the behavior.
4. Read adjacent `types.ts`, `constants.ts`, or `validators.ts` files only when the change touches shared contracts.

Frontend map:

- Pages: `frontend/src/pages/README.md`
- API client: `frontend/src/services/api/README.md`
- Translations: `frontend/src/i18n/README.md`
- Bot manager: `frontend/src/components/bot-manager/README.md`
- Bot backend: `frontend/src/pages/bot-backend/README.md`
- BotShepherd UI helpers: `frontend/src/pages/bot-shepherd/README.md`
- Alert settings: `frontend/src/pages/alert-settings/README.md`

Backend map:

- Routers: `routers/README.md`
- Services: `services/README.md`

Static documentation map:

- Manual shell and sections: `docs/manual/README.md`

Current large-file policy:

- Source and documentation files should stay below 800 lines.
- Prefer keeping frequently-read frontend modules below 400 lines.
- Lock files and binary assets are excluded from manual splitting.
