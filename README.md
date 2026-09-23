# 论文阅读器 · Phase 1

React 18 + TypeScript strict + TailwindCSS + Tauri 2 + SQLite + 本地 PDF.js Worker。应用运行时只读取本地资源和 Tauri IPC，不调用 AI、翻译或远程服务。

## 启动

需要 Node.js/npm、Rust/Cargo 和系统编译工具（macOS：Xcode Command Line Tools）。PDF.js 声明 Node >=20，建议使用 Node 22 LTS；本机 Node 18.12.1 下已通过当前构建和测试，但不作为长期支持版本。

```sh
npm ci --no-audit --no-fund
npm run tauri -- dev
```

首次准备开发依赖需要下载 npm 包与 Rust crates；缓存齐全后可使用 `npm ci --offline` 和 `CARGO_NET_OFFLINE=true`。开发服务仅监听本机 127.0.0.1:1420。不要另外启动一个占用相同端口的 `npm run dev`。

`npm run dev` 只用于浏览器布局预览，导入、SQLite 和桌面文件能力在 Tauri 应用中使用。

构建本地 Mac 应用包：

```sh
npm run tauri -- build --debug --bundles app --config '{"bundle":{"active":true}}'
```

输出在 `src-tauri/target/debug/bundle/macos/论文阅读器.app`。分发签名、公证和其他平台的安装包仍待配置。

## 日常使用

- **导入**：顶部上传按钮、空白页“选择 PDF”、打开文件夹，或拖入文件/文件夹。递归扫描跳过符号链接。支持每个文件最大 250 MB、一次文件夹扫描最多 2000 份 PDF。导入进度可停止，当前文件处理结束后停止下一份。
- **书架名称**：新导入论文默认显示原文件名（省略 `.pdf`）。每篇论文下方“改名 / 分类”可保存自定义名称，或“使用原文件名”。这只修改书架显示名，不修改源文件。
- **旧记录**：旧版本没有保存文件名的论文可直接改名。重新导入同一原 PDF 会按哈希去重并补回文件名，保留已存标题、标注和笔记，再通过“使用原文件名”切换。
- **分类**：“改名 / 分类”中勾选标签/收藏夹，或输入新名称后点击“创建并添加”。同一篇论文可以加入多个标签和收藏夹。标签显示在书架卡片上；点击卡片标签或书架顶部标签筛选，即可查看对应论文。筛选按钮附带论文数量，“未打标签”用于整理遗漏项。
- **检索**：Cmd+K（Windows/Linux：Ctrl+K）打开并聚焦书架搜索。查询覆盖显示名、原文件名、PDF 元数据标题、作者、年份、摘要、笔记、标签和收藏夹。空格分隔的关键词同时匹配，双引号保留短语；Enter 打开首个结果。可组合标签筛选，按最近阅读、名称或年份排序。此阶段没有跨论文 PDF 全文索引或 OCR；单篇正文可使用下述文内搜索。
- **面板宽度**：桌面宽窗口下拖动两条竖向分隔线，或聚焦分隔线后用左右方向键调整；Shift 加速、Home/End 调到边界，双击恢复默认。宽度与折叠状态保存在本机。中间阅读区自动适配；窄窗口使用抽屉。
- **阅读**：虚拟化连续翻页、页码跳转、缩放、90° 旋转、内置目录、每组六页的缩略图。Canvas 按 devicePixelRatio 分配后备像素，仅挂载视口附近页面。
- **文内搜索**：点击“查找正文”或 Cmd/Ctrl+F，按文字层逐页搜索当前 PDF，支持中文、英文不区分大小写、跨文本片段及换行短语。Enter / Shift+Enter 或按钮切换匹配项，当前匹配临时高亮；Esc 或“关闭”清除搜索。搜索不创建持久标注，扫描件需已有文字层。
- **标注**：默认拖选仅选择文字，可直接复制，不保存标注。主动在顶部选择文字高亮、下划线或区域框选及颜色后，下一次选区保存为标注，随后自动回到普通选择模式。标注列表和笔记引用默认只显示一行摘要，点击后展开全文及操作。文字选择的重叠片段会按行合并，旧标注也应用同样的显示修正。坐标以页内比例保存，旋转时转换坐标和下划线边缘。
- **笔记**：支持思考、问题、评议、想法，关联页码或标注；可编辑、删除。关联标注的笔记通过“定位标注”滚动到具体区块，并以短暂描边突出显示；未关联或标注已删除的笔记仍按页码跳转。内容按 Markdown 源文保存和显示，不执行 HTML。
- **草稿**：每篇论文分别自动保存未提交的笔记内容、类型、页码、标注关联及正在编辑的笔记 ID。切换论文或重开应用后自动恢复；点击“保存笔记 / 保存修改”正式保存，或“丢弃草稿”清除。草稿使用本机 WebView localStorage 同步写入，正式笔记仍保存在 SQLite；存储失败会显示提示。
- **备份与恢复**：顶部“备份”打开入口。创建备份时选择父文件夹，生成独立的 `paper-reader-backup-<UUID>` 目录，包含 `library.sqlite`、`papers/` 和 `manifest.json`（含草稿）。恢复时选择该完整目录，确认后替换当前书架与草稿并重新加载。恢复前自动在应用数据目录 `recovery/` 下保存当前资料；如安全备份失败则中止恢复。数据库完整性、表结构、外键及 PDF 哈希检查失败不会替换书架；数据库写入失败会回滚。PDF 路径会重建为当前机器路径，原有托管副本不清理。目前支持同表结构版本的整库替换，不支持合并导入。
- **快捷键**：Cmd/Ctrl+B 切换书架，Cmd/Ctrl+Shift+B 切换笔记面板，F11 专注模式，Esc 退出。专注模式是应用内隐藏工具栏和侧栏，保留浮动页码。

