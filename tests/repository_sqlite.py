"""SQLite bridge for repository integration tests; only operates on a test-created temporary file."""
import json
import sqlite3
import sys
from pathlib import Path

request = json.load(sys.stdin)
db = sqlite3.connect(sys.argv[1])
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
if request['operation'] == 'initialize':
    for migration in sorted((Path(__file__).resolve().parents[1] / 'src-tauri' / 'migrations').glob('*.sql')):
        db.executescript(migration.read_text())
    result = None
else:
    values = {str(index + 1): value for index, value in enumerate(request.get('params', []))}
    cursor = db.execute(request['sql'], values)
    result = [dict(row) for row in cursor] if request['operation'] == 'select' else {'rowsAffected': cursor.rowcount, 'lastInsertId': cursor.lastrowid}
    db.commit()
print(json.dumps(result))
db.close()
