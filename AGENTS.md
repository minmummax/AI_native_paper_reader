# AGENTS.md - Codex Agent Guidelines & Rules

## 1. Project Overview & Role
- **Project**: A privacy-first, local-first Academic Paper Reader & Research Assistant.
- **Current Active Focus**: **PHASE 1 (Local PDF Reader & Shelf MVP)**.
- **Rule**: DO NOT implement AI integration, translation, or remote cloud services until Phase 1 is fully delivered and verified.

## 2. Tech Stack & Architecture Baseline
- **Application Shell**: Tauri 2.0 (Rust) + TypeScript.
- **Frontend Core**: React 18+ (or Vue 3), TailwindCSS, Zustand/Pinia.
- **PDF Core**: `pdfjs-dist` (or `react-pdf-highlighter`) with native HTML5 Canvas overlay.
- **Local Persistence**: Local SQLite (via Tauri SQL plugin) or Dexie.js (IndexedDB).
- **Icons & UI**: Lucide-react (or Lucide-vue-next), Radix UI / shadcn/ui.

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
- **DO NOT** make any network requests in Phase 1 (100% offline).
- **DO NOT** block the UI thread during PDF loading or SHA-256 hash calculation (use Web Workers or Tauri Rust background commands).
- **DO NOT** load all PDF pages into the DOM at once; utilize virtualized rendering for long papers (>20 pages).