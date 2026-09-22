# DESIGN.md - System Architecture & Technical Specifications

## 1. UX & Interface Principles: "Zero-Friction Simplicity"
- **Zero-Guide Intuition**: The initial screen is a clean, minimal bookshelf inviting the user to "Drop PDF Here" or "Open Folder".
- **Collapsible Three-Panel Layout**:
  - **Left Panel (Collapsible)**: Library, Collections/Tags, PDF Table of Contents (TOC).
  - **Center Stage**: High-performance PDF Viewer (Phase 1) / Synchronized Split Bilingual View (Phase 2).
  - **Right Panel (Collapsible)**: Anchor Notes, Thought Cards, Contextual AI Assistant.
- **Distraction-Free Mode**: `F11` or full-screen toggle hides all sidebars and toolbars, leaving only floating pagination.

---

## 2. Local Database Schema (SQLite)

```sql
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
```

---

## 3. Normalized Annotation Coordinate Specification

### 3.1 Coordinate System & Origin
- **Coordinate Origin**: Top-Left `(0, 0)` based on standard Web/Canvas viewport (converting from raw PDF bottom-left if necessary).
- **Normalization Rule**:
  Let $W_{page}$ and $H_{page}$ be the unscaled viewport width and height of Page $P$.
  For each bounding rect $(x, y, w, h)$:
  $$\text{norm\_x} = \frac{x}{W_{page}}, \quad \text{norm\_y} = \frac{y}{H_{page}}, \quad \text{norm\_w} = \frac{w}{W_{page}}, \quad \text{norm\_h} = \frac{h}{H_{page}}$$
- **Re-rendering at any zoom level $Z$**:
  $$\text{render\_x} = \text{norm\_x} \times W_{current}, \quad \text{render\_y} = \text{norm\_y} \times H_{current}$$
  $$\text{render\_w} = \text{norm\_w} \times W_{current}, \quad \text{render\_h} = \text{norm\_h} \times H_{current}$$

*Benefit*: Guarantees pixel-perfect highlight positioning across screen resizing, DPI changes, and bilingual split-views.

---

## 4. Phase 2 Document Parser Architecture (Dual-Engine)

```
                       +-------------------------------+
                       |   PDF Document Ingestion      |
                       +---------------+---------------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
           [Fast Mode: Default]                 [Deep Parse Mode]
          Local Rule-based Parser               (User-Triggered)
         (PDF.js / PyMuPDF layout)                       |
                     |                 +-----------------+-----------------+
                     |                 |                                   |
                     v                 v                                   v
             Instant Reading    [Option A: Cloud API]           [Option B: Local MinerU]
             (Text + Coords)    • Zero local setup              • 100% Offline / Private
                                • Calls DeepSeek/MinerU API     • Requires Local GPU/MPS
                                • Output: Structured Markdown   • Output: Structured Markdown
```

### Hardware Detection & UI Strategy
- **Auto-Detection**: On app startup, detect GPU capability via Tauri system commands (detect CUDA / Apple Metal).
- **Settings UI**:
  - Status Indicator: `🟢 GPU Detected (Local MinerU Ready)` or `⚪ CPU Only (Cloud API Recommended)`.
  - Simple Toggle: `[ Cloud API Engine (Fast) | Local MinerU Engine (Private) ]`.

---

## 5. Core Tauri IPC Commands (Contract Baseline)

The frontend communicates with the Rust core via the following commands:
- `import_paper(file_path: string) -> Promise<Paper>`: Computes SHA-256, extracts basic metadata, copies/indexes to DB.
- `get_papers(query?: string, tag_id?: string) -> Promise<Paper[]>`: Lists bookshelf papers.
- `save_annotation(annotation: AnnotationInput) -> Promise<Annotation>`: Saves highlight/rect to SQLite.
- `get_annotations_by_page(paper_id: string, page_number: number) -> Promise<Annotation[]>`: Fetches annotations for viewport.
- `save_note(note: NoteInput) -> Promise<Note>`: Saves markdown research note.
