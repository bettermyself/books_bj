# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 本地运行

```bash
python server.py   # 启动本地服务，自动打开 http://localhost:8000
```

`server.py` 仅使用 Python 3 标准库（`http.server`、`socketserver`），无需安装依赖。启动后自动打开浏览器。它提供静态文件服务并暴露四个 API 端点：
- `GET /api/books` — 从 `data/books.json` 读取全量书籍数据
- `POST /api/save-books` — 将全量数据写入 `data/books.json`（前端每次增删改后自动调用）
- `POST /api/create-book-folder` — 新增书籍时在磁盘创建 `books/<书名>/index.html`
- `POST /api/delete-book-folder` — 删除书籍时调用 `shutil.rmtree()` 删除 `books/<书名>/` 整个文件夹

## 架构

### 主书架页（index.html）

- **`index.html`** — 书架网格、英雄区名言轮播、书籍数量徽章、新增/编辑/删除书籍弹窗、确认弹窗。
- **`assets/data.js`** — 所有持久化逻辑，必须最先加载。使用服务端优先的双层存储：`initDB()` 先从 `GET /api/books` 加载数据到 `window._db`，失败时回退到 `localStorage`（键名 `reading_notes_v1`）。所有增删改查函数（`addBook`、`updateBook`、`deleteBook`、`getBook`、`getAllBooks`、`addChapter`、`updateChapter`、`deleteChapter`）均调用 `persistDB()`，同时写入 `localStorage` 和 `POST /api/save-books`（服务端持久化到 `data/books.json`）。
- **`assets/app.js`** — 所有 UI 逻辑：颜色选择器、名言轮播、统计渲染、书籍增删改弹窗、`confirmDelete()` 处理器（通过 `pendingDeleteType` 区分 `'book'` 和 `'chapter'`）、`esc()` XSS 安全转义、`openBook(id)` 含阅读位置恢复、`createBookFolder()` / `deleteBookFolder()` 服务端调用。
- **`assets/book.js`** — 书籍详情页逻辑（章节增删改、展开/折叠、简易 Markdown 渲染、阅读页检测）。**当前未被任何 HTML 页面引用，属于遗留死代码，新增章节时无需修改此文件。**
- **`assets/style.css`** — 所有共享样式。`:root` 上定义 CSS 自定义属性（金色调色板、背景/文字色阶、边框、圆角、阴影）。

**脚本加载顺序很重要：** `data.js` 必须在 `app.js` 之前加载。

### 章节阅读页（books/<书名>/*.html）

每本书在 `books/` 下有独立文件夹，包含独立的 HTML 章节页面。例如：`books/穷查理宝典/在哈佛学校毕业典礼上的演讲.html`。

章节页结构：
- 自包含 HTML，内联 `<style>` 块（仅通过 `../../assets/style.css` 引入基础变量）
- 110% 缩放：`html { font-size: 17.6px; }`，所有 rem 值自动放大
- **左侧导航栏**（352px，粘性定位，占满视口高度，隐藏滚动条）：面包屑 → 全书目录树 → 本讲小节锚点
- **右侧正文区**：文章正文，含引用块、提示卡片、表格、药方卡片、诗歌块、章节分隔符
- **阅读位置追踪**：底部 `<script>` 将滚动位置和当前页面路径保存到 `localStorage`

每本书文件夹内有一个 `index.html`，使用 `<meta http-equiv="refresh">` 跳转到默认/第一个章节。

### 阅读位置记忆系统

每本书使用两个 localStorage 键（以文件夹名为标识）：
- `reading_last_page_<文件夹名>` — 上次阅读的章节页相对路径（如 `books/穷查理宝典/在哈佛学校毕业典礼上的演讲.html`）
- `reading_scroll_<文件夹名>` — JSON 格式 `{page, y}`，记录滚动位置

`app.js` 中的 `openBook(id)` 会检查是否有保存的上次阅读页面并直接跳转；无记录时回退到 `books/<文件夹名>/index.html`。

## 关键模式

- **双层持久化**：数据同时写入 `data/books.json`（服务端，权威源）和 `localStorage`（离线缓存）。`initDB()` 优先从服务端加载，`persistDB()` 同时写入两处。
- **封面图片**：书籍数据中的 `cover` 字段存储相对路径（如 `img/穷查理宝典.jpg`），封面图片存放在 `img/` 目录。
- **书籍文件夹命名**：`server.py` 中的 `safe_dirname()` 和 `app.js` 中的 `.replace(/[\\/:*?"<>|]/g, '_')` 必须保持同步——两者剔除相同的非法文件名字符。
- **种子数据**：`seedIfEmpty()` 每次页面加载都会执行，但受 `db.seeded` 布尔值（持久化在 `localStorage` 中）控制。它仅在首次加载时插入示例书籍，之后即使用户删除所有书也不会再次插入。
- **章节页 BOOK_FOLDER 常量**：每个章节 HTML 底部有 `const BOOK_FOLDER = '书名'`，必须与磁盘上的文件夹名一致，用于驱动阅读位置的 localStorage 键。
- **侧边栏目录树**：章节页使用层级导航（全书章节 → 各讲 → 小节锚点）。新增一讲时，需在同一书籍所有兄弟 HTML 文件的 `toc-lectures` 列表中添加对应 `<li><a>` 条目以保持跨页导航同步。
- **设计令牌**：金色调色板（`--gold: #a07828`、`--gold-lt: #c9a84c`、`--gold-dk: #7a5a10`），奶油色背景（`--bg: #f5f2ec`），Georgia/Noto Serif SC 字体栈。章节页通过引入共享样式表复用这些变量。

