# AGENTS.md - Codex Agent Guidelines & Rules

## 1. Project Overview & Role
- **Project**: A privacy-first, local-first Academic Paper Reader & Research Assistant.
- **Current Active Focus**: **PHASE 2A (Context-Aware AI Reading)**. Phase 1 desktop and complex-PDF acceptance remains open and may proceed in parallel.
- **Product Direction**: Build a context-aware AI paper reader, not a RAG-first knowledge-base product. Optimize for `install DMG/app -> add provider key -> start reading`.
- **Phase 2A Rule**: AI reading is allowed. Prefer direct, bounded reading context and provider-native full-document input for a single paper. Retrieval is not a prerequisite.
- **First Delivery**: One provider, selection/page Explain and Ask, streaming cancellation, OS key storage and verified source navigation. Add other providers, section/full-paper context, multi-turn chat and screenshots incrementally.
- **Release Gate**: Phase 1 acceptance may run alongside development, but data persistence, backup/restore and close/relaunch regressions must pass on every platform targeted by a release.

## 2. Tech Stack & Architecture Baseline
- **Application Shell**: Tauri 2.0 (Rust) + TypeScript.
- **Frontend Core**: React 18+ (or Vue 3), TailwindCSS, Zustand/Pinia.
- **PDF Core**: `pdfjs-dist` (or `react-pdf-highlighter`) with native HTML5 Canvas overlay.
- **Local Persistence**: Local SQLite (via Tauri SQL plugin) or Dexie.js (IndexedDB).
- **Icons & UI**: Lucide-react (or Lucide-vue-next), Radix UI / shadcn/ui.

### 2.1 AI Architecture Baseline
- **Request Path**: React UI -> typed Tauri IPC -> Rust `ContextBuilder` / `AIAction` / `AIProvider` -> user-selected provider API.
- **Provider Boundary**: Keep provider-specific authentication, request formats, streaming events, file-upload references, usage, and errors behind a common Rust interface.
- **Capability Boundary**: Declare text, image and native-file support per configured model. Offer an explicit bounded-text fallback or disable unsupported actions; never silently widen context or switch providers.
- **Evidence Boundary**: Extract page-aware source blocks in the PDF.js worker/frontend path, then validate and budget them in Rust. Paragraphs and sections are derived structure; fall back to page context when uncertain. Validate returned citation IDs against the request's evidence.
- **Supported Context Scopes**: selection, surrounding paragraphs, current page, current section, and full paper. The scope must be visible to the user and overridable.
- **Desktop-Native Default**: Do not introduce FastAPI, a bundled Python service, LangChain, LlamaIndex, Qdrant, or a separate vector database for Phase 2A.
- **Advanced Parsing**: MinerU or another deep parser is an optional, user-triggered enhancement for scanned or complex-layout documents. It must not block ordinary AI reading.
- **Secrets**: Store API keys in the OS credential store (macOS Keychain, Windows Credential Manager, Linux Secret Service), never in SQLite, logs, frontend state persistence, or source control.
- **Network Consent**: AI network requests must result from an explicit user action and clearly identify the active provider. No telemetry, silent uploads, background model calls, or cloud sync.

---

## 3. Cross-Platform Standards (macOS, Windows, Linux)
- **Path Operations**: NEVER use string concatenation for file paths (e.g. `path + '/' + file`). Always use platform-agnostic path resolvers (e.g. Tauri Path API or `path.join`).
- **Shortcuts**: Provide adaptive keybindings (`Meta` / `Cmd` for macOS, `Ctrl` for Windows/Linux).
- **Display Scaling**: PDF Canvas must handle `window.devicePixelRatio` correctly to avoid blurred text on Retina/HiDPI screens.
- **Window Controls**: Support native window frames and clean frameless titlebars with native drag regions on all three platforms.

---

## 4. Code Quality & Commenting Rules
- **TypeScript Strictness**: `strict: true`, zero `any` types allowed. Explicitly define interfaces for all data structures.
- **Mandatory Math/Coordinate Comments**: Any math involving PDF bounding boxes, coordinate scaling, or zoom calculations MUST include descriptive inline comments explaining the formula.
- **Documentation**: All public utilities, database query functions, and custom hooks must have standard JSDoc/TSDoc blocks describing parameters and return values.

---

## 5. Normalized Coordinate System Rule
- **CRITICAL**: Never save annotations with absolute pixel coordinates.
- All highlight rects must be normalized to ratios between `0.0` and `1.0`:
  `{ x: number, y: number, width: number, height: number, page: number }`
  Where `x = rawX / pageWidth`, `width = rawWidth / pageWidth`.

---

## 6. Git & Commit Guidelines
- Follow **Conventional Commits**:
  - `feat(scope)`: New user features
  - `fix(scope)`: Bug fixes
  - `refactor(scope)`: Code restructuring without feature changes
  - `style(scope)`: Styling and layout tweaks
- Keep changes atomic: separate backend (Rust/DB) changes from frontend UI commits.

---

## 7. Safety & Constraints (DO NOTs)
- **DO NOT** make unsolicited background network requests. User-authorized exceptions: an explicit arXiv download/import action may use HTTPS on arxiv.org, www.arxiv.org, export.arxiv.org and cn.arxiv.org, plus the existing HTTP-only xxx.itp.ac.cn mirror exception. Keep redirects and fallbacks inside this allowlist; do not generalize the HTTP exception. An explicit AI action may send only the disclosed context to the configured provider. User-triggered translation or parsing jobs may continue asynchronously within their disclosed scope and must remain cancellable. Reading, metadata extraction, notes and backups remain local by default.
- **DO NOT** send the full paper when selection, paragraph, page, or section context is sufficient. Show the selected scope before dispatch and support cancellation of streaming requests.
- **DO NOT** treat LLM output as the canonical document structure. PDF.js remains the deterministic source for text, pages, coordinates, TOC, and selections; LLMs provide semantic interpretation.
- **DO NOT** add RAG infrastructure for single-paper reading. Cross-paper retrieval starts with SQLite FTS5/BM25; embeddings and reranking are later, evidence-driven upgrades.
- **DO NOT** block the UI thread during PDF loading or SHA-256 hash calculation (use Web Workers or Tauri Rust background commands).
- **DO NOT** load all PDF pages into the DOM at once; utilize virtualized rendering for long papers (>20 pages).
