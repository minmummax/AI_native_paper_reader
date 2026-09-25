-- User-requested saved selection translations/questions, with frozen source evidence.
CREATE TABLE ai_records (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('translate','ask')),
    model TEXT NOT NULL,
    selected_text TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL DEFAULT '',
    sources_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','cancelled')),
    error TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_records_paper ON ai_records(paper_id,created_at DESC);
