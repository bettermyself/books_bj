"""
本地开发服务器 - 投资智慧·读书感悟
启动方式: python server.py
访问地址: http://localhost:8000
"""

import http.server
import json
import os
import re
import shutil
import socketserver
import urllib.parse
import webbrowser
from pathlib import Path

PORT = 8000
BASE_DIR = Path(__file__).parent
DATA_FILE = BASE_DIR / 'data' / 'books.json'


BOOK_TEMPLATE = """\
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{name}{author_title}</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --gold: #a07828; --gold-lt: #c9a84c;
      --bg: #f5f2ec; --bg2: #ffffff; --bg3: #faf8f4;
      --border: #e0d8cc; --text: #2c2416; --text2: #6b5e4a; --text3: #a89880;
    }}
    body {{ font-family: 'Georgia', 'Noto Serif SC', serif; background: var(--bg); color: var(--text); line-height: 1.8; }}
    header {{ background: rgba(245,242,236,.95); border-bottom: 1px solid var(--border); padding: .75rem 2rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; }}
    header .brand {{ font-weight: 700; color: var(--gold); font-size: 1rem; }}
    header a {{ color: var(--gold); text-decoration: none; font-size: .9rem; font-weight: 700; border: 1px solid rgba(201,168,76,.35); padding: .3rem .75rem; border-radius: 6px; }}
    header a:hover {{ background: rgba(201,168,76,.1); }}
    .cover-banner {{ background: {color}; display: flex; align-items: center; gap: 1.5rem; padding: 3rem 2rem; }}
    .cover-emoji {{ font-size: 4rem; }}
    .cover-info h1 {{ font-size: clamp(1.6rem,4vw,2.4rem); color: #fff; margin-bottom: .4rem; }}
    .cover-info .author {{ color: rgba(255,255,255,.65); font-size: 1rem; }}
    .cover-info .desc {{ color: rgba(255,255,255,.5); font-size: .9rem; margin-top: .5rem; max-width: 600px; }}
    main {{ max-width: 860px; margin: 0 auto; padding: 3rem 2rem 6rem; }}
    h2 {{ font-size: 1.5rem; color: var(--gold); border-bottom: 1px solid var(--border); padding-bottom: .5rem; margin: 2.5rem 0 1rem; }}
    h3 {{ font-size: 1.1rem; color: var(--text); margin: 1.8rem 0 .5rem; }}
    p {{ color: var(--text2); margin-bottom: 1rem; }}
    blockquote {{ border-left: 3px solid var(--gold); padding: .5rem 1rem; margin: 1rem 0; color: var(--text2); font-style: italic; background: var(--bg3); border-radius: 0 8px 8px 0; }}
    ul {{ padding-left: 1.4rem; color: var(--text2); margin-bottom: 1rem; }}
    li {{ margin-bottom: .3rem; }}
    hr {{ border: none; border-top: 1px solid var(--border); margin: 2rem 0; }}
    footer {{ text-align: center; padding: 2rem; border-top: 1px solid var(--border); color: var(--text3); font-size: .8rem; }}
  </style>
</head>
<body>
  <header>
    <span class="brand">◈ 投资智慧</span>
    <a href="../../index.html">⌂ 首页</a>
  </header>
  <div class="cover-banner">
    <div class="cover-emoji">{emoji}</div>
    <div class="cover-info">
      <h1>{name}</h1>
      {author_html}
      {desc_html}
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
  <footer>《{name}》阅读笔记 · 投资智慧·读书感悟</footer>
</body>
</html>
"""


def safe_dirname(name: str) -> str:
    """将书名转换为安全的文件夹名（去除 Windows/Linux 非法字符）"""
    return re.sub(r'[\\/:*?"<>|]', '_', name).strip()


def load_data():
    """从磁盘读取书籍数据，不存在则返回初始结构"""
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    return {'books': [], 'nextBookId': 1, 'nextChapterId': 1, 'seeded': False}


def save_data(db):
    """将书籍数据写入磁盘"""
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding='utf-8')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        if self.path == '/api/books':
            self._handle_get_books()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/create-book-folder':
            self._handle_create_book_folder()
        elif self.path == '/api/delete-book-folder':
            self._handle_delete_book_folder()
        elif self.path == '/api/save-books':
            self._handle_save_books()
        else:
            self.send_error(404)

    def _handle_create_book_folder(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            book = json.loads(body.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {'ok': False, 'error': 'invalid JSON'})
            return

        name = (book.get('name') or '').strip()
        if not name:
            self._json(400, {'ok': False, 'error': '书名不能为空'})
            return

        folder_name = safe_dirname(name)
        folder_path = BASE_DIR / 'books' / folder_name
        index_path  = folder_path / 'index.html'

        if index_path.exists():
            self._json(200, {'ok': True, 'created': False, 'path': str(index_path)})
            return

        folder_path.mkdir(parents=True, exist_ok=True)

        author = (book.get('author') or '').strip()
        html = BOOK_TEMPLATE.format(
            name=name,
            author_title=f' · {author}' if author else '',
            color=book.get('color') or '#1a2a3a',
            emoji=book.get('emoji') or '📚',
            author_html=f'<div class="author">{author}</div>' if author else '',
            desc_html=f'<div class="desc">{book.get("desc") or ""}</div>' if book.get('desc') else '',
        )
        index_path.write_text(html, encoding='utf-8')

        print(f'[创建] books/{folder_name}/index.html')
        self._json(201, {'ok': True, 'created': True, 'path': f'books/{folder_name}/index.html'})

    def _handle_delete_book_folder(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {'ok': False, 'error': 'invalid JSON'})
            return

        name = (data.get('name') or '').strip()
        if not name:
            self._json(400, {'ok': False, 'error': '书名不能为空'})
            return

        folder_name = safe_dirname(name)
        folder_path = BASE_DIR / 'books' / folder_name

        try:
            if folder_path.is_dir():
                shutil.rmtree(folder_path)
                print(f'[删除] books/{folder_name}/')
                self._json(200, {'ok': True, 'deleted': True})
            else:
                self._json(200, {'ok': True, 'deleted': False})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _handle_get_books(self):
        db = load_data()
        self._json(200, db)

    def _handle_save_books(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            db = json.loads(body.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {'ok': False, 'error': 'invalid JSON'})
            return
        if not isinstance(db, dict) or 'books' not in db:
            self._json(400, {'ok': False, 'error': 'invalid data structure'})
            return
        try:
            save_data(db)
            self._json(200, {'ok': True})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # 只打印 API 请求日志
        msg = args[0] if args else ''
        if isinstance(msg, str) and '/api/' in msg:
            print(f'[API] {msg} -> {args[1] if len(args) > 1 else ""}')


def main():
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        httpd.allow_reuse_address = True
        url = f'http://localhost:{PORT}'
        print(f'服务已启动: {url}')
        print('按 Ctrl+C 停止服务\n')
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n服务已停止')


if __name__ == '__main__':
    main()
