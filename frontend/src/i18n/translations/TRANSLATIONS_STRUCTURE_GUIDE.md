## 翻译聚合结构说明

本目录负责把不同语言、不同 namespace 的翻译文件组合成 `translations` 对象，供 `useTranslate()` 查询。

## 文件和目录

- `index.ts`：导入 `zh` 和 `en`，导出 `translations = { zh, en }`。
- `zh.ts`：导入 `zh/` 下所有 namespace，并导出中文语言对象。
- `en.ts`：导入 `en/` 下所有 namespace，并导出英文语言对象。
- `zh/`：中文 namespace 文件。详细见 `zh/ZH_TRANSLATION_NAMESPACE_GUIDE.md`。
- `en/`：英文 namespace 文件。详细见 `en/EN_TRANSLATION_NAMESPACE_GUIDE.md`。

## 当前 namespace

- `admin`：后台布局、通用管理动作和通用按钮。
- `imageManager`：镜像管理。
- `monitor`：监控相关短文案。
- `alerts`：告警设置、QQ 通知、SMTP、规则。
- `backup`：备份恢复。
- `scheduler`：计划任务或调度相关文案。
- `config`：配置编辑。
- `network`：网络配置。
- `user`：普通用户面板。
- `login`：登录。
- `setup`：初始化。
- `nodePanel`：节点面板。
- `userMgmt`：用户管理。
- `opLogs`：操作日志。
- `basicInfo`：实例基础信息。
- `clusterConfig`：集群配置。
- `botManager`：Bot 聊天、群、群成员管理。
- `botshepherd`：BotShepherd 页面。
- `botBackend`：Bot 后端端点雷达页面。

## 新增 namespace 流程

1. 在 `zh/<name>.ts` 新建中文 namespace。
2. 在 `en/<name>.ts` 新建英文 namespace。
3. 在 `zh.ts` 和 `en.ts` 中分别 import 并加入导出对象。
4. 页面中使用 `t('<name>.<key>')`。
5. 全局搜索 `<name>.`，确认没有拼写不一致。

## 修改现有 key 流程

1. 先确认调用点，例如 `rg "alerts\\.smtpSaved" frontend/src`。
2. 同步修改 `zh/` 和 `en/` 同名 namespace。
3. 如果 key 改名，所有 `t('old.key')` 调用必须同步替换。
4. 如果只是文案改动，不需要改聚合文件。

## 维护规则

- `zh.ts` 和 `en.ts` 的 namespace 列表必须保持一致。
- namespace 文件只导出一个同名对象，例如 `export const alerts = { ... }`。
- 不要在 namespace 内嵌过深，当前 `useTranslate()` 可以解析深层对象，但维护时更难全局搜索。
- 页面级文案优先放对应页面 namespace；跨页面通用按钮放 `admin` 或更合适的通用 namespace。

## 检查建议

- 新增或改名后运行前端构建，TypeScript 会检查 import/export。
- 用 `rg "t\\('" frontend/src` 抽查调用是否仍引用旧 key。
- 对新增 namespace，同步更新 `zh/` 和 `en/` 两份 namespace 指南中的文件清单。
