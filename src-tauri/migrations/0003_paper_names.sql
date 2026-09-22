-- Preserve original names independently from user-editable shelf titles.
-- Older managed paths contain only a SHA-256: never pretend that hash is the original name.
ALTER TABLE papers ADD COLUMN source_name TEXT;
ALTER TABLE papers ADD COLUMN metadata_title TEXT;
CREATE INDEX IF NOT EXISTS idx_papers_title ON papers(title COLLATE NOCASE);
