// ===== 封面图片迁移 =====
function migrateCoverImages() {
  const coverMap = { '穷查理宝典': 'img/穷查理宝典.jpg', '巴菲特致股东的信': 'img/巴菲特致股东的信.png', '巴菲特之道': 'img/巴菲特之道.png' };
  let changed = false;
  getAllBooks().forEach(b => {
    if (coverMap[b.name] && b.cover !== coverMap[b.name]) {
      b.cover = coverMap[b.name];
      changed = true;
    }
  });
  if (changed) persistDB();
}

// ===== 颜色配置 =====
const COVER_COLORS = [
  { bg: '#1a3a2a', label: '墨绿' },
  { bg: '#1a2a3a', label: '深蓝' },
  { bg: '#2a1a3a', label: '深紫' },
  { bg: '#3a1a1a', label: '深红' },
  { bg: '#2a2a1a', label: '深棕' },
  { bg: '#1a3a3a', label: '深青' },
  { bg: '#3a2a1a', label: '琥珀' },
  { bg: '#1e2a1a', label: '松绿' },
  { bg: '#2d1f0e', label: '皮革' },
  { bg: '#0e1f2d', label: '午夜' },
  { bg: '#1f0e2d', label: '茄紫' },
  { bg: '#2d0e1f', label: '酒红' },
];

const COVER_EMOJIS = ['📚','📖','📗','📘','📙','📕','🔖','💡','🧠','💰','📊','🌟'];

const QUOTES = [
  { text: '"反过来想，总是反过来想。"', author: '查理·芒格' },
  { text: '"在生活中，可靠是至关重要的。"', author: '查理·芒格' },
  { text: '"价格是你付出的，价值是你得到的。"', author: '沃伦·巴菲特' },
  { text: '"如果说我比其他人看得更远，那是因为我站在巨人的肩膀上。"', author: '艾萨克·牛顿' },
  { text: '"在生命没有结束之前，没有人的一生能够被称为是幸福的。"', author: '梭伦' },
  { text: '"好奇、专注、毅力和自省。"', author: '阿尔伯特·爱因斯坦' },
];

// ===== 状态 =====
let editingBookId = null;
let selectedColor = COVER_COLORS[0].bg;
let selectedEmoji = COVER_EMOJIS[0];
let pendingDeleteId = null;
let pendingDeleteType = null; // 'book' | 'chapter'
let pendingDeleteExtra = null;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  seedIfEmpty();
  migrateCoverImages();
  renderBooks();
  updateStats();
  startQuoteRotator();
  buildColorPicker();
});

// ===== 名言轮播 =====
function startQuoteRotator() {
  const el = document.getElementById('quote-rotator');
  if (!el) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % QUOTES.length;
    el.style.opacity = '0';
    setTimeout(() => {
      el.querySelector('.quote-text').textContent = `"${QUOTES[i].text.replace(/"/g,'')}"`;
      el.querySelector('.quote-author').textContent = `— ${QUOTES[i].author}`;
      el.style.opacity = '1';
    }, 400);
  }, 5000);
  el.style.transition = 'opacity .4s';
}

// ===== 统计 =====
function updateStats() {
  const s = getStats();
  const eb = document.getElementById('stat-books');
  if (eb) eb.textContent = s.books;
}

// ===== 颜色选择器 =====
function buildColorPicker() {
  const el = document.getElementById('color-picker');
  if (!el) return;
  el.innerHTML = '';
  COVER_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c.bg === selectedColor ? ' selected' : '');
    sw.style.background = c.bg;
    sw.title = c.label;
    sw.onclick = () => {
      selectedColor = c.bg;
      el.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    };
    el.appendChild(sw);
  });
}

