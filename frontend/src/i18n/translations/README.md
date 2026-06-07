## translations

This folder aggregates all language packs.

- `zh.ts` and `en.ts` assemble the top-level language objects.
- `zh/` and `en/` contain namespace files such as `admin.ts`, `alerts.ts`, and `botManager.ts`.

Keep namespace names aligned between languages so `useTranslate()` can resolve the same dotted key in every locale.
