# Paper Reader

[简体中文](README.md) | English

<img src="assets/branding/paper-reader.png" alt="Paper Reader icon" width="128" />

A desktop PDF reader for organizing, annotating, and discussing academic papers. Keep your library on your own computer, browse papers on a tag-based bookshelf, and use your preferred AI provider when you need help understanding a passage.

This project started as a tool for my own research reading. I hope it is useful to others with similar needs. Bug reports, suggestions, documentation improvements, and code contributions are welcome.

**Current version: v0.1.1, an early test release.** Build workflows are configured for Windows x64, Intel Macs, and Apple Silicon Macs. Build availability depends on successful workflow runs and published release assets; configuration alone does not mean a platform has completed native testing. Linux has not been validated.

**Language note:** the application interface is currently primarily in Chinese. This English README is a guide to the existing app, not an English UI release. AI answers default to Chinese; you can explicitly ask for an English answer. The translation button translates non-Chinese text into Chinese and Chinese text into English, with language recognition handled by the model. There is no target-language selector yet.

## Features

- **Paper library:** tag-based book spines, multiple tags per paper, optional combined filters, cover-style cards or a compact list, and sorting by import time, publication year, title, or last read.
- **PDF reading:** continuous scrolling, page navigation, table of contents, thumbnails, zoom, rotation, and in-document text search. Nearby pages are rendered as needed for long documents.
- **Annotations and notes:** highlights, underlines, rectangular selections, page-linked notes, and locally saved note drafts.
- **AI reading assistant:** translate selected text, ask about a passage, or discuss a paper in a movable floating window. Answers support Markdown and LaTeX, with links back to supplied source passages.
- **Your choice of model:** DeepSeek's official API or a custom OpenAI-compatible service, including locally hosted models.
- **Local history and backups:** saved selection translations and questions, usage reports, and library backup/restore. API keys are stored in the operating system's credential store.
- **arXiv import:** user-initiated PDF downloads, alongside local file and folder imports.

## Download and install

