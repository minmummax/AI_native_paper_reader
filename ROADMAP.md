# ROADMAP.md - Academic Paper Reader & Innovation Studio

## ✅ Phase 1: Local Reader & Personal Shelf (Feature Baseline Complete)
> **Goal**: A blazing-fast, distraction-free local PDF reader with rich annotation support.
> Checked items indicate implemented functionality. The remaining acceptance work continues alongside Phase 2A and does not block AI reading development.
> Release gate: data persistence, backup/restore and close/relaunch regressions must pass on each platform targeted by a release.
- [x] **Paper Shelf**:
  - [x] Local folder scanning & drag-and-drop PDF import.
  - [x] Automatic SHA-256 file hashing as unique Paper ID.
  - [x] Basic metadata extraction (Title, Authors, Year, Abstract) via local PDF info/regex.
  - [x] Collections/Folders and Tagging system.
  - [x] Local search (by title, tag, or note keywords).
- [x] **PDF Reader View**:
  - [x] High-performance virtualized canvas rendering (smooth scrolling, zoom, rotate).
  - [x] Multi-color text highlighting & rectangle area selection.
  - [x] Page jump, thumbnail sidebar, and PDF table of contents (TOC/Outline).
- [x] **Notes & Annotations**:
  - [x] Margin notes, thought cards, and open questions tied to highlighted anchors.
  - [x] 100% local persistence in SQLite.


- [x] PDF in-document search with Cmd/Ctrl+F, match navigation and transient highlighting.
- [x] Per-paper local note draft autosave and recovery, including note type and page/annotation anchors.
- [x] Local folder backups of SQLite, PDFs and drafts; checked replacement restore with an automatic recovery backup.
- [ ] Complete desktop acceptance: native dialogs, backup/restore and close/relaunch on macOS, Windows and Linux.
- [ ] Complex-layout/scanned PDF and long-document performance acceptance (no OCR in Phase 1).

---

## 🟡 Phase 2A: Context-Aware AI Reading (Current Milestone)
> **Goal**: Turn the existing local reader into an AI reading companion without adding a server or a RAG dependency.
- [ ] **First Delivery: Selection/Page Reading**:
  - [x] Typed Rust `AIProvider` interface and initial DeepSeek adapter with text-only input and explicit adapter limits; model name is configurable.
  - [x] Implement OS credential storage for API keys and SQLite storage for the non-secret model preference; native end-to-end acceptance remains below.
  - [x] Stream responses with cancellation, sanitized errors and optional token usage. Cost is explicitly unknown.
  - [ ] Add versioned model pricing and estimated cost where reliable pricing is available.
  - [x] Extract minimal in-memory page-aware evidence with content/revision-based IDs; retain normalized positions for selections and page-only provenance for page context. Paragraph grouping is deferred.
  - [x] Build bounded selection context with locatable same-page surroundings; exclude private notes. Add selection translation/question toolbar.
  - [x] Explain and Ask in a draggable/minimizable floating assistant, with validated source IDs and jump-back navigation.
  - [x] Independent application settings for model credentials and automatic chat opening.
  - [x] Render Markdown tables, code and math without raw HTML or remote image loading.
  - [x] Local 7/30/90-day usage reports by day/model, including failed/cancelled attempts and unknown usage.
  - [ ] Verify cancellation, provider errors, paper switching during streaming, context limits and citation validation; unavailable usage/cost must remain unknown rather than zero.
  - [ ] Complete real-provider and native credential-store acceptance on release platforms. Offline tests and synthetic browser responses do not replace these checks.
  - [x] Migration 5 persists user-requested selection translations/questions with source snapshots and deletion controls; backup v3 and older backup restore tests cover these records. General paper conversations remain in memory.
  - [x] Migration 4 persists usage metadata; backup v2 merges usage by request ID and accepts older backups without this table.
