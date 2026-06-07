## 中文翻译命名空间说明

本目录存放中文翻译 namespace。每个 `.ts` 文件对应一个顶层 namespace，并由 `../zh.ts` 聚合导出。

## 文件用途

- `admin.ts`：后台布局、导航、通用操作按钮、确认文案。
- `alerts.ts`：告警设置页面、QQ 通知、Webhook、SMTP、高级 SMTP 设置和删除确认。
- `backup.ts`：备份恢复页面。
- `basicInfo.ts`：实例基础信息组件。
- `botBackend.ts`：Bot 后端端点页面。
- `botManager.ts`：Bot 聊天、联系人、群管理、群成员管理。
- `botshepherd.ts`：BotShepherd 服务、连接、账号、日志、activation 状态。
- `clusterConfig.ts`：集群配置和实例创建默认项。
- `config.ts`：配置编辑相关文案。
- `imageManager.ts`：Docker 镜像管理。
- `login.ts`：登录页面。
- `monitor.ts`：监控指标短文案。
- `network.ts`：实例网络配置。
- `nodePanel.ts`：节点管理和节点监控。
- `opLogs.ts`：操作日志筛选、列表、下载。
- `scheduler.ts`：调度相关文案。
- `setup.ts`：首次初始化。
- `user.ts`：普通用户面板。
- `userMgmt.ts`：用户管理。

## 关联文件

- 英文镜像目录：`../en/`。
- 中文聚合入口：`../zh.ts`。
- 总聚合入口：`../index.ts`。
- 翻译 hook：`../../useTranslate.ts`。

## 新增或修改中文 key

1. 找到功能对应 namespace，例如 Bot 管理改 `botManager.ts`。
2. 在中文文件添加或修改 key。
3. 立刻在 `../en/` 下同名文件添加或修改英文 key。
4. 如果新增 namespace，同步更新 `../zh.ts` 和 `../en.ts`。
5. 全局搜索页面调用，确认 `t('namespace.key')` 拼写一致。

## 命名规则

- key 使用小驼峰，避免空格、中文和特殊符号。
- 同一功能的 key 放在同一个 namespace，不要把页面文案拆散。
- 按页面阅读顺序组织 key，便于后续模型对照 UI 查找。
- 删除 key 前先用 `rg "namespace\\.key" frontend/src` 确认没有调用点。

## 常见风险

- 中文文件新增 key 但英文缺失，会导致英文界面显示原 key。
- 改 namespace 导出名时，必须同步 `../zh.ts` import 名称和对象字段。
- 对需要插值的文案，当前项目通常使用 `.replace('{n}', value)`，需要保留占位符名称一致。