Check the [Releases page](https://github.com/minmummax/AI_native_paper_reader/releases) for available installers. Download an installer from **Assets**, rather than the automatically generated source archives.

| Platform | Installer | How to use it |
| --- | --- | --- |
| Windows x64 | `PaperReader_<version>_Windows_x64.exe` (older builds: `-setup.exe`) | Run the installer. WebView2's offline installer is bundled. |
| macOS Apple Silicon (M-series) | `aarch64` / Apple Silicon `.dmg` | Open the disk image and drag the app into Applications. |
| macOS Intel | `x64` / Intel `.dmg` | Open the disk image and drag the app into Applications. |

The installed app is named **论文阅读器**. Quit the old version before replacing it, and back up your library before upgrading. Installers currently lack official publisher signing; macOS notarization is not configured, so operating-system security prompts may appear.

If a release has no installer for your platform, use a successful [Actions run](https://github.com/minmummax/AI_native_paper_reader/actions) or build from source. Downloading Actions artifacts requires signing in to GitHub.

## First steps

1. Import a PDF with **选择 PDF** (Choose PDF), the upload button, or by dragging a file into the app. Folder import is also supported.
2. Use **改名 / 分类** (Rename / Organize) to rename a library entry or assign tags and collections. These changes do not rename the original file.
3. Open a paper from **我的书架** (My Bookshelf). Use the toolbar to navigate, zoom, rotate, search, or annotate.
4. Open the gear icon for **应用设置 → 模型与对话** (App Settings → Model & Chat) if you want to use AI. Ordinary PDF reading does not require an API key.
5. Select text and click **翻译** (Translate) or **问问 AI** (Ask AI). Saved results appear in **AI 记录** (AI Records) on the right.

Selecting text normally does not create an annotation. Choose a highlight, underline, or rectangle tool explicitly to save one; after the annotation is created, the app returns to ordinary text selection.

### Keyboard shortcuts

Use Command on macOS and Ctrl on Windows/Linux.

| Shortcut | Action |
| --- | --- |
| Cmd/Ctrl + K | Open and focus library search |
| Cmd/Ctrl + F | Find text in the current PDF |
| Enter / Shift + Enter in PDF search | Next / previous match |
| Cmd/Ctrl + B | Toggle the bookshelf panel |
| Cmd/Ctrl + Shift + B | Toggle the notes panel |
| F11 | Enter focus mode |
| Esc | Close PDF search or leave focus mode, depending on context |

Library search covers names, metadata, notes, tags, and collections. It does not index the full text of every PDF across your library. In-document search uses the current PDF's text layer.

## Configure an AI provider

### DeepSeek

Open **应用设置 → 模型与对话**, choose the official provider, enter your own API key, and set a model ID available to your account. The official endpoint is fixed to `https://api.deepseek.com`. Model calls use your provider account and may incur provider charges.

### Local or custom OpenAI-compatible service

Choose **自定义（OpenAI 兼容 / 私有部署）** (Custom / OpenAI-compatible / Private deployment).

| Setting | Example or requirement |
| --- | --- |
| Base URL | `http://127.0.0.1:8000` for a service on the same computer |
| Model | The exact model ID exposed by your server |
| API key required | Disable for a server that does not require authentication |
| Streaming token usage | Enable only if the service supports `stream_options.include_usage` |

A host-only URL gets `/v1` appended, and chat requests use `/v1/chat/completions`. API prefixes and full chat-completion URLs are also accepted. Use the server's LAN address if it runs on another machine. The server must support OpenAI-compatible Chat Completions with SSE streaming.

HTTPS is supported, as is HTTP for loopback/private IP addresses and `.local` hosts. Keys are isolated by normalized endpoint. Disabling authentication avoids credential-store access and omits the Authorization header. Saving settings does not contact the server or run inference.

### What is sent to the model?

- **Selection translation and questions:** the selected text (up to 8,000 UTF-8 bytes), plus nearby text on the same page when it can be located. The combined context is capped at 12,000 bytes. Translation targets only the selection; surrounding text helps interpretation.
- **Paper questions:** text is extracted locally and cached for the open document. Short papers may fit entirely; longer papers contribute passages selected by query keywords, with additional overview, contribution, conclusion, and limitation passages for synthesis questions. The default source-text budget is 24,000 bytes, expandable to 48,000 bytes.
- **Follow-up questions:** optionally include up to six recent successful question/answer pairs, capped at 8,000 bytes. Selection actions do not include the general chat history.

These are byte limits, not exact token limits. Local extraction and passage selection do not call a model. The UI shows evidence coverage; passage selection can miss relevant material and does not guarantee that the model has read the entire paper. Use a targeted selection or a larger evidence budget when checking a claim.

The app does not send notes, screenshots, or PDF files with these requests. Image-only pages have no usable text unless the PDF already contains a text layer; OCR is not implemented. Citation links identify supplied passages, not independently verified facts.

## Privacy, history, and backups

Files, annotations, notes, and settings are stored locally by default. arXiv downloads and AI calls require an explicit user action. The configured model provider receives the submitted context; a local reader does not make an external provider's inference local.

API keys are stored in macOS Keychain, Windows Credential Manager, or Linux Secret Service, rather than in the library database. They are not included in backups.

Selection translations and questions are saved in SQLite, including the source snapshot, page, answer, and completion status. They can be expanded, revisited, or deleted in the right sidebar. General paper chat is kept only for the current session. Minimizing the floating window keeps its conversation and ongoing answer; closing it ends the session. Switching papers cancels the old request and clears the conversation.

**应用设置 → 用量统计** (App Settings → Usage) shows local request counts and reported input/output tokens for 7, 30, or 90 days. Missing provider usage is shown as unknown; costs are not estimated. Failed and cancelled attempts are included in request counts. Stopping a request cannot retract data already sent or charges already incurred.

Use **备份** (Backup) to export a complete backup folder. Restoring a backup replaces the current library and drafts; it is not a library merge. The app first creates a recovery backup and checks database integrity and PDF hashes. Saved selection AI records are included in backup format v3; restoring an older backup without these records leaves them empty. Usage records are merged by request ID.

Deleting a paper removes its associated database records, including annotations, notes, and saved AI selections. The original PDF and managed file copy are retained.

### Data locations

The application identifier is `com.local.paperreader`. SQLite uses Tauri's `appConfigDir`; managed PDFs are stored under `appDataDir/papers` and named by their SHA-256 hash.

- **macOS:** `~/Library/Application Support/com.local.paperreader/`
- **Windows database:** `%APPDATA%\com.local.paperreader\`
- **Linux database:** `$XDG_CONFIG_HOME/com.local.paperreader/`, usually `~/.config/com.local.paperreader/`; managed PDFs use `$XDG_DATA_HOME`, usually `~/.local/share/`.

Note drafts also use the local WebView's localStorage and are included when creating a backup.

## Build from source

The application uses React 18, TypeScript in strict mode, Tailwind CSS, Tauri 2, SQLite, and a local PDF.js worker.

Install Node.js 22, Rust stable, and the native build tools for your platform. macOS needs Xcode Command Line Tools. Windows needs Visual Studio Build Tools with Desktop development with C++ and the Windows SDK. Python 3 is required for tests.

```sh
git clone https://github.com/minmummax/AI_native_paper_reader.git
cd AI_native_paper_reader
npm ci
npm run tauri -- dev
```

`npm run dev` provides a browser layout preview only; native file access, SQLite, and credential storage require the Tauri app. The development server listens on `127.0.0.1:1420`. Do not start a second server on the same port.

Development and installed builds share the default application identifier and may use the same library. Back up important data before testing migrations or restore operations.

### Tests

```sh
npm run typecheck
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Tests use temporary databases and synthetic documents. Online tests are excluded from the default offline regression suite. After dependencies are cached, Cargo tests can run with `--offline`.

### Local installers

On a Mac, build for the current machine's architecture:

```sh
npm run release:mac -- -- --locked
```

Output: `src-tauri/target/release/bundle/macos/` and `src-tauri/target/release/bundle/dmg/`.

On Windows, build the x64 installer:

```powershell
rustup target add x86_64-pc-windows-msvc
npm run release:windows -- -- --locked
```

Output: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. The Windows configuration embeds the WebView2 offline installer, so the first build needs network access to download it.

### GitHub Actions

The [Desktop installers workflow](.github/workflows/windows-build.yml) builds Windows x64, macOS Intel, and macOS ARM independently. Its filename remains `windows-build.yml` for continuity.

On your own repository, open **Actions → Desktop installers → Run workflow** and select the branch containing the latest workflow. A pushed version tag such as `v0.1.1` also triggers a build and must match the configured application version. Ordinary branch pushes do not trigger packaging.

Successful jobs upload installers and SHA-256 checksums to **Artifacts**, retained for 30 days. The workflow does not automatically publish a GitHub Release. Maintainers can attach the tested installers and checksums to a release for public download. An older tag does not include workflow changes committed after it; use a manual run on the updated branch to build those changes.

CI automatically names installers `PaperReader_<version>_macOS_intel.dmg`, `PaperReader_<version>_macOS_arm64.dmg`, and `PaperReader_<version>_Windows_x64.exe`. Checksums reference these final filenames and use a separate text file per platform. The installed application's Chinese name is unchanged; direct local Tauri builds still use the original filenames.

## Current limitations

- The interface and default AI instructions are primarily Chinese; full UI localization and a translation-language selector are not implemented.
- No OCR, cloud synchronization, whole-paper conversation persistence, or side-by-side full-document translation.
- Password-protected PDFs should be unlocked before import. Complex layouts, images, and formulas may not extract accurately.
- Model output can be incorrect, and keyword-based context selection can omit relevant evidence.
- Automated tests and simulated UI checks do not replace native installation, credential-store, backup/restore, or real-provider testing on each platform.
- Publisher signing and macOS notarization are not configured.

## Contributing

You do not need to write code to help. Report reproducible bugs, explain a reading workflow that could be improved, test an installer on your platform, or improve these docs. English and Chinese issue reports are welcome.

Search [existing issues](https://github.com/minmummax/AI_native_paper_reader/issues) first. Include the app version, OS and architecture, reproduction steps, and expected versus actual behavior. Do not include API keys, private documents, or unredacted personal data.

For code contributions, fork the repository, create a focused branch, run the relevant checks above, and open a pull request explaining the change and validation. Discuss larger features in an issue first. Keep generated installers, dependencies, and personal data out of commits. Preserve normalized annotation coordinates and cross-platform path handling; add new database migrations rather than modifying released ones.

The detailed [contribution guide](CONTRIBUTING.md), [release guide](docs/RELEASING.md), and [roadmap](ROADMAP.md) are currently in Chinese. Translation contributions are welcome.

## License

[MIT](LICENSE), copyright © 2026 minmummax. Third-party dependencies and assets retain their own licenses and required notices.
