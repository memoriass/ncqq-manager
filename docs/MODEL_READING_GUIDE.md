## 大模型阅读入口

这个文件是后续模型辅助维护时的第一站。目标不是替代模块文档，而是告诉模型如何用最少上下文找到正确边界，避免一次性读取整个项目。

## 总体读取策略

1. 先读本文件，确定功能属于前端页面、前端服务、后端路由、后端服务、国际化还是静态手册。
2. 进入目标目录后，优先读该目录下的语义化模块文档，例如 `BOT_BACKEND_MODULE_GUIDE.md` 或 `SERVICE_API_ARCHITECTURE.md`。
3. 再读入口文件。前端通常是页面组件或 `index.ts`，后端通常是具体 `*_router.py`。
4. 只补读真正拥有行为的文件。不要因为相邻目录存在就展开读取，除非模块文档的“关联模块”明确指出需要联动。
5. 改接口、DTO、翻译 key、权限或持久化结构时，必须同时读取调用端和被调用端。

## 前端模块地图

- 页面层架构：`frontend/src/pages/FRONTEND_PAGES_ARCHITECTURE.md`
- 组件层架构：`frontend/src/components/FRONTEND_COMPONENTS_MODULE_GUIDE.md`
- 前端服务层：`frontend/src/services/FRONTEND_SERVICES_MODULE_GUIDE.md`
- API 客户端架构：`frontend/src/services/api/SERVICE_API_ARCHITECTURE.md`
- 国际化架构：`frontend/src/i18n/I18N_ARCHITECTURE.md`
- 翻译聚合结构：`frontend/src/i18n/translations/TRANSLATIONS_STRUCTURE_GUIDE.md`
- 中文翻译命名空间：`frontend/src/i18n/translations/zh/ZH_TRANSLATION_NAMESPACE_GUIDE.md`
- 英文翻译命名空间：`frontend/src/i18n/translations/en/EN_TRANSLATION_NAMESPACE_GUIDE.md`

## 已拆分前端功能

- Bot 管理组件：`frontend/src/components/bot-manager/BOT_MANAGER_MODULE_GUIDE.md`
- Bot 后端端点页面：`frontend/src/pages/bot-backend/BOT_BACKEND_MODULE_GUIDE.md`
- BotShepherd 页面辅助组件：`frontend/src/pages/bot-shepherd/BOT_SHEPHERD_UI_MODULE_GUIDE.md`
- 告警设置页面控制器：`frontend/src/pages/alert-settings/ALERT_SETTINGS_MODULE_GUIDE.md`

## 后端模块地图

- FastAPI 路由层：`routers/ROUTERS_ARCHITECTURE.md`
- 后端服务层：`services/BACKEND_SERVICES_ARCHITECTURE.md`
- 应用启动入口：`main.py`

后端读取顺序通常是：目标 `*_router.py` -> 对应 service -> `services/config.py` 或 `services/database.py` 等共享基础设施。只有在改启动流程、中间件、路由注册、静态资源挂载时才优先读 `main.py`。

## 静态手册地图

- 手册整体架构：`docs/manual/MANUAL_DOCUMENTATION_ARCHITECTURE.md`
- 手册静态资源：`docs/manual/assets/MANUAL_ASSETS_GUIDE.md`
- 手册章节结构：`docs/manual/sections/MANUAL_SECTIONS_GUIDE.md`
- 手册壳页面：`docs/manual.html`

## 文件瘦身原则

- 源码和文档文件尽量低于 800 行。
- 高频前端文件建议低于 400 行；超过 500 行时应优先拆出 controller、dialog、row、card、types、constants 或 validators。
- 后端大文件优先按“路由边界、业务服务、外部系统适配、持久化读写、后台任务”拆分。
- `package-lock.json`、图片、二进制资源不按源码大文件策略处理。

## 修改前检查清单

- 确认是否有稳定兼容入口，例如 `frontend/src/services/api.ts`、`frontend/src/pages/BotBackend.tsx`、`frontend/src/components/BotManager.tsx`。
- 改前端 API 时，同步检查 `frontend/src/services/api/types.ts` 和对应后端 router。
- 改后端返回结构时，同步检查前端 API client、页面使用点和翻译文案。
- 新增翻译 key 时，必须同时维护 `zh/` 与 `en/` 下同名 namespace。
- 拆文件时保留旧 import path 的兼容包装，除非全项目已经同步替换。
