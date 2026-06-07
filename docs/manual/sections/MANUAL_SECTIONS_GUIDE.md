## 手册章节结构说明

本目录每个 HTML 文件都是一个独立手册章节。章节由 `docs/manual.html` 的 iframe 加载，因此章节文件只负责正文内容，不负责全局导航。

## 当前章节清单

- `intro.html`：项目简介和能力概览。
- `install.html`：安装部署。
- `quickstart.html`：快速启动。
- `dashboard.html`：管理面板。
- `container.html`：容器管理。
- `users.html`：用户管理。
- `cluster.html`：集群配置。
- `files.html`：文件管理。
- `network.html`：网络配置。
- `alerts.html`：告警设置。
- `backup.html`：备份恢复。
- `images.html`：镜像管理。
- `botmanager.html`：Bot 管理。
- `botshepherd.html`：BotShepherd。
- `api.html`：API 接口。
- `security.html`：安全说明。
- `env.html`：环境变量。
- `docker.html`：Docker 部署。
- `faq.html`：常见问题。

## 章节页面约定

- 每个章节都应引用 `../assets/manual.css`。
- 每个章节都应引用 `../assets/section-theme.js`，以保持明暗主题一致。
- 章节页正文应从 `h1` 或主要标题开始。
- 章节不要包含壳页面 header、sidebar 或 iframe。
- 章节中的内部链接要确认在 iframe 语境下可用。

## 新增或重命名章节

1. 新增或重命名本目录 HTML 文件。
2. 更新 `../../manual.html` 中的侧边栏链接。
3. 保持 `href`、`data-section`、`setActiveSection()` 参数一致。
4. 更新本文件的章节清单。
5. 在浏览器打开 `/manual#<section>` 验证 hash 直达。

## 维护建议

- 一个章节只覆盖一个功能域，避免单章节再次膨胀。
- 表格、步骤、注意事项尽量使用现有 CSS class，避免内联样式。
- 如果多个章节重复同一大段说明，优先在 `api.html`、`security.html` 等更合适的章节集中说明，再从其他章节短链接引用。
- 功能 UI 更新后，同步检查对应章节是否还描述旧按钮、旧路径或旧权限。

## 常见风险

- 章节文件路径从 `docs/manual/sections` 出发，资源引用必须使用 `../assets/...`。
- 壳页面侧边栏路径从 `docs` 出发，链接必须使用 `manual/sections/...`。
- 直接改章节文件名但不改 `manual.html`，会导致侧边栏点击后 iframe 404。
