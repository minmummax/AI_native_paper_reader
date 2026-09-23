# ROADMAP.md - Academic Paper Reader & Innovation Studio

## 🟢 Phase 1: Local Reader & Personal Shelf (Current Milestone)
> **Goal**: A blazing-fast, distraction-free local PDF reader with rich annotation support.
> Checked items indicate implemented functionality, not full cross-platform acceptance. Phase 1 remains open pending the acceptance items below.
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

## 🟡 Phase 2: AI Engine & Bilingual Split-View
> **Goal**: Understand papers faster with layout-aware structural parsing and bilingual reading.
- [ ] **Dual-Engine Document Parser**:
  - [ ] *Fast Mode (Local)*: Rule-based text and structure extraction (instant, zero GPU).
  - [ ] *Deep Mode (Cloud API)*: Call remote layout-parser APIs for complex tables/formulas.
  - [ ] *Deep Mode (Local MinerU)*: Connect to local Python/MinerU service with GPU acceleration.
- [ ] **Bilingual Split-View**:
  - [ ] Left: Original PDF; Right: Parsed & translated Markdown page.
  - [ ] Synchronized scrolling and paragraph alignment.
- [ ] **Interactive AI Assistant**:
  - [ ] Contextual chat based on selected paragraph, formula, or entire section.
  - [ ] Multi-provider API config (OpenAI, Claude, DeepSeek, Local Ollama).
  - [ ] Real-time token analytics and cost tracking.

---

## 🔵 Phase 3: Research Innovation & Idea Synthesis
> **Goal**: Turn reading insights into novel research contributions and new papers.
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
- [ ] Local citation network and concept knowledge graph.
- [ ] One-click export to LaTeX, Overleaf snippet, and Obsidian Markdown.
- [ ] Community plugins and custom prompt templates.