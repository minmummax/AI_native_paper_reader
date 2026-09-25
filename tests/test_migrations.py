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
            # SQL comments document intent and may evolve independently of released migrations.
            # Preserve the structural comparison while excluding comment/whitespace-only changes.
            def schema(connection):
                return [(kind, name, re.sub(r'\s+', ' ', re.sub(r'--[^\n]*', '', sql)).strip())
                        for kind, name, sql in connection.execute(query).fetchall()]
            self.assertEqual(schema(self.db), schema(expected))
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

class CollectionMigrationTests(unittest.TestCase):
    def test_existing_data_survives_upgrade_and_collections_cascade(self):
        db = sqlite3.connect(':memory:')
        try:
            db.execute('PRAGMA foreign_keys=ON')
            db.executescript(SQL)
            db.execute("INSERT INTO papers(id,title,file_path,file_size,total_pages) VALUES ('p','Existing','local.pdf',10,3)")
            db.execute("INSERT INTO notes(id,paper_id,content_markdown) VALUES ('n','p','existing note')")
            second = (ROOT / 'src-tauri' / 'migrations' / '0002_collections.sql').read_text()
            db.executescript(second)
            db.executescript(second)
            self.assertEqual(db.execute('SELECT content_markdown FROM notes').fetchone()[0], 'existing note')
            db.execute("INSERT INTO collections VALUES ('c','Read later')")
            db.execute("INSERT INTO paper_collections VALUES ('p','c')")
            db.execute("DELETE FROM collections WHERE id='c'")
            self.assertEqual(db.execute('SELECT count(*) FROM paper_collections').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM papers').fetchone()[0], 1)
        finally:
            db.close()


class AiUsageMigrationTests(unittest.TestCase):
    def test_usage_upgrade_preserves_notes_and_rejects_invalid_counters(self):
        db = sqlite3.connect(':memory:')
        try:
            for migration in sorted((ROOT / 'src-tauri' / 'migrations').glob('*.sql')):
                db.executescript(migration.read_text())
                if migration.name.startswith('0001'):
                    db.execute("INSERT INTO papers(id,title,file_path,file_size,total_pages) VALUES ('p','Existing','p.pdf',10,2)")
                    db.execute("INSERT INTO notes(id,paper_id,content_markdown) VALUES ('n','p','keep me')")
            self.assertEqual(db.execute('SELECT content_markdown FROM notes').fetchone()[0], 'keep me')
            columns = {row[1] for row in db.execute('PRAGMA table_info(ai_usage)')}
            self.assertFalse(columns & {'api_key', 'prompt', 'response', 'paper_id', 'content'})
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO ai_usage(request_id,provider,model,status,input_tokens) VALUES ('bad','A','B','succeeded',-1)")
            db.execute("INSERT INTO ai_usage(request_id,provider,model,status) VALUES ('ok','A','B','cancelled')")
            self.assertEqual(db.execute('SELECT input_tokens,output_tokens FROM ai_usage').fetchone(), (None, None))
        finally:
            db.close()


class PaperNameMigrationTests(unittest.TestCase):
    def test_upgrade_preserves_titles_and_annotations_and_retains_original_name_after_rename(self):
        db = sqlite3.connect(':memory:')
        try:
            db.execute('PRAGMA foreign_keys=ON')
            db.executescript(SQL)
            db.execute("INSERT INTO papers(id,title,file_path,file_size,total_pages) VALUES ('p','Legacy title','hash.pdf',10,2)")
            db.execute("INSERT INTO annotations(id,paper_id,page_number,type,color,rects_json) VALUES ('a','p',1,'underline','#FFE066','[]')")
            db.executescript((ROOT / 'src-tauri' / 'migrations' / '0002_collections.sql').read_text())
            db.executescript((ROOT / 'src-tauri' / 'migrations' / '0003_paper_names.sql').read_text())
            self.assertEqual(db.execute('SELECT title,source_name FROM papers').fetchone(), ('Legacy title',None))
            db.execute("UPDATE papers SET source_name='Original.pdf',title='New title' WHERE id='p'")
            self.assertEqual(db.execute('SELECT title,source_name FROM papers').fetchone(), ('New title','Original.pdf'))
            self.assertEqual(db.execute('SELECT count(*) FROM annotations').fetchone()[0],1)
        finally:
            db.close()
