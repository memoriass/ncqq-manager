## 手册静态资源说明

本目录存放静态手册的共享样式和脚本。它同时服务 `docs/manual.html` 壳页面和 `docs/manual/sections/*.html` 章节页面。

## 文件用途

- `manual.css`：全局布局、明暗主题、侧边栏、header、iframe、章节正文、卡片、表格、代码块、提示块等样式。
- `manual.js`：只在 `manual.html` 壳页面中使用，负责主题切换、侧边栏显示、当前章节激活状态、URL hash 同步和初始章节跳转。
- `section-theme.js`：只在章节页面中使用，从父页面或本地状态读取主题，并写入章节页 `data-theme`。

## 调用关系

- `docs/manual.html` 引用 `manual/assets/manual.css` 和 `manual/assets/manual.js`。
- `docs/manual/sections/*.html` 引用 `../assets/manual.css` 和 `../assets/section-theme.js`。
- `manual.js` 操作壳页面中的 `.sidebar-link`、`#sidebar`、`#manualFrame` 和主题按钮。
- `section-theme.js` 操作章节页自己的 `document.documentElement`。

## 修改范围判断

- 页面宽度、侧边栏、header、iframe 或移动端布局问题：改 `manual.css`。
- 点击章节后激活状态不对、hash 不对、移动端侧栏不关闭：改 `manual.js`。
- 章节页主题和壳页面不一致：改 `section-theme.js`。
- 某个章节正文结构问题：改 `../sections/<section>.html`，不要改共享资源。

## 维护规则

- CSS class 尽量使用语义命名，避免和主前端应用的 MUI class 混淆。
- `manual.js` 不应依赖构建工具或 npm 包。
- `manual.js` 中新增 DOM 查询时，要确认目标只存在于壳页面。
- `section-theme.js` 不应访问壳页面复杂 DOM，只处理主题同步。
- 修改资源文件名或路径后，必须同步 `docs/manual.html` 和所有章节页引用。

## 常见风险

- `manual.css` 同时影响壳页面和章节页面，改通用 selector 前要检查两类页面。
- 章节页在 iframe 中，壳页面脚本不会自动在章节页执行。
- 浏览器可能缓存静态资源，当前入口使用 `?v=split` 版本参数，必要时同步更新版本参数。
