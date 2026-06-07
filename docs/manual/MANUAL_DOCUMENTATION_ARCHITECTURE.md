## 静态手册架构说明

`docs/manual` 存放拆分后的本地使用手册资源。真正的手册入口是上级文件 `docs/manual.html`，本目录提供它引用的共享资源和章节页面。

## 目录关系

- `../manual.html`：手册壳页面，包含 header、侧边栏、主题按钮和 `iframe`。它通过侧边栏链接加载章节。
- `assets/`：手册共享 CSS 和 JavaScript。详细见 `assets/MANUAL_ASSETS_GUIDE.md`。
- `sections/`：每个章节一个 HTML 文件。详细见 `sections/MANUAL_SECTIONS_GUIDE.md`。

## 页面加载流程

1. 后端 `main.py` 的 `/manual` 路由返回 `docs/manual.html`。
2. `manual.html` 加载 `manual/assets/manual.css` 和 `manual/assets/manual.js`。
3. `manual.html` 默认让 `iframe` 打开 `manual/sections/intro.html`。
4. 用户点击侧边栏链接时，目标章节在 `manualFrame` iframe 中打开。
5. `manual.js` 根据 hash 和 `data-section` 控制当前激活项。
6. 章节页面加载 `../assets/manual.css` 和 `../assets/section-theme.js`，从而继承主题。

## 新增章节流程

1. 在 `sections/` 下新增一个 HTML 文件，例如 `scheduler.html`。
2. 章节页面引用 `../assets/manual.css` 和 `../assets/section-theme.js`。
3. 在 `../manual.html` 侧边栏添加链接，`href` 指向 `manual/sections/scheduler.html`。
4. 链接的 `target` 保持为 `manualFrame`。
5. 链接的 `data-section` 和 `onclick="setActiveSection('scheduler')"` 使用同一个 section id。
6. 更新 `sections/MANUAL_SECTIONS_GUIDE.md` 的章节清单。

## 修改章节流程

- 只改某个功能说明时，优先修改对应 `sections/*.html`。
- 改全局布局、颜色、表格、卡片样式时，修改 `assets/manual.css`。
- 改侧边栏、hash、主题切换或移动端侧栏时，修改 `assets/manual.js`。
- 改章节 iframe 内主题同步时，修改 `assets/section-theme.js`。

## 关联模块

- 后端入口：`main.py` 中的 `/manual` 路由和 `DOCS_DIR`。
- 前端应用：手册是静态 HTML，不依赖 Vite 构建输出。
- 手册资源：`assets/` 和 `sections/` 必须保持相对路径正确，因为后端直接按文件系统返回。

## 维护规则

- 章节页不要再定义全局 header 或侧边栏，导航只属于 `manual.html`。
- 章节页应自包含正文，不依赖其他章节的 DOM。
- 新增章节时必须同时更新侧边栏和章节清单，避免可访问但不可导航，或可导航但文件不存在。
- 静态手册不应引入大型前端框架，保持可直接由后端 FileResponse 服务。

## 常见风险

- `manual.html` 中的链接路径从 `docs/` 视角出发，章节文件内部的资源路径从 `docs/manual/sections/` 视角出发，两者不同。
- 章节在 iframe 中运行，不能依赖父页面中的全局变量，除非明确通过脚本同步。
- 改文件名后必须同步 `manual.html` 的 `href` 和 `data-section`。
