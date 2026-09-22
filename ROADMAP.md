# ROADMAP.md - Academic Paper Reader & Innovation Studio

## 🟢 Phase 1: Local Reader & Personal Shelf (Current Milestone)
> **Goal**: A blazing-fast, distraction-free local PDF reader with rich annotation support.
- [ ] **Paper Shelf**:
  - [ ] Local folder scanning & drag-and-drop PDF import.
  - [ ] Automatic SHA-256 file hashing as unique Paper ID.
  - [ ] Basic metadata extraction (Title, Authors, Year, Abstract) via local PDF info/regex.
  - [ ] Collections/Folders and Tagging system.
  - [ ] Local search (by title, tag, or note keywords).
- [ ] **PDF Reader View**:
  - [ ] High-performance virtualized canvas rendering (smooth scrolling, zoom, rotate).
  - [ ] Multi-color text highlighting & rectangle area selection.
  - [ ] Page jump, thumbnail sidebar, and PDF table of contents (TOC/Outline).
- [ ] **Notes & Annotations**:
  - [ ] Margin notes, thought cards, and open questions tied to highlighted anchors.
  - [ ] 100% local persistence in SQLite.

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