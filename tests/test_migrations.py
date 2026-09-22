"""Offline integration tests against the real migration SQL and DESIGN.md contract."""
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / 'src-tauri' / 'migrations' / '0001_initial.sql').read_text()


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys = ON')
        self.db.executescript(SQL)
        self.db.execute("INSERT INTO papers(id,title,file_path,file_size,total_pages) VALUES ('p','Paper','/local/p.pdf',1024,10)")

    def tearDown(self):
        self.db.close()

    def test_schema_matches_design(self):
        design_sql = re.search(r'```sql\n(.*?)```', (ROOT / 'DESIGN.md').read_text(), re.S).group(1)
        expected = sqlite3.connect(':memory:')
        try:
            expected.executescript(design_sql)
            query = "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
            self.assertEqual(self.db.execute(query).fetchall(), expected.execute(query).fetchall())
        finally:
            expected.close()

    def test_tables_indexes_and_repeated_initialization(self):
        self.db.executescript(SQL)
        tables = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(tables, {'papers', 'annotations', 'notes', 'tags', 'paper_tags', 'app_settings', 'parse_cache'})
        self.assertEqual(self.db.execute('SELECT count(*) FROM papers').fetchone()[0], 1)
        indexes = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        self.assertTrue({'idx_annotations_paper_page', 'idx_notes_paper', 'idx_papers_last_read'} <= indexes)
        plan = self.db.execute("EXPLAIN QUERY PLAN SELECT * FROM annotations WHERE paper_id='p' AND page_number=1").fetchall()
        self.assertIn('idx_annotations_paper_page', str(plan))

    def add_annotation_and_note(self):
        self.db.execute("INSERT INTO annotations(id,paper_id,page_number,type,color,rects_json) VALUES ('a','p',1,'highlight','#FFE066','[]')")
        self.db.execute("INSERT INTO notes(id,paper_id,annotation_id,content_markdown) VALUES ('n','p','a','A thought')")

    def test_annotation_deletion_preserves_note(self):
        self.add_annotation_and_note()
        self.db.execute("DELETE FROM annotations WHERE id='a'")
        self.assertEqual(self.db.execute('SELECT annotation_id,content_markdown FROM notes').fetchone(), (None, 'A thought'))

    def test_paper_deletion_cascades(self):
        self.add_annotation_and_note()
        self.db.execute("INSERT INTO tags(id,name) VALUES ('t','reading')")
        self.db.execute("INSERT INTO paper_tags VALUES ('p','t')")
        self.db.execute("INSERT INTO parse_cache(paper_id,parser_engine,parsed_markdown) VALUES ('p','fast_local','text')")
        self.db.execute("DELETE FROM papers WHERE id='p'")
        for table in ['annotations', 'notes', 'paper_tags', 'parse_cache']:
            self.assertEqual(self.db.execute(f'SELECT count(*) FROM {table}').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM tags').fetchone()[0], 1)

    def test_foreign_keys_and_unique_tags(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO notes(id,paper_id,content_markdown) VALUES ('n','missing','text')")
        self.db.execute("INSERT INTO tags(id,name) VALUES ('t','reading')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO tags(id,name) VALUES ('t2','reading')")
        self.db.execute("INSERT INTO paper_tags VALUES ('p','t')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO paper_tags VALUES ('p','t')")
        self.db.execute("DELETE FROM tags WHERE id='t'")
        self.assertEqual(self.db.execute('SELECT count(*) FROM paper_tags').fetchone()[0], 0)

    def test_defaults(self):
        self.assertEqual(self.db.execute('SELECT last_read_page FROM papers').fetchone()[0], 1)
        self.assertIsNotNone(self.db.execute('SELECT created_at FROM papers').fetchone()[0])
        self.db.execute("INSERT INTO notes(id,paper_id,content_markdown) VALUES ('n','p','text')")
        self.assertEqual(self.db.execute('SELECT note_type FROM notes').fetchone()[0], 'thought')

    def test_failed_migration_rolls_back(self):
        db = sqlite3.connect(':memory:')
        try:
            with self.assertRaises(sqlite3.OperationalError):
                db.executescript('BEGIN;\n' + SQL + '\nINVALID SQL;\nCOMMIT;')
            db.rollback()
            self.assertEqual(db.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0], 0)
        finally:
            db.close()


if __name__ == '__main__':
    unittest.main()