## 本地存储

数据库由 Tauri SQL 插件管理，地址 `sqlite:paper-reader.db`，位于 `appConfigDir`。托管 PDF 由 Rust 流式复制并计算 SHA-256，位于 `appDataDir/papers`，以哈希命名。数据库删除论文会级联移除笔记/标注，源文件和托管副本保留。

默认标识符 `com.local.paperreader`：

- macOS：`~/Library/Application Support/com.local.paperreader/`
- Windows 数据库：`%APPDATA%\com.local.paperreader\`；托管 PDF 使用系统 appDataDir。
- Linux 数据库：`$XDG_CONFIG_HOME/com.local.paperreader/`（通常 `~/.config/`）；托管 PDF 使用 `$XDG_DATA_HOME`（通常 `~/.local/share/`）。

迁移按版本执行，禁止修改已发布迁移：

1. `0001_initial.sql`：DESIGN.md 中七张表和三个索引。
2. `0002_collections.sql`：收藏夹和关联表、关联查询索引。
3. `0003_paper_names.sql`：原文件名、PDF 元数据标题和名称索引；保留现有标题和关联数据。

`src/services/library.ts` 提供参数化 SQLite 查询；`src/services/libraryQueries.ts` 构造搜索语句；Rust 负责后台文件 I/O 和哈希。JSON 字段显式解码，坐标保存前验证；原始 SQL NULL 与 UTC 时间文本保持一致。

## 验证

```sh
npm run typecheck
npm run build
npm test
cargo test --offline --manifest-path src-tauri/Cargo.toml
```

测试覆盖：归一化/四种旋转/同行片段合并，实际 SQLite 搜索组合与字面通配字符、模式升级与索引/外键、文件导入哈希去重/非 PDF 拒绝、嵌套文件夹扫描。测试使用独立临时数据库。

生成 30 页离线测试 PDF（含普通、横向、原生旋转页与目录）：

```sh
python3 tests/generate_fixture.py
```

该命令输出测试文件路径。复杂排版、扫描件、密码保护 PDF 和跨平台仍需专项验收；密码保护文件当前应先解锁再导入。局部元数据提取采用 PDF info 和首屏文本规则，不保证论文作者/年份/摘要全部准确。

中文 PDF：CMap 和标准字体随应用打包，通过同源本地资源加载；安全策略允许这些本地请求。`tests/chinese-pdf.test.mjs` 使用实际中文 CID 测试文件验证映射不可用时的缺字复现及映射可用时的中文提取。修改安全策略后，开发模式需停止并重新启动 Tauri，单独刷新页面不够。

当前已完成 macOS 构建、真实 SQLite 初始化与基础 PDF 导入阅读验证。Phase 1 全量交互验收仍在推进，请勿把单元测试通过等同于全部功能和三平台验收通过。

## 2026-09-23 增量验证

- 类型检查与生产构建通过；既有 JS/Python/Rust 测试通过。
- 新增搜索测试覆盖中文、跨片段/换行、正则符号字面匹配与 Unicode 原始偏移；草稿测试覆盖隔离、清理和备份往返。
- Rust 临时数据库测试覆盖整库备份恢复、笔记保留、跨机器路径修正、PDF 内容损坏拒绝和事务中途失败回滚。
- 浏览器组件验证使用生成的 30 页离线 PDF：90 处匹配、逐处跳转及高亮；草稿切换论文和重载后保留内容、类型及页码。备份对话框已检查。
- 尚未完成真实桌面原生文件选择/恢复端到端验收，以及 Windows/Linux 验收；以上结果不代表 Phase 1 全量验收完成。

## v0.1.0 本地测试安装包

Apple Silicon Mac 的优化构建与 DMG：

```sh
CARGO_NET_OFFLINE=true npm run tauri -- build --bundles app,dmg --config '{"bundle":{"active":true}}'
```

安装包输出到 `src-tauri/target/release/bundle/dmg/`，本次交付副本和校验文件放在 `releases/0.1.0/`。请参阅该目录的《发行说明.md》。本版未完成 Developer ID 签名和公证，定位为测试版；尚未公开上传发布。
