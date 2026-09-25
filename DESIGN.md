# DESIGN.md - System Architecture & Technical Specifications

## 1. UX & Interface Principles: "Zero-Friction Simplicity"
- **Zero-Guide Intuition**: The initial screen is a clean, minimal bookshelf inviting the user to "Drop PDF Here" or "Open Folder".
- **Collapsible Three-Panel Layout**:
  - **Left Panel (Collapsible)**: Library, Collections/Tags, PDF Table of Contents (TOC).
  - **Center Stage**: High-performance PDF Viewer (Phase 1) / Synchronized Split Bilingual View (Phase 2).
  - **Right Panel (Collapsible)**: Anchor Notes and Thought Cards.
- **AI Assistant**: An in-app draggable, minimizable floating conversation window; model configuration and local usage reports live in independent application settings.
- **Distraction-Free Mode**: `F11` or full-screen toggle hides all sidebars and toolbars, leaving only floating pagination.

---

## 2. Local Database Schema (SQLite)

The first SQL block describes the released migration 1 baseline; later implemented migrations are listed in section 7. The second block proposes future persisted Phase 2 tables and is not implemented yet. Introduce schema changes through new versioned migrations, without rewriting released migrations.

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

-- 5. Key-Value Settings Table (non-secret preferences only)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Optional Enhanced Parse Cache (Phase 2C compatibility)
CREATE TABLE IF NOT EXISTS parse_cache (
    paper_id TEXT PRIMARY KEY,
    parser_engine TEXT NOT NULL,       -- 'fast_local' | 'cloud_api' | 'local_mineru'
    parsed_markdown TEXT NOT NULL,     -- Full structured markdown with LaTeX formulas
    translated_markdown TEXT,          -- Legacy whole-document cache; block_translations is preferred
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

-- Performance indexes in migration 1
CREATE INDEX IF NOT EXISTS idx_annotations_paper_page ON annotations(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_notes_paper ON notes(paper_id);
CREATE INDEX IF NOT EXISTS idx_papers_last_read ON papers(last_read_at DESC);
```

Proposed persistent Phase 2 schema (the first AI delivery uses in-memory evidence snapshots):

```sql
-- 7. Page-Aware Document Blocks (persist when reusable extraction is introduced)
CREATE TABLE IF NOT EXISTS document_blocks (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    block_order INTEGER NOT NULL,
    extraction_revision TEXT NOT NULL, -- Parser/version/settings fingerprint; IDs belong to this revision
    source_hash TEXT NOT NULL,         -- Hash of this block's source content
    block_type TEXT NOT NULL,          -- 'text' fallback; optionally 'heading' | 'paragraph' | 'formula' | 'figure' | 'table'
    section_path TEXT,                 -- JSON array, e.g. '["3 Method", "3.2 Training"]'
    source_text TEXT NOT NULL,
    rects_json TEXT,                   -- Optional normalized source rectangles
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

-- 8. Block Translation Cache (Phase 2B)
CREATE TABLE IF NOT EXISTS block_translations (
    block_id TEXT NOT NULL,
    target_language TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    cache_signature TEXT NOT NULL,    -- Source hash + extraction revision + provider profile/revision + model + language + prompt/glossary versions
    translated_text TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (block_id, target_language),
    FOREIGN KEY (block_id) REFERENCES document_blocks(id) ON DELETE CASCADE
);

-- 9. Provider File References (opaque IDs only; never API keys)
CREATE TABLE IF NOT EXISTS ai_file_refs (
    paper_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_profile_id TEXT NOT NULL, -- Non-secret configuration ID, scoped to account and endpoint
    profile_revision INTEGER NOT NULL, -- Increment on credential/account/endpoint changes
    remote_file_id TEXT NOT NULL,
    expires_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (paper_id, provider_profile_id, profile_revision),
    FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

-- Performance Indexes (Critical for virtualized page rendering)
CREATE INDEX IF NOT EXISTS idx_document_blocks_paper_page ON document_blocks(paper_id, page_number, block_order);
```

API credentials are stored exclusively in the operating-system credential store. SQLite may store the selected provider, model, endpoint, context preference, usage totals and opaque provider file IDs, but never plaintext secrets.

### 2.1 Cache and Migration Lifecycle

- Block IDs are stable within an extraction revision. Reparsing creates a new revision; preserve referenced evidence snapshots or explicit mappings so old citations cannot silently point to different text.
- `block_translations` stores the latest translation per block/language. Reuse it only when `cache_signature` matches; changing source, model, prompt or glossary invalidates reuse.
- File references are bound to a provider profile and its revision; `paper_id` already identifies PDF content by SHA-256. Expired or invalid references require a newly authorized upload. Changing endpoints must not automatically forward existing credentials to a new host. Local deletion does not imply remote deletion; expose remote cleanup when supported.
- Keep backup manifests/schema versions and restore table coverage aligned with migrations. Migrate old backups in a temporary database before transactional restore, preserve notes/annotations/drafts, and reject unsupported newer schemas without modifying live data.
- Back up local document blocks and translations with their revisions. Exclude OS credentials and invalidate remote file references on restore. Verify both current-version round trips and Phase 1 backup upgrades, including rollback on failure. The existing fixed restore table list must be updated when tables are introduced.

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

## 4. Phase 2A Context-Aware AI Architecture

Implemented: DeepSeek/custom OpenAI-compatible adapters, cancellation, OS credentials, Markdown/math and source navigation. Selection actions translate or answer using the selection plus locatable same-page surroundings (12000-byte combined cap); each action is saved with frozen source rectangles under the user's explicit request for automatic history. The first source is the translation target; other sources are contextual evidence only.

General floating chat now builds query-aware evidence across the current paper without a scope selector. Sequential worker extraction is cached per loaded PDF, split into bounded chunks, ranked with query terms and a small bilingual research vocabulary. Synthesis questions reserve cross-page samples and contribution/conclusion/limitation candidates. Short documents fit in full; longer ones use a 24000-byte default or explicit 48000-byte budget, at most 64 sources, and disclose covered/readable pages and omitted content. This is bounded lexical evidence selection, not a guarantee of comprehensive semantic understanding. There is no extra model summarization request, embedding service, PDF upload or OCR. Local text cache caps are 60000 bytes per page and 8 MB per document; clipping remains disclosed.

Whole-paper conversations remain memory-only, with at most six successful question/answer pairs and 8000 UTF-8 history bytes. Questions cap at 2000 bytes, output at 2048 tokens. Selection history is stored separately in SQLite. Markdown uses GFM and local KaTeX, disables raw HTML, restricts links to HTTP(S), and replaces images with text. HTTP model endpoints are local/private only; redirects are disabled and custom endpoints cannot reuse official credentials. Actual provider/native-keychain acceptance and long-paper answer-quality evaluation remain pending.

```
PDF.js Reader
  |-- Selection + surrounding paragraphs
  |-- Current page
  |-- Current section
  `-- Full paper / confirmed area screenshot
             |
             v
       ContextBuilder
             |
             v
          AIAction
   explain | translate | summarize | critique | ask
             |
             v
       Rust AIProvider
   OpenAI | Gemini | Claude | DeepSeek | future local adapter
             |
             v
     Streaming UI response
```

### 4.1 Responsibilities
- **PDF.js and the reader** supply extracted text, page numbers, normalized coordinates, available TOC, selection and viewport state. The worker/frontend path builds minimal source blocks and sends a typed snapshot through IPC; Rust does not call the PDF.js worker directly. Paragraph grouping, reading order and section boundaries are derived and may be uncertain.
- **ContextBuilder** creates a typed, bounded context package. It chooses the smallest useful scope, records provenance, respects provider limits and exposes the scope for user confirmation.
- **AIAction** owns task-specific instructions and output contracts without embedding provider-specific request code.
- **AIProvider** runs in Rust and owns credentials, HTTPS, streaming, provider-native PDF/file input, usage normalization, cancellation and error mapping.
- **LLMs** interpret, explain, translate, summarize and critique; their output never replaces canonical PDF structure.
- **Delivery order**: First ship one adapter with selection/page Explain and Ask. Add other actions, providers, multi-turn history, section context, screenshots and full-paper uploads incrementally. Model capabilities must explicitly cover text/image/native-file support and limits; unsupported input requires an explicit fallback or an unavailable action.

### 4.2 Context Scope Contract

```ts
type ContextScope = "selection" | "page" | "section" | "full_paper";

interface SourceBlock {
  sourceId: string;
  pageNumber: number; // 1-based
  text: string;
  rects: NormalizedRect[]; // Empty when only page-level provenance is available
  sectionPath?: string[];
}

interface ReadingContext {
  requestId: string;
  conversationId: string;
  paperId: string;
  title: string;
  extractionRevision: string;
  providerProfileId: string;
  profileRevision: number;
  scope: ContextScope;
  blocks: SourceBlock[];
  selectedText?: string;
  surroundingText?: string;
  pageNumbers: number[];
  sectionPath?: string[];
  areaImage?: { pageNumber: number; normalizedRect: NormalizedRect };
  userNotes?: string[];
  historyMessageIds: string[];
  inputTokenBudget: number;
  reservedOutputTokens: number;
  truncated: boolean;
  omittedSourceIds: string[];
}
```

This is a prepared request snapshot. Rust resolves history IDs from the active session, validates source/page ownership and input size, and budgets the complete payload including instructions, history, notes and attachments. Estimate tokens conservatively when exact counting is unavailable. Prioritize the user's selection/question, trim older history and surrounding blocks first, and disclose omitted context before dispatch; never silently upload the full paper to bypass a limit. Full-paper and image extensions must add validated attachment references and limits to this contract before implementation.

Freeze the snapshot at dispatch. Every stream event carries its request/conversation/paper IDs; switching papers must not route old output into the new paper's assistant. Cancellation stops local streaming and further retries, but cannot undo content already transmitted or guarantee zero provider charges.

Answers may reference only source IDs supplied with the request. Validate IDs before enabling jump-back and use stored page/rectangle provenance, never model-generated coordinates. If native-file input cannot supply a verifiable location, show the answer without a precise citation rather than inventing one.

Context selection defaults:
- Selection action -> selected text plus nearby paragraphs.
- Formula/figure action -> confirmed area image plus nearby text and section title.
- Local reference such as “here” -> current page or current section.
- Unreliable paragraph/section extraction -> current page with the fallback shown; empty/scanned text -> explain that extraction is unavailable and offer optional enhancement, without an automatic upload.
- Whole-paper question -> provider-native PDF/file input when supported, with explicit disclosure before upload; otherwise offer bounded text with its coverage made clear.

### 4.3 Privacy, Secrets & Network Boundaries
- The frontend never reads a stored API key. It refers to a configured provider profile through typed IPC.
- Keys live in macOS Keychain, Windows Credential Manager or Linux Secret Service.
- No AI request, file upload or remote parse occurs without an explicit user action. The UI shows provider, model and context scope and supports cancellation.
- Do not persist raw prompts or responses except the user-requested automatic selection history. Whole-paper chat remains ephemeral. Never log secrets or full document payloads.
- Private notes are excluded unless explicitly included. Disclose history and attachment inclusion as well as document scope; multi-turn history stays within the active paper/conversation by default. Persisted history requires versioned session/message storage with evidence snapshots, deletion controls and a documented backup policy before that option ships.

---

## 5. Optional Document Enhancement Pipeline

The default path does not require Markdown conversion or a deep parser:

```
PDF -> PDF.js -> text / pages / coordinates / TOC -> ContextBuilder -> LLM
```

When a scanned or complex-layout paper has poor local extraction, the user may trigger an enhancement adapter:

```
                         PDF
                          |
              +-----------+-----------+
              |                       |
       PDF.js fast path        Optional deep parse
         (default)              (user-triggered)
                                      |
                         +------------+------------+
                         |                         |
                  Cloud adapter             Local MinerU adapter
                                             (optional sidecar)
```

- Deep parsing is an enhancement, not a Phase 2A dependency.
- A local MinerU adapter may require a Python sidecar, but the ordinary app must remain fully usable without Python, Docker, a GPU or a localhost service.
- Enhanced results must map back to stable paper/page/block/normalized-rectangle provenance.
- Hardware detection belongs inside the optional local parser setup flow, not application startup.

---

## 6. Core Tauri IPC Commands (Contract Baseline)

The frontend communicates with the Rust core via the following commands:
- `import_paper(file_path: string) -> Promise<Paper>`: Computes SHA-256, extracts basic metadata, copies/indexes to DB.
- `get_papers(query?: string, tag_id?: string) -> Promise<Paper[]>`: Lists bookshelf papers.
- `save_annotation(annotation: AnnotationInput) -> Promise<Annotation>`: Saves highlight/rect to SQLite.
- `get_annotations_by_page(paper_id: string, page_number: number) -> Promise<Annotation[]>`: Fetches annotations for viewport.
- `save_note(note: NoteInput) -> Promise<Note>`: Saves markdown research note.
- `configure_ai_provider(input: ProviderConfigInput) -> Promise<ProviderProfile>`: Stores non-secret settings and writes/removes the API key through the OS credential store.
- `run_ai_action(input: AIActionInput, channel: Channel<AIStreamEvent>) -> Promise<void>`: Builds/validates context, dispatches the provider request, and streams normalized events.
- `cancel_ai_request(request_id: string) -> Promise<void>`: Cancels an in-flight request and closes its stream cleanly.
- `upload_paper_for_ai(paper_id: string, provider_profile_id: string, profile_revision: number) -> Promise<ProviderFileRef>`: Validates the active profile revision and native-file capability, performs an explicit upload, and caches its opaque reference and expiry under that profile revision.

The exact Tauri streaming primitive may change during implementation, but provider credentials and outbound AI requests must remain in Rust rather than the WebView.

---

## 7. Implemented Migrations and Reader Additions

- Migration 2 adds `collections(id, name)` and `paper_collections(paper_id, collection_id)` plus reverse-lookup indexes, keeping collections distinct from tags.
- Migration 3 adds nullable `papers.source_name` and `papers.metadata_title`. `papers.title` is the editable shelf name. New imports use the original filename as their initial shelf name. Legacy records retain their titles; re-importing identical content recovers missing filenames without deleting notes or annotations.
- Migration 4 adds `ai_usage`: request ID, provider/model, timestamps, status and nullable input/output token counts only. Local reports aggregate 7/30/90 calendar days; missing usage is unknown. Finalization occurs outside the cancellable stream. Restore merges ledger IDs and retains existing completed records.
- Migration 5 adds `ai_records` for selection translations/questions, answers, status and immutable normalized source snapshots. Foreign keys cascade on paper removal. Records are inserted before dispatch, finalized after success/failure/cancellation, and marked unfinished if the application exits before finalization. Backup v3 includes these records and restores them with the replaced library; v1/v2 backups without the table restore empty selection history. Credentials and general chat sessions remain excluded.
- The bookshelf opens as a full-width reading room: one book spine per tag, optional tag intersections via parameterized EXISTS clauses, title covers/list mode, added/year/recent/name sorting and reversible navigation. Transform/opacity animations honor reduced-motion settings.
- Rust commands `prepare_import`, `read_paper_file`, and `scan_folder` perform background local I/O, managed copies and SHA-256 hashing. Metadata extraction runs in a bundled PDF.js Worker; typed frontend repositories implement library/annotation/note queries via the local Tauri SQL plugin. The section 6 command names remain conceptual contracts, not additional Rust endpoints in this implementation.
- Text selection reads leaf text-node ranges, merges overlapping fragments on a shared line, and stores normalized canonical page rectangles. The same line consolidation applies to existing annotations at render time. Annotation edges rotate with the page.
- A per-paper organizer exposes naming, multi-tag membership and collections. Shelf chips and group counts expose classification directly; search combines metadata, filenames, groups and notes with bound SQL parameters.
- Layout widths and visibility are persisted in `app_settings` under `layout`. Desktop dividers support pointer and keyboard resizing while reserving a readable center viewport; narrow windows use overlay drawers.

---

## 8. Retrieval Evolution (Phase 3, Not a Phase 2A Dependency)

Single-paper reading prefers selection/page/section context or provider-native full-paper input. Cross-paper questions introduce retrieval only when the corpus is too large to send directly:

1. SQLite FTS5/BM25 over metadata, document blocks and notes.
2. Evidence-linked answers with paper, page and section provenance.
3. Add local embeddings and hybrid fusion only after lexical retrieval is measured.
4. Add reranking only if evaluation shows a material quality gain.

Do not introduce a standalone vector database, FastAPI service, knowledge graph or agent framework without a concrete feature and evaluation that justify its packaging and maintenance cost.