// ===== 渲染书架 =====
function renderBooks() {
  const grid = document.getElementById('book-grid');
  const empty = document.getElementById('empty-state');
  if (!grid) return;

  const query = (document.getElementById('search-input')?.value || '').toLowerCase();
  const cat = document.getElementById('category-filter')?.value || '';

  let books = getAllBooks().filter(b => {
    const matchQ = !query || b.name.toLowerCase().includes(query) || (b.author||'').toLowerCase().includes(query);
    const matchC = !cat || b.category === cat;
    return matchQ && matchC;
  });

  if (books.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = books.map((b, idx) => `
    <div class="book-card" style="animation-delay:${idx*0.05}s" onclick="openBook(${b.id})">
      <div class="book-cover" ${b.cover ? '' : `style="background:${b.color||'#1a2a3a'}"`}>
        ${b.cover ? `<img src="${b.cover}" alt="${esc(b.name)}" class="book-cover-img" />` : `<div class="book-spine"></div><span>${b.emoji||'📚'}</span>`}
      </div>
      <div class="book-card-actions" onclick="event.stopPropagation()">
        <button class="action-btn action-edit" onclick="showEditBook(${b.id})" title="编辑">✎</button>
        <button class="action-btn action-del" onclick="askDeleteBook(${b.id})" title="删除">✕</button>
      </div>
    </div>
  `).join('');
}

// ===== 打开书籍详情 =====
function openBook(id) {
  const b = getBook(id);
  if (!b) return;
  const folderName = b.name.replace(/[\\/:*?"<>|]/g, '_').trim();

  // 有上次阅读位置，先验证路径是否有效
  const lastPage = localStorage.getItem('reading_last_page_' + folderName);
  if (lastPage) {
    fetch(lastPage, { method: 'HEAD' })
      .then(r => {
        if (r.ok) {
          window.location.href = lastPage;
        } else {
          localStorage.removeItem('reading_last_page_' + folderName);
          localStorage.removeItem('reading_scroll_' + folderName);
          window.location.href = `books/${folderName}/index.html`;
        }
      })
      .catch(() => {
        localStorage.removeItem('reading_last_page_' + folderName);
        localStorage.removeItem('reading_scroll_' + folderName);
        window.location.href = `books/${folderName}/index.html`;
      });
    return;
  }

  // 没有记录，尝试 index.html，失败则进入文件夹第一个可用页面
  const indexPath = `books/${folderName}/index.html`;
  fetch(indexPath, { method: 'HEAD' })
    .then(r => {
      if (r.ok) {
        window.location.href = indexPath;
      } else {
        // index.html 不存在，直接进入文件夹（浏览器会列出文件）
        window.location.href = `books/${folderName}/`;
      }
    })
    .catch(() => {
      window.location.href = `books/${folderName}/`;
    });
}

// ===== 新增书籍弹窗 =====
function showAddBook() {
  editingBookId = null;
  selectedColor = COVER_COLORS[0].bg;
  selectedEmoji = COVER_EMOJIS[0];
  document.getElementById('modal-book-title').textContent = '新增书籍';
  document.getElementById('book-name').value = '';
  document.getElementById('book-author').value = '';
  document.getElementById('book-category').value = '投资经典';
  document.getElementById('book-desc').value = '';
  document.getElementById('book-status').value = '想读';
  buildColorPicker();
  document.getElementById('modal-book').style.display = 'flex';
  setTimeout(() => document.getElementById('book-name').focus(), 100);
}

function showEditBook(id) {
  const b = getBook(id);
  if (!b) return;
  editingBookId = id;
  selectedColor = b.color || COVER_COLORS[0].bg;
  selectedEmoji = b.emoji || COVER_EMOJIS[0];
  document.getElementById('modal-book-title').textContent = '编辑书籍';
  document.getElementById('book-name').value = b.name;
  document.getElementById('book-author').value = b.author || '';
  document.getElementById('book-category').value = b.category || '投资经典';
  document.getElementById('book-desc').value = b.desc || '';
  document.getElementById('book-status').value = b.status || '想读';
  buildColorPicker();
  document.getElementById('modal-book').style.display = 'flex';
}

function saveBook() {
  const name = document.getElementById('book-name').value.trim();
  if (!name) { document.getElementById('book-name').focus(); return; }
  const fields = {
    name,
    author: document.getElementById('book-author').value.trim(),
    category: document.getElementById('book-category').value,
    color: selectedColor,
    emoji: selectedEmoji,
    desc: document.getElementById('book-desc').value.trim(),
    status: document.getElementById('book-status').value,
  };
  if (editingBookId) {
    updateBook(editingBookId, fields);
  } else {
    addBook(fields);
    createBookFolder(fields);
  }
  closeModalDirect('modal-book');
  renderBooks();
  updateStats();
}

// ===== 删除书籍 =====
function askDeleteBook(id) {
  pendingDeleteId = id;
  pendingDeleteType = 'book';
  const b = getBook(id);
  document.getElementById('confirm-msg').textContent =
    `确定删除《${b.name}》及其所有 ${b.chapters.length} 条章节笔记？此操作不可撤销。`;
  document.getElementById('modal-confirm').style.display = 'flex';
}

function confirmDelete() {
  if (pendingDeleteType === 'book') {
    const b = getBook(pendingDeleteId);
    deleteBook(pendingDeleteId);
    renderBooks();
    updateStats();
    if (b) deleteBookFolder(b.name);
  } else if (pendingDeleteType === 'chapter') {
    deleteChapter(pendingDeleteExtra, pendingDeleteId);
    if (typeof renderChapters === 'function') renderChapters();
    updateStats();
  }
  closeModalDirect('modal-confirm');
}

// ===== Modal 工具 =====
function closeModal(id, e) {
  if (e.target.id === id) closeModalDirect(id);
}
function closeModalDirect(id) {
  document.getElementById(id).style.display = 'none';
}

// ===== 工具 =====
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== 新建书籍时下载模板 HTML =====
function downloadBookTemplate(book) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${book.name}${book.author ? ' · ' + book.author : ''}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --gold: #a07828; --gold-lt: #c9a84c;
      --bg: #f5f2ec; --bg2: #ffffff; --bg3: #faf8f4;
      --border: #e0d8cc; --text: #2c2416; --text2: #6b5e4a; --text3: #a89880;
    }
    body { font-family: 'Georgia', 'Noto Serif SC', serif; background: var(--bg); color: var(--text); line-height: 1.8; }
    header { background: rgba(245,242,236,.95); border-bottom: 1px solid var(--border); padding: .75rem 2rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; }
    header a { color: var(--gold); text-decoration: none; font-size: .9rem; font-weight: 700; border: 1px solid rgba(201,168,76,.35); padding: .3rem .75rem; border-radius: 6px; }
    header a:hover { background: rgba(201,168,76,.1); }
    .cover-banner { background: ${book.color || '#1a2a3a'}; display: flex; align-items: center; gap: 1.5rem; padding: 3rem 2rem; }
    .cover-emoji { font-size: 4rem; }
    .cover-info h1 { font-size: clamp(1.6rem,4vw,2.4rem); color: #fff; margin-bottom: .4rem; }
    .cover-info .author { color: rgba(255,255,255,.65); font-size: 1rem; }
    .cover-info .desc { color: rgba(255,255,255,.5); font-size: .9rem; margin-top: .5rem; max-width: 600px; }
    main { max-width: 860px; margin: 0 auto; padding: 3rem 2rem 6rem; }
    h2 { font-size: 1.5rem; color: var(--gold); border-bottom: 1px solid var(--border); padding-bottom: .5rem; margin: 2.5rem 0 1rem; }
    h3 { font-size: 1.1rem; color: var(--text); margin: 1.8rem 0 .5rem; }
    p { color: var(--text2); margin-bottom: 1rem; }
    blockquote { border-left: 3px solid var(--gold); padding: .5rem 1rem; margin: 1rem 0; color: var(--text2); font-style: italic; background: var(--bg3); border-radius: 0 8px 8px 0; }
    ul { padding-left: 1.4rem; color: var(--text2); margin-bottom: 1rem; }
    li { margin-bottom: .3rem; }
    hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
    footer { text-align: center; padding: 2rem; border-top: 1px solid var(--border); color: var(--text3); font-size: .8rem; }
  </style>
</head>
<body>
  <header>
    <span style="font-weight:700;color:var(--gold);font-size:1rem;">◈ 投资智慧</span>
    <a href="../../index.html">⌂ 首页</a>
  </header>
  <div class="cover-banner">
    <div class="cover-emoji">${book.emoji || '📚'}</div>
    <div class="cover-info">
      <h1>${book.name}</h1>
      ${book.author ? `<div class="author">${book.author}</div>` : ''}
      ${book.desc ? `<div class="desc">${book.desc}</div>` : ''}
    </div>
  </div>
  <main>
    <h2>第一章</h2>
    <p>在此处填写阅读笔记内容……</p>

    <blockquote>在此处填写金句摘录……</blockquote>

    <h3>核心观点</h3>
    <ul>
      <li>观点一</li>
      <li>观点二</li>
    </ul>
  </main>
  <footer>《${book.name}》阅读笔记 · 投资智慧·读书感悟</footer>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${book.name}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== 调用 Python 服务自动创建书籍文件夹 =====
function createBookFolder(book) {
  fetch('/api/create-book-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(book),
  })
    .then(r => r.json())
    .then(data => {
      if (data.ok && data.created) {
        console.log(`已创建: ${data.path}`);
      }
    })
    .catch(() => {
      // 未通过 Python 服务启动时静默降级为下载模板
      downloadBookTemplate(book);
    });
}

// ===== 调用 Python 服务删除书籍文件夹 =====
function deleteBookFolder(name) {
  fetch('/api/delete-book-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.ok && data.deleted) {
        console.log(`已删除: books/${name}/`);
      }
    })
    .catch(() => {});
}
