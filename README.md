# 论文阅读器 · Phase 1 / Step 1

本步骤提供 React 18 + TypeScript strict + TailwindCSS + Tauri 2 工程骨架、本地 SQLite 迁移和响应式三栏布局。应用不访问远程服务，不加载在线字体或资源。PDF 导入、哈希、渲染、标注编辑、笔记 CRUD 和搜索尚未接入；界面中的空状态明确说明当前范围。ROADMAP 的完整功能项暂不勾选。

## 文件结构

- `src/types/models.ts`：七张表的完整类型，含 `Paper`、`Annotation`、`Note`、`Tag`、`PaperTag`、`AppSettings`、`ParseCache` 和 `NormalizedRect`。
- `src/lib/coordinates.ts`：归一化与保存前校验；坐标必须有限、位于页内，页码从 1 开始。
- `src-tauri/migrations/0001_initial.sql`：与 DESIGN.md 一致的七张表和三个显式索引。
- `src-tauri/src/lib.rs`：注册版本化迁移，由 SQL 插件在加载数据库时按顺序执行。
- `src/services/database.ts`：单例异步初始化、外键检查、失败后重试。
- `src/App.tsx`：三栏、抽屉、专注模式及数据库状态。
- `src/components/WindowControls.tsx`：可选无边框窗口控制。
- `tests/test_migrations.py`：直接读取实际 SQL 的离线 SQLite 集成检查。

## 环境与启动

需要 Node.js（建议 22 LTS）、npm、Rust stable/Cargo，以及 Tauri 2 对应操作系统的编译依赖：macOS 的 Xcode Command Line Tools、Windows 的 MSVC C++ Build Tools 和 WebView2、Linux 的 WebKitGTK 4.1/GTK 3 等开发包。

当前机器只有 Node 18.12.1 / npm 8.19.2，没有检测到 Cargo/Rust；离线 npm 安装因 Tauri 包未缓存而失败。此次没有下载依赖，也没有生成经过验证的 lockfile。请先准备依赖缓存和工具链；离线开发安装使用：

```sh
npm install --offline --no-audit --no-fund
npm run typecheck
npm run build
npm run tauri -- dev
```

如果在单独的、允许联网的开发环境中准备依赖，可使用 `npm install --no-audit --no-fund`，并保存生成的 `package-lock.json`；后续安装使用 `npm ci`。Rust crates 同样需要事先缓存或 vendoring。所有依赖就绪后可用 `CARGO_NET_OFFLINE=true`（PowerShell 使用 `$env:CARGO_NET_OFFLINE="true"`）强制 Cargo 离线。

仅预览网页布局：

```sh
npm run dev
```

浏览器打开 `http://127.0.0.1:1420`。浏览器底部会明确显示“布局预览”，不会模拟 SQLite 成功，也不会保存数据。Vite 开发预览和 HMR 仅连接本机；生产 CSP 仅允许本地应用资源及 Tauri IPC。

构建桌面可执行文件（本步骤未配置安装包分发）：

```sh
npm run tauri -- build --no-bundle
```

## 数据库与迁移

数据库连接为 `sqlite:paper-reader.db`，由 SQL 插件在 Tauri `appConfigDir` 中解析路径，无需手工拼接路径。数据库会在首次桌面启动时创建。具体目录按 OS 而异，默认标识符为 `com.local.paperreader`：

- macOS：`~/Library/Application Support/com.local.paperreader/`
- Windows：`%APPDATA%\com.local.paperreader\`
- Linux：`$XDG_CONFIG_HOME/com.local.paperreader/`，通常为 `~/.config/com.local.paperreader/`

迁移交给 SQL 插件/SQLx 事务和迁移记录管理，重启不会重复迁移或清空数据。以后新增 `0002_*.sql` 并在 Rust 迁移列表注册递增版本；不要修改已经发布的旧迁移。SQLx SQLite 默认在每个连接上启用外键，前端启动时再检查这一前提，失败会显示错误及“重试”。未开放任意 SQL 写入权限；后续实现 CRUD 时需按需求补充 capability 或通过限定的 Rust 命令写入。

为精确对应 DESIGN.md，数据库类型保留 snake_case、SQL NULL 与时间戳文本。`PaperRow.authors` 和 `AnnotationRow.rects_json` 是原始 JSON 字符串，领域类型 `Paper.authors` 和 `Annotation.rects` 是解码后的数组；后续查询代码需显式验证与转换，不应直接将原始查询结果断言为领域对象。`AppSettings` 表示一条键值记录。时间戳遵循 SQLite UTC 文本格式。

`NormalizedRect` 除 x/y/width/height 外包含一基页码 `page`；存储前调用 `serializeRects` 校验归一化比例及所属页。尚未实现 Canvas；后续应区分 CSS 视口尺寸和 `devicePixelRatio` 后备像素，不存像素坐标。

`parse_cache` 和解析引擎联合类型仅用于完整建表和模式兼容，不启动解析、翻译或云服务。

## 验证

无需 npm 或 Rust 即可执行真实 SQL 检查：

```sh
python3 -m unittest discover -s tests -v
```

已有七项通过：与 DESIGN.md 的完整表结构/索引对比、重复初始化保留数据、页标注查询使用索引、默认值、外键及唯一约束、级联/SET NULL 行为、失败事务回滚。它们使用 Python SQLite 验证 SQL；Tauri SQL 插件迁移历史与 IPC 仍需桌面环境验证。

依赖可用后执行 `npm run typecheck`、`npm run build`，并逐项手工检查：

1. 桌面启动底部出现“本地 SQLite 已就绪 · 离线模式”；重启后仍正常。用 SQLite 客户端查看上述数据库，确认七张业务表、三个显式索引及 SQLx 迁移记录。
2. 查看中间“拖入 PDF 开始阅读”空状态；书架/目录及笔记/标注切换正常。
3. 点击左右收起按钮与顶部展开按钮；缩窄至 360–1023px 时面板作为抽屉显示，点击遮罩关闭，主阅读区域不被三栏挤压。
4. macOS 使用 Cmd+B、Cmd+Shift+B；Windows/Linux 使用 Ctrl+B、Ctrl+Shift+B。F11 进入/退出专注模式，Esc 或浮动按钮退出，并恢复原面板状态。部分 Mac 键盘需要 Fn+F11。
5. 默认使用原生窗口边框。验证无边框时把 `src-tauri/tauri.conf.json` 的 `decorations` 改为 `false` 后重启，检查顶部空白区域拖动，以及最小化、最大化/还原、关闭按钮。
6. 断网启动已构建的桌面程序，应正常建库和展示布局。

专注模式当前是应用内隐藏面板和工具栏，不切换系统级全屏。未打开 PDF，因此暂不显示虚假的页码控件。

本次已执行 SQL 检查；TypeScript 编译、Rust 编译、桌面迁移和跨平台 UI 尚未实测，受缺失的离线依赖与 Rust 工具链限制。
