// ===== 服务端数据持久化 =====

const DB_KEY = 'reading_notes_v1'; // localStorage 离线缓存键名

async function initDB() {
  // 1. 尝试从服务端加载
  try {
    const res = await fetch('/api/books');
    if (res.ok) {
      const db = await res.json();
      if (db.books && Array.isArray(db.books)) {
        window._db = db;
        // 同步缓存到 localStorage
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return;
      }
    }
  } catch(e) {
    console.warn('服务端加载失败，使用本地缓存:', e.message);
  }

  // 2. 服务端不可用时回退到 localStorage
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      window._db = JSON.parse(raw);
      // 尝试把本地数据上传到服务端（首次迁移）
      _persistToServer();
      return;
    }
  } catch(e) {}

  // 3. 都没有数据，初始化空结构
  window._db = { books: [], nextBookId: 1, nextChapterId: 1, seeded: false };
}

function getDB() {
  return window._db;
}

function persistDB() {
  const db = window._db;
  // 即时写入 localStorage（离线缓存）
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch(e) {}
  // 异步写入服务端
  _persistToServer();
}

function _persistToServer() {
  fetch('/api/save-books', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(window._db),
  }).catch(() => {});
}

// ===== Book CRUD =====
function addBook(book) {
  const db = getDB();
  book.id = db.nextBookId++;
  book.createdAt = Date.now();
  book.chapters = [];
  db.books.push(book);
  persistDB();
  return book;
}

function updateBook(id, fields) {
  const db = getDB();
  const b = db.books.find(b => b.id === id);
  if (b) Object.assign(b, fields);
  persistDB();
}

function deleteBook(id) {
  const db = getDB();
  db.books = db.books.filter(b => b.id !== id);
  persistDB();
}

function getBook(id) {
  return getDB().books.find(b => b.id === id);
}

function getAllBooks() {
  return getDB().books;
}

// ===== Chapter CRUD =====
function addChapter(bookId, chapter) {
  const db = getDB();
  const book = db.books.find(b => b.id === bookId);
  if (!book) return null;
  chapter.id = db.nextChapterId++;
  chapter.createdAt = Date.now();
  chapter.updatedAt = Date.now();
  book.chapters.push(chapter);
  persistDB();
  return chapter;
}

function updateChapter(bookId, chapterId, fields) {
  const db = getDB();
  const book = db.books.find(b => b.id === bookId);
  if (!book) return;
  const ch = book.chapters.find(c => c.id === chapterId);
  if (ch) { Object.assign(ch, fields); ch.updatedAt = Date.now(); }
  persistDB();
}

function deleteChapter(bookId, chapterId) {
  const db = getDB();
  const book = db.books.find(b => b.id === bookId);
  if (!book) return;
  book.chapters = book.chapters.filter(c => c.id !== chapterId);
  persistDB();
}

// ===== 统计 =====
function getStats() {
  const books = getAllBooks();
  const chapters = books.reduce((s, b) => s + b.chapters.length, 0);
  const words = books.reduce((s, b) =>
    s + b.chapters.reduce((cs, c) => cs + (c.content || '').length, 0), 0);
  return { books: books.length, chapters, words };
}

// ===== 预置示例数据（首次加载）=====
function seedIfEmpty() {
  const db = getDB();
  if (db.seeded) return;
  db.seeded = true;

  const sampleBook = {
    name: '穷查理宝典',
    author: '查理·芒格',
    category: '投资经典',
    color: '#1a3a2a',
    emoji: '📗',
    desc: '芒格的思想精华，涵盖多元思维模型、人类误判心理学等核心理念。',
    status: '在读',
  };
  const b = addBook(sampleBook);

  addChapter(b.id, {
    title: '在哈佛学校毕业典礼上的演讲',
    order: 1,
  });
}
