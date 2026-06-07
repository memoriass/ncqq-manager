## English Translation Namespace Guide

This directory stores English translation namespaces. Each `.ts` file maps to one top-level namespace and is aggregated by `../en.ts`.

## File Purposes

- `admin.ts`: admin layout, navigation, shared actions, common confirmation text.
- `alerts.ts`: alert settings, QQ notification, webhook rules, SMTP settings, advanced SMTP fields, delete confirmation.
- `backup.ts`: backup and restore page.
- `basicInfo.ts`: instance basic information component.
- `botBackend.ts`: Bot backend endpoint radar page.
- `botManager.ts`: Bot chat, contacts, group management, group member management.
- `botshepherd.ts`: BotShepherd service status, connections, accounts, logs, activation status.
- `clusterConfig.ts`: cluster configuration and instance creation defaults.
- `config.ts`: config editor copy.
- `imageManager.ts`: Docker image management.
- `login.ts`: login page.
- `monitor.ts`: monitoring labels.
- `network.ts`: instance network configuration.
- `nodePanel.ts`: node management and node monitoring.
- `opLogs.ts`: operation log filters, table, download actions.
- `scheduler.ts`: scheduler-related copy.
- `setup.ts`: first-run setup.
- `user.ts`: normal user dashboard.
- `userMgmt.ts`: user management.

## Related Files

- Chinese mirror directory: `../zh/`.
- English aggregate entry: `../en.ts`.
- Global aggregate entry: `../index.ts`.
- Translation hook: `../../useTranslate.ts`.

## Add Or Change A Key

1. Find the matching namespace, for example Bot management uses `botManager.ts`.
2. Add or update the English key.
3. Add or update the same key in `../zh/`.
4. If a new namespace is introduced, update both `../en.ts` and `../zh.ts`.
5. Search `frontend/src` for the `t('namespace.key')` call and confirm spelling.

## Naming Rules

- Use camelCase keys.
- Keep one feature's copy in one namespace.
- Keep placeholder names aligned with Chinese, for example `{n}`, `{ok}`, `{fail}`.
- Before deleting a key, run a search for `namespace.key` in `frontend/src`.

## Common Risks

- Adding only the English key leaves the Chinese UI showing the raw key.
- Renaming a namespace requires updating the aggregate file and every `t()` call.
- `useTranslate()` returns strings only. Do interpolation in the caller and keep placeholders stable across languages.
