# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 本地运行

```bash
python server.py   # 启动本地服务，自动打开 http://localhost:8000
```

`server.py` 仅使用 Python 3 标准库（`http.server`、`socketserver`），无需安装依赖。启动后自动打开浏览器。它提供静态文件服务并暴露四个 API 端点：
- `GET /api/books` — 从 `data/books.json` 读取全量书籍数据
- `POST /api/save-books` — 将全量数据写入 `data/books.json`（前端每次增删改后自动调用）
- `POST /api/create-book-folder` — 新增书籍时在磁盘创建 `books/<书名>/index.html`（使用内置 `BOOK_TEMPLATE`）
- `POST /api/delete-book-folder` — 删除书籍时调用 `shutil.rmtree()` 删除 `books/<书名>/` 整个文件夹

设置 `SERVER_LOG=1` 环境变量可将输出重定向到 `server.log`（后台静默运行模式）。日志中只打印 `/api/` 路径的请求，静态文件请求不记录。

### 目录结构

```
├── index.html              # 主书架页
├── server.py               # 本地开发服务器
├── CLAUDE.md
├── assets/
│   ├── data.js             # 数据持久化层（必须最先加载）
│   ├── app.js              # 主书架 UI 逻辑
│   ├── book.js             # 遗留死代码，未被引用
│   └── style.css           # 共享样式 + CSS 自定义属性
├── data/
│   └── books.json          # 服务端持久化数据（权威数据源）
├── img/                    # 封面图片（jpg/png），通过相对路径引用
├── books/                  # 每本书一个子文件夹，含独立 HTML 章节页
│   └── <书名>/
│       ├── index.html      # meta-refresh 跳转到默认章节
│       └── *.html          # 各章节阅读页
└── memory/                 # Claude Code 持久记忆（勿手动编辑）
```

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
- 自包含 HTML，内联 `<style>` 块，通过引入 `assets/style.css` 复用基础 CSS 变量。相对路径取决于 HTML 文件的嵌套层级：
  - `books/<书名>/章节.html`（平铺）：`../../assets/style.css`
  - `books/<书名>/<章号>/章节.html`（子目录）：`../../../assets/style.css`
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

- **双层持久化**：数据同时写入 `data/books.json`（服务端，权威源）和 `localStorage`（离线缓存）。`initDB()` 优先从服务端加载，`persistDB()` 同时写入两处。服务端不可用时自动回退到 localStorage，并在恢复连接后尝试上传本地数据。
- **封面图片**：书籍数据中的 `cover` 字段存储相对路径（如 `img/穷查理宝典.jpg`）或 base64 data URL（用户上传的自定义图片经前端压缩至 400px 宽后内嵌）。封面图片文件存放在 `img/` 目录，`migrateCoverImages()` 在页面加载时自动将已知书名映射到对应封面路径。
- **书籍文件夹创建回退**：`createBookFolder()` 首先尝试通过 `POST /api/create-book-folder` 让服务端创建，失败时降级为客户端 `downloadBookTemplate()` 生成 HTML 文件供用户手动放置。`deleteBookFolder()` 同理调用 `/api/delete-book-folder`，失败时静默忽略。
- **书籍文件夹命名**：`server.py` 中的 `safe_dirname()` 和 `app.js` 中的 `.replace(/[\\/:*?"<>|]/g, '_')` 必须保持同步——两者剔除相同的非法文件名字符。
- **种子数据**：`seedIfEmpty()` 每次页面加载都会执行，但受 `db.seeded` 布尔值（持久化在 `localStorage` 中）控制。它仅在首次加载时插入示例书籍，之后即使用户删除所有书也不会再次插入。
- **章节页 BOOK_FOLDER 常量**：每个章节 HTML 底部有 `const BOOK_FOLDER = '书名'`，必须与磁盘上的文件夹名一致，用于驱动阅读位置的 localStorage 键。
- **侧边栏目录树**：章节页使用层级导航（全书章节 → 各讲 → 小节锚点）。**目录结构按章实际讲数自适应**——单讲章节用扁平链接（`.toc-chapter-title` 直接写成 `<a>`，无 `.toc-lectures` 子列表、不渲染折叠脚本），避免单讲时出现"伪下拉"的冗余套娃；只有一章有 2 讲及以上时才启用嵌套结构（`.toc-chapter` 包裹 `.toc-lectures` 子列表 + 折叠展开脚本）。新增一讲时，需在同一书籍所有兄弟 HTML 文件中按此规则更新对应章节的 TOC 条目以保持跨页同步。
- **设计令牌**：金色调色板（`--gold: #a07828`、`--gold-lt: #c9a84c`、`--gold-dk: #7a5a10`），奶油色背景（`--bg: #f5f2ec`），Georgia/Noto Serif SC 字体栈。章节页通过引入共享样式表复用这些变量。

## 数据结构

```js
// 书籍
{ id, name, author, category, color, emoji, cover, desc, status, createdAt, chapters: [...] }
// cover: 相对路径（如 'img/穷查理宝典.jpg'）或 base64 data URL（用户上传的压缩图片），可为 undefined
// 章节
{ id, title, order, content, createdAt, updatedAt }
// 数据库根对象
{ books, nextBookId, nextChapterId, seeded }
// status 可选值: '想读' | '在读' | '已读'（新建书籍默认为 '在读'，见 seedIfEmpty 示例）
// category 可选值: '投资经典' | '思维方式' | '传记' | '商业' | '其他'
```
