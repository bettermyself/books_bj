// ===== 书籍详情页逻辑 =====

let currentBookId = null;
let editingChapterId = null;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();

  const params = new URLSearchParams(location.search);
  currentBookId = parseInt(params.get('id'));
  if (!currentBookId) { location.href = 'index.html'; return; }

  const book = getBook(currentBookId);
  if (!book) { location.href = 'index.html'; return; }

  renderBookHero(book);
  renderChapters();
  buildColorPicker();
  checkReadingPage(book);
});

// ===== 渲染书籍 Hero =====
function renderBookHero(book) {
  document.title = `${book.name} · 投资智慧`;
  document.getElementById('detail-cover').style.background = book.color || '#1a2a3a';
  document.getElementById('detail-emoji').textContent = book.emoji || '📚';
  document.getElementById('detail-title').textContent = book.name;
  document.getElementById('detail-author').textContent = book.author || '未知作者';
  document.getElementById('detail-desc').textContent = book.desc || '';

  const tags = document.getElementById('detail-tags');
  tags.innerHTML = `
    <span class="book-category">${esc(book.category || '其他')}</span>
    <span class="book-status status-${book.status || '想读'}">${book.status || '想读'}</span>
  `;
}

// ===== 渲染章节列表 =====
function renderChapters() {
  const book = getBook(currentBookId);
  if (!book) return;

  const list = document.getElementById('chapter-list');
  const empty = document.getElementById('chapter-empty');
  const countEl = document.getElementById('chapter-count');

  const chapters = [...book.chapters].sort((a, b) => (a.order || 0) - (b.order || 0));

  countEl.textContent = `共 ${chapters.length} 章节`;

  if (chapters.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = chapters.map(ch => {
    const preview = (ch.content || '').replace(/\n/g, ' ').slice(0, 60);
    return `
    <div class="chapter-item" id="ch-${ch.id}">
      <div class="chapter-header" onclick="toggleChapter(${ch.id})">
        <div class="chapter-num">${ch.order || '—'}</div>
        <div style="flex:1;min-width:0">
          <div class="chapter-title-text">${esc(ch.title)}</div>
          ${preview ? `<div class="chapter-preview">${esc(preview)}…</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <button class="action-btn action-edit" onclick="event.stopPropagation();showEditChapter(${ch.id})" title="编辑">✎</button>
          <button class="action-btn action-del" onclick="event.stopPropagation();askDeleteChapter(${ch.id})" title="删除">✕</button>
          <span class="chapter-toggle">▼</span>
        </div>
      </div>
      <div class="chapter-body">
        <div class="chapter-content">${renderContent(ch.content || '')}</div>
      </div>
    </div>`;
  }).join('');
}

// ===== 展开/折叠章节 =====
function toggleChapter(id) {
  const el = document.getElementById(`ch-${id}`);
  if (el) el.classList.toggle('open');
}

// ===== 内容渲染（简单 Markdown 转 HTML）=====
function renderContent(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<strong style="font-size:1rem;color:var(--text);display:block;margin:.8rem 0 .3rem">$1</strong>')
    .replace(/^### (.+)$/gm, '<strong style="color:var(--gold);display:block;margin:.6rem 0 .2rem">$1</strong>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--gold);padding:.3rem .8rem;margin:.4rem 0;color:var(--text2);font-style:italic">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li style="margin:.2rem 0 .2rem 1.2rem">$1</li>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:.8rem 0">')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// ===== 新增章节 =====
function showAddChapter() {
  editingChapterId = null;
  const book = getBook(currentBookId);
  const nextOrder = book ? book.chapters.length + 1 : 1;
  document.getElementById('modal-chapter-title').textContent = '新增章节笔记';
  document.getElementById('chapter-title-input').value = '';
  document.getElementById('chapter-order-input').value = nextOrder;
  document.getElementById('chapter-content-input').value = '';
  document.getElementById('modal-chapter').style.display = 'flex';
  setTimeout(() => document.getElementById('chapter-title-input').focus(), 100);
}

// ===== 编辑章节 =====
function showEditChapter(id) {
  const book = getBook(currentBookId);
  const ch = book?.chapters.find(c => c.id === id);
  if (!ch) return;
  editingChapterId = id;
  document.getElementById('modal-chapter-title').textContent = '编辑章节笔记';
  document.getElementById('chapter-title-input').value = ch.title;
  document.getElementById('chapter-order-input').value = ch.order || '';
  document.getElementById('chapter-content-input').value = ch.content || '';
  document.getElementById('modal-chapter').style.display = 'flex';
}

// ===== 保存章节 =====
function saveChapter() {
  const title = document.getElementById('chapter-title-input').value.trim();
  if (!title) { document.getElementById('chapter-title-input').focus(); return; }
  const order = parseInt(document.getElementById('chapter-order-input').value) || 1;
  const content = document.getElementById('chapter-content-input').value;

  if (editingChapterId) {
    updateChapter(currentBookId, editingChapterId, { title, order, content });
  } else {
    addChapter(currentBookId, { title, order, content });
  }
  closeModalDirect('modal-chapter');
  renderChapters();
  updateStats();
}

// ===== 删除章节 =====
function askDeleteChapter(chapterId) {
  pendingDeleteId = chapterId;
  pendingDeleteType = 'chapter';
  pendingDeleteExtra = currentBookId;
  const book = getBook(currentBookId);
  const ch = book?.chapters.find(c => c.id === chapterId);
  document.getElementById('confirm-msg').textContent =
    `确定删除章节「${ch?.title || ''}」的所有笔记？此操作不可撤销。`;
  document.getElementById('modal-confirm').style.display = 'flex';
}

// ===== 编辑当前书籍 =====
function showEditCurrentBook() {
  const b = getBook(currentBookId);
  if (!b) return;
  editingBookId = currentBookId;
  selectedColor = b.color || COVER_COLORS[0].bg;
  document.getElementById('modal-book-title').textContent = '编辑书籍';
  document.getElementById('book-name').value = b.name;
  document.getElementById('book-author').value = b.author || '';
  document.getElementById('book-category').value = b.category || '投资经典';
  document.getElementById('book-desc').value = b.desc || '';
  document.getElementById('book-status').value = b.status || '想读';
  buildColorPicker();
  document.getElementById('modal-book').style.display = 'flex';
}

function saveBookFromDetail() {
  const name = document.getElementById('book-name').value.trim();
  if (!name) { document.getElementById('book-name').focus(); return; }
  updateBook(currentBookId, {
    name,
    author: document.getElementById('book-author').value.trim(),
    category: document.getElementById('book-category').value,
    color: selectedColor,
    desc: document.getElementById('book-desc').value.trim(),
    status: document.getElementById('book-status').value,
  });
  closeModalDirect('modal-book');
  renderBookHero(getBook(currentBookId));
}

// ===== Markdown 工具栏插入 =====
function insertMd(before, after) {
  const ta = document.getElementById('chapter-content-input');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.slice(start, end);
  const replacement = before + selected + after;
  ta.value = ta.value.slice(0, start) + replacement + ta.value.slice(end);
  ta.focus();
  ta.selectionStart = start + before.length;
  ta.selectionEnd = start + before.length + selected.length;
}

// ===== confirmDelete 覆盖（章节删除后刷新当前页）=====
// app.js 中的 confirmDelete 已处理 chapter 类型，此处无需重写

// ===== 阅读页检测与跳转 =====
function checkReadingPage(book) {
  const byFolder = `books/${book.name}/index.html`;
  const byFile   = `books/${book.name}.html`;
  const btn = document.getElementById('btn-reading-page');
  if (!btn) return;

  fetch(byFolder, { method: 'HEAD' })
    .then(r => { if (r.ok) { btn._readingPath = byFolder; btn.style.display = ''; } })
    .catch(() => {});
  fetch(byFile, { method: 'HEAD' })
    .then(r => { if (r.ok) { btn._readingPath = btn._readingPath || byFile; btn.style.display = ''; } })
    .catch(() => {});
}

function openReadingPage() {
  const book = getBook(currentBookId);
  if (!book) return;
  const btn = document.getElementById('btn-reading-page');
  const path = btn?._readingPath || `books/${book.name}/index.html`;
  window.open(path, '_blank');
}