## 数据结构

```js
// 书籍
{ id, name, author, category, color, emoji, cover, desc, status, createdAt, chapters: [...] }
// 章节
{ id, title, order, content, createdAt, updatedAt }
// 数据库根对象
{ books, nextBookId, nextChapterId, seeded }
// status 可选值: '想读' | '在读' | '已读'
// category 可选值: '投资经典' | '思维方式' | '传记' | '商业' | '其他'
```

## 新增章节页步骤

1. 创建 `books/<书名>/新章节.html` — 按照下方「章节页设计规范」编写，修改正文内容和底部 `BOOK_FOLDER` 常量
2. 更新同一书籍所有兄弟章节 HTML 中的 `toc-lectures` 列表
3. 如果是新书的第一个章节，创建 `books/<书名>/index.html` 并用 meta-refresh 跳转到默认章节

## 章节页设计规范

生成新章节 HTML 时必须严格遵循以下设计风格，确保所有章节页面视觉一致。

### 页面骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>章节标题 · 书名</title>
  <link rel="stylesheet" href="../../assets/style.css" />
  <style>
    /* 110% 缩放 */
    html { font-size: 17.6px; }
    /* 内联样式块（完整复制，不可删减） */
  </style>
</head>
<body>
  <header class="site-header">...</header>
  <div class="chapter-layout">
    <aside class="chapter-sidebar">...</aside>
    <article class="chapter-article">...</article>
  </div>
  <footer class="site-footer">...</footer>
  <script>/* 侧边栏高亮 + 阅读位置追踪 */</script>
</body>
</html>
```

### 布局规则

章节页使用 110% 缩放（`html { font-size: 17.6px; }`），所有 rem 值自动放大，px 值需手动按 ×1.1 调整。

| 区域 | 规格 |
|------|------|
| 整体布局 | `max-width: 1760px`，CSS Grid 两栏 `352px 1fr`，间距 `2.2rem` |
| 左侧导航栏 | `position: sticky; top: 88px; height: calc(100vh - 106px)`，隐藏滚动条（`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`） |
| 右侧正文卡片 | 白底（`var(--bg2)`），`padding: 2.5rem 3rem`，`border-radius: var(--radius)`，微阴影 |
| 响应式断点 | 1056px 以下单栏，792px 以下正文 padding 缩小 |

### 顶部导航栏

复用主站 `site-header`，导航链接包含「⌂ 首页」和「← 返回书架」，均指向 `../../index.html`。

### 左侧导航栏结构（从上到下）

1. **面包屑**（`.breadcrumb`）：`书架 / 书名`
2. **全书目录**（`.sidebar-label` + `.book-toc`）：列出全书各章，当前章加 `.current-chapter`，展开的章节内用 `.toc-lectures` 列出各讲，当前讲加 `.active`
3. **本讲目录**（`.sidebar-label.sidebar-label-sub` + `#sidebar-nav`）：列出正文各 `<section>` 的锚点链接，二级标题用 `.sub` 类名缩进

### 正文区组件库

生成正文时，根据内容语义选用以下组件，**避免大段纯文字**：

#### 1. 文章头部（`.article-header`）
```html
<header class="article-header">
  <div class="article-eyebrow">书名 · 第X章 章名 · 第X讲</div>
  <h1 class="article-title">标题</h1>
  <div class="article-meta">
    <span><strong>标签名</strong>值</span>
  </div>
</header>
```

#### 2. 章节标题
- `<h2>` — 一级章节标题，金色下边框（`border-bottom: 2px solid var(--gold)`），`display: inline-block`
- `<h3>` — 二级标题，左侧金色竖线（`border-left: 3px solid var(--gold)`）
- 每个 `<h2>` 对应一个 `<section id="section-X">`，`<h3>` 需要有对应 `id` 供侧边栏锚点跳转

#### 3. 引用块（`.pull-quote`）
```html
<!-- 普通引用：左侧金色边框 -->
<div class="pull-quote">"引文内容"<cite>— 作者</cite></div>

<!-- 重点引用：居中，上下金色边框 -->
<div class="pull-quote large">核心金句<cite>— 作者</cite></div>
```
**使用场景**：名人名言、核心观点、关键结论

#### 4. 提示卡片（`.callout`）
```html
<div class="callout tip|warn|info">
  <div class="callout-icon">💡|⚠️|📝</div>
  <div class="callout-body">
    <div class="callout-title">标题</div>
    <p>内容</p>
  </div>
</div>
```
- `.tip`（金色左边框）：灵感、正面例证、启发
- `.warn`（橙色左边框）：警示、反面教训、常见错误
- `.info`（蓝色左边框）：补充说明、背景知识、注释