- [ ] **Incremental Phase 2A Extensions**:
  - [x] Custom OpenAI-compatible base URL/model, optional endpoint-scoped credentials, LAN HTTP and configurable streaming usage requests.
  - [x] OpenRouter, Zhipu GLM and Xiaomi MiMo endpoint presets, provider labels and MiMo token/thinking parameter adaptation; request construction tested offline, live-account acceptance pending.
  - [ ] Extend adapters toward OpenAI, Gemini, Claude and DeepSeek; leave local providers as a compatible extension point. Supporting all four is not a first-delivery gate.
  - [ ] Add current-section context with page fallback when TOC/heading structure is unreliable.
  - [ ] Support full-paper requests through native PDF/file input where supported; offer an explicit bounded-text fallback otherwise.
  - [x] Selection translation and query-aware whole-paper text evidence, with synthesis prompts, local extraction cache, 24/48 KB budgets and explicit coverage limits.
  - [ ] Dedicated critique workflows and persistent reusable paper summaries; evaluate answer coverage on real long papers.
  - [x] Add in-memory multi-turn chat with disclosed history scope, a six-pair/8000-byte budget and a history opt-out.
  - [ ] Extend persistence from saved selection actions to optional whole-paper conversation sessions.
  - [ ] Formula and figure questions may include a user-confirmed area screenshot plus nearby text.

---

## 🟠 Phase 2B: Bilingual Reading & Translation Memory
> **Goal**: Provide stable, resumable bilingual reading while preserving page and paragraph alignment.
- [ ] Refine the Phase 2A source blocks into paragraph/document blocks suitable for bilingual alignment; version extraction changes without retargeting existing evidence anchors.
- [ ] Generate a paper-level terminology glossary from title, abstract and keywords as part of an explicit translation action.
- [ ] Translate blocks through a cancellable queue; protect formulas, citations, variables, URLs and code.
- [ ] Cache block translations locally with source/model/prompt/glossary version checks and render synchronized original/translated views.

---

## 🟤 Phase 2C: Optional Document Enhancement
> **Goal**: Improve scanned and complex-layout papers without making deep parsing a prerequisite.
- [ ] *Fast Local Mode*: PDF.js-based text, page, coordinate and TOC extraction remains the default.
- [ ] Add user-triggered OCR/deep parsing only when local extraction quality is insufficient.
- [ ] Evaluate cloud layout parsing and local MinerU as optional adapters; do not require a persistent FastAPI service.
- [ ] Preserve stable page/block/bounding-box provenance when enhanced parsing is used.

---

## 🔵 Phase 3: Cross-Paper Intelligence & Idea Synthesis
> **Goal**: Retrieve evidence across a growing library and turn reading insights into research ideas.
- [ ] **Lightweight Cross-Paper Retrieval**:
  - [ ] Start with SQLite FTS5/BM25 over paper metadata, document blocks and notes.
  - [ ] Return paper/page/section citations and jump back to the original evidence.
  - [ ] Add embeddings, hybrid fusion and reranking only after lexical retrieval quality is measured.
- [ ] **Innovation Delta Extractor**:
  - [ ] Automatic identification of: *Baseline vs. Author's Core Novelty vs. Trade-offs*.
- [ ] **Limitation Miner & Idea Canvas**:
  - [ ] Extract paper limitations and open challenges into draggable "Idea Cards".
  - [ ] Visual canvas to connect ideas across multiple papers.
- [ ] **Formula & Architecture Deep Dive**:
  - [ ] Select any math formula to get intuitive physical explanations and code pseudocode.

---

## 🟣 Phase 4: Academic Ecosystem & Open Source Release
> **Goal**: Open-source launch and integration with mainstream academic workflows.
- [ ] Two-way synchronization with Zotero library and BibTeX files.
- [ ] Local citation network and concept knowledge graph when simpler retrieval no longer covers the use case.
- [ ] One-click export to LaTeX, Overleaf snippet, and Obsidian Markdown.
- [ ] Community plugins and custom prompt templates.
