## i18n

This folder owns frontend translation lookup.

- `index.ts` keeps the public import path stable for existing `../i18n` imports.
- `useTranslate.ts` reads the active language from `LanguageContext` and resolves dotted keys.
- `translations/` stores language data split by language and namespace.

When adding a new UI namespace, add the same namespace file under every language folder and export it from the language aggregate.