#### 5. 表格（`.article-table`）
```html
<table class="article-table">
  <thead><tr><th>列1</th><th>列2</th></tr></thead>
  <tbody><tr><td>数据</td><td>数据</td></tr></tbody>
</table>
```
**使用场景**：对比、分类列举、多维度信息

#### 6. 要点卡片（`.remedy-grid` + `.remedy-card`）
```html
<div class="remedy-grid">
  <div class="remedy-card">
    <span class="remedy-num">编号标签</span>
    <h4>卡片标题</h4>
    <p>简短说明</p>
  </div>
</div>
```
**使用场景**：核心观点列表、步骤、原则、药方等需要逐条突出的内容。左侧有金色竖条装饰。

#### 7. 诗歌/长引文块（`.poem`）
```html
<div class="poem">
  诗句第一行<br/>
  诗句第二行<br/>
  <span class="poem-author">—— 作者</span>
</div>
```
**使用场景**：诗歌、长段引文需要居中展示时。带装饰性引号。

#### 8. 章节分隔符（`.section-divider`）
```html
<div class="section-divider"><span>◆ ◆ ◆</span></div>
```
**使用场景**：每个 `<section>` 之间使用，提供视觉呼吸感。

#### 9. 文章结尾（`.article-footer`）
```html
<div class="article-footer">— 完 —</div>
```

### 排版原则

1. **避免大段文字**：连续段落不超过 3 段，之后必须插入组件（引用块、卡片、表格等）打断节奏
2. **关键词加粗**：使用 `<strong>` 标记核心概念，渲染为 `var(--gold-dk)` 深金色
3. **层次分明**：h2 → h3 → 正文/组件，不跳级
4. **组件混搭**：同一节内鼓励混合使用 2-3 种组件类型，避免单调
5. **间距统一**：组件间距由 CSS 控制（`margin: 1.25rem 0` 至 `1.5rem 0`），不要手动加 `<br>` 撑间距

### 底部脚本（必须包含）

```javascript
// 侧边栏滚动高亮（激活项切换时自动滚入视野）
const links = document.querySelectorAll('#sidebar-nav a');
const sections = Array.from(links).map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
let lastActive = null;

function onScroll() {
  const scrollY = window.scrollY + 132;
  let current = sections[0];
  for (const sec of sections) {
    if (sec.offsetTop <= scrollY) current = sec;
  }
  links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + current.id));

  const activeLink = document.querySelector('#sidebar-nav a.active');
  if (activeLink && activeLink !== lastActive) {
    lastActive = activeLink;
    activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
window.addEventListener('scroll', onScroll, { passive: true });

// 平滑滚动
links.forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      window.scrollTo({ top: target.offsetTop - 88, behavior: 'smooth' });
    }
  });
});

// 阅读位置记忆（BOOK_FOLDER 必须改为当前书名文件夹）
const BOOK_FOLDER = '穷查理宝典';
const PAGE_KEY = 'reading_last_page_' + BOOK_FOLDER;
const SCROLL_KEY = 'reading_scroll_' + BOOK_FOLDER;
const relativePath = 'books/' + BOOK_FOLDER + '/' + location.pathname.split('/').pop();
localStorage.setItem(PAGE_KEY, relativePath);

const savedScroll = localStorage.getItem(SCROLL_KEY);
if (savedScroll && document.referrer.includes('index.html')) {
  const pos = JSON.parse(savedScroll);
  if (pos.page === relativePath) window.scrollTo(0, pos.y);
}

let scrollTimer = null;
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    localStorage.setItem(SCROLL_KEY, JSON.stringify({ page: relativePath, y: window.scrollY }));
  }, 300);
}, { passive: true });
```

### 内联 CSS 完整清单

每个章节页的 `<style>` 块必须包含以下所有类（直接从参考文件复制，不可省略）：

- 布局：`.chapter-layout`、`.chapter-sidebar`、`.chapter-article`
- 导航：`.sidebar-label`、`.sidebar-label-sub`、`.sidebar-nav`、`.breadcrumb`、`.crumb-sep`
- 目录树：`.book-toc`、`.toc-chapter`、`.toc-chapter-title`、`.current-chapter`、`.toc-lectures`
- 文章头：`.article-header`、`.article-eyebrow`、`.article-title`、`.article-meta`
- 正文排版：`.chapter-article h2`、`.chapter-article h3`、`.chapter-article p`、`.chapter-article strong`、`.chapter-article em`
- 引用：`.pull-quote`、`.pull-quote.large`、`.pull-quote cite`
- 卡片：`.callout`、`.callout-icon`、`.callout-body`、`.callout-title`、`.callout.tip`、`.callout.warn`、`.callout.info`
- 表格：`.article-table`、`thead`、`th`、`td`
- 要点卡片：`.remedy-grid`、`.remedy-card`、`.remedy-num`、`.remedy-card h4`
- 诗歌：`.poem`、`.poem-author`
- 分隔符：`.section-divider`
- 页脚：`.article-footer`
