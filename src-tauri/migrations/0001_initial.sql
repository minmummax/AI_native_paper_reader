-- Migration 1: schema from DESIGN.md. Applied transactionally by the SQL plugin.
-- 1. Papers Table
CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,               -- SHA-256 hash of the PDF file content
    title TEXT NOT NULL,
    authors TEXT,                      -- JSON array of author names (e.g. '["Author A", "Author B"]')
    year INTEGER,
    abstract TEXT,
    file_path TEXT NOT NULL,           -- Absolute path on local filesystem
    file_size INTEGER NOT NULL,        -- File size in bytes
    total_pages INTEGER NOT NULL,
    last_read_page INTEGER DEFAULT 1,
    last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Annotations Table (Highlights & Area Selections)
CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,               -- UUID v4
    paper_id TEXT NOT NULL,            -- Foreign Key -> papers.id
    page_number INTEGER NOT NULL,      -- 1-based page index
    type TEXT NOT NULL,                -- 'highlight' | 'area' | 'underline'
    color TEXT NOT NULL,               -- Hex color string, e.g. '#FFE066'
    selected_text TEXT,                -- Raw text extracted from highlight
    rects_json TEXT NOT NULL,          -- JSON array of normalized rects: [{"x": 0.1, "y": 0.2, "width": 0.8, "height": 0.03}]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

-- 3. Research Notes Table (Thoughts & Questions)
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,               -- UUID v4
    paper_id TEXT NOT NULL,            -- Foreign Key -> papers.id
    annotation_id TEXT,                -- Optional Foreign Key -> annotations.id
    page_number INTEGER,
    note_type TEXT DEFAULT 'thought',  -- 'thought' | 'question' | 'critique' | 'idea'
    content_markdown TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
    FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE SET NULL
);

-- 4. Tags & Collections
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#64748B'
);

CREATE TABLE IF NOT EXISTS paper_tags (
    paper_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (paper_id, tag_id),
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 5. Key-Value Settings Table (Theme, Active Engines, Encrypted Keys)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Document Parse & Translation Cache (Phase 2 readiness)
CREATE TABLE IF NOT EXISTS parse_cache (
    paper_id TEXT PRIMARY KEY,
    parser_engine TEXT NOT NULL,       -- 'fast_local' | 'cloud_api' | 'local_mineru'
    parsed_markdown TEXT NOT NULL,     -- Full structured markdown with LaTeX formulas
    translated_markdown TEXT,          -- Bilingual translated markdown
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

-- Performance Indexes (Critical for virtualized page rendering)
CREATE INDEX IF NOT EXISTS idx_annotations_paper_page ON annotations(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_notes_paper ON notes(paper_id);
CREATE INDEX IF NOT EXISTS idx_papers_last_read ON papers(last_read_at DESC);
