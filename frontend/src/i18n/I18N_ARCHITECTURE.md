## 前端国际化架构

`frontend/src/i18n` 负责前端翻译数据、当前语言上下文和翻译函数。页面和组件通常只导入 `useTranslate()`，少数布局或入口组件会直接使用 `LanguageContext` 切换语言。

## 文件用途

- `index.ts`：公共导出入口，导出 `translations`、`LanguageContext`、`useTranslate`。外部优先从 `../i18n` 导入。
- `languageContext.ts`：React context，提供 `{ language, toggleLanguage }`。默认语言是 `zh`。
- `useTranslate.ts`：翻译 hook。读取当前 `language`，按 `namespace.key` 的点分路径在 `translations` 中查找字符串，找不到时返回原 key。
- `translations/`：语言数据目录，按语言和 namespace 拆分。详细见 `translations/TRANSLATIONS_STRUCTURE_GUIDE.md`。

## 调用关系

- `App.tsx` 提供 `LanguageContext.Provider`，控制当前语言和切换函数。
- `AdminLayout.tsx`、`Login.tsx`、`Setup.tsx`、`UserDashboard.tsx` 等会读取 `LanguageContext` 触发语言切换。
- 页面和组件使用 `const t = useTranslate()`，然后调用 `t('alerts.pageTitle')`、`t('botManager.chat')` 等。
- `useTranslate.ts` 依赖 `translations/index.ts` 暴露的 `{ zh, en }`。

## 翻译 key 结构

翻译 key 使用点分路径：

- 第一段是 namespace，例如 `alerts`、`botManager`、`botshepherd`。
- 后续字段是 namespace 文件中的 key，例如 `alerts.smtpSaved`。
- namespace 文件必须在所有语言中同名存在，并由语言聚合文件导出。

## 推荐读取顺序

1. 读本文件理解 i18n 查找流程。
2. 读 `useTranslate.ts` 确认 key 缺失时的行为。
3. 读 `translations/TRANSLATIONS_STRUCTURE_GUIDE.md`。
4. 按目标 namespace 读取 `translations/zh/<namespace>.ts` 和 `translations/en/<namespace>.ts`。
5. 如果新增 namespace，检查 `translations/zh.ts`、`translations/en.ts` 和 `translations/index.ts`。

## 维护规则

- 新增 UI 文案必须同时维护中文和英文。
- 不要在组件中硬编码可见业务文案，除非是技术协议名、固定缩写或后端返回的原始值。
- key 缺失会直接显示 key 字符串，这有利于暴露缺失翻译，但上线前应清除。
- 新增语言时要扩展 `translations/index.ts`，并确认 `LanguageContext`、语言切换 UI 和类型推导。
- namespace 名称应和页面或功能模块一致，避免同一功能文案散落多个文件。

## 常见风险

- 只改 `zh/` 不改 `en/` 会导致英文界面显示 key。
- 修改 namespace 名称时，需要同步页面 `t('namespace.key')` 调用。
- `useTranslate()` 当前只返回字符串，不处理 ReactNode、插值对象或复数规则；需要动态值时由调用方用 `replace()` 或模板拼接。
