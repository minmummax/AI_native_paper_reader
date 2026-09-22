"""Execute production-generated search SQL against actual migrated SQLite, isolated from user data."""
import json
import sqlite3
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
for migration in sorted((root / 'src-tauri' / 'migrations').glob('*.sql')):
    db.executescript(migration.read_text())
rows = [
    ('p1','Diffusion Methods','original_zhang.pdf','Ada; 张三',2024,'image synthesis'),
    ('p2','100%_real result','budget.pdf','Ben',2023,'statistics'),
    ('p3','Other research','attention.pdf','Chen',2025,'attention mechanism'),
]
for id,title,name,authors,year,abstract in rows:
    db.execute('INSERT INTO papers(id,title,source_name,authors,year,abstract,file_path,file_size,total_pages) VALUES (?,?,?,?,?,?,?,10,3)',(id,title,name,json.dumps([authors],ensure_ascii=False),year,abstract,'managed.pdf'))
db.execute("INSERT INTO tags(id,name) VALUES ('t','视觉')")
db.execute("INSERT INTO paper_tags VALUES ('p1','t')")
db.execute("INSERT INTO collections VALUES ('c','Thesis')")
db.execute("INSERT INTO paper_collections VALUES ('p1','c')")
db.execute("INSERT INTO notes(id,paper_id,content_markdown) VALUES ('n','p1','variance reduction')")
queries = json.load(sys.stdin)
print(json.dumps([[dict(row) for row in db.execute(query['sql'],{str(index+1):value for index,value in enumerate(query['params'])})] for query in queries]))
db.close()
