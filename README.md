# Folio Reader

简体中文 | [English](README.en.md)

<img src="assets/branding/paper-reader.png" alt="Folio Reader 图标" width="128" />

一个以本地资料为中心的桌面 PDF 阅读器，适合论文、书籍、财报及其他 PDF 文档：在标签书架中整理 PDF，阅读时标注和记笔记，也可以选中文字翻译、向 AI 提问。

这个项目最初是为了自己阅读论文而做的，也希望能方便有相同需求的人。欢迎反馈问题、分享使用体验，一起把资料整理、阅读和思考变得更顺手。

新构建的应用名称为 **Folio Reader**（原名“论文阅读器”），已发布的旧安装包仍可能使用原名。应用标识、数据库及密钥存储标识保持不变。macOS 上新名称的应用不会自动覆盖旧名称的应用；升级前退出旧版并备份资料，安装后使用 Folio Reader。

项目采用 [MIT 许可证](LICENSE)。想参与改进，可以从 [贡献指南](CONTRIBUTING.md) 或 [Issues](https://github.com/minmummax/AI_native_paper_reader/issues) 开始。第三方依赖与素材保留各自的许可证和声明。

**当前版本：v0.1.2 测试版。** macOS Apple Silicon 安装包已在本机生成；Windows x64 已配置 GitHub Actions 构建，尚待首次云端构建及原生验收。Linux 尚未验收。

## 主要功能

- **论文书架**：标签书脊、多标签筛选、封面式列表、年份与最近阅读排序。
- **PDF 阅读**：目录、缩略图、正文搜索、缩放旋转、文字高亮、下划线与关联笔记。
- **AI 阅读**：选区翻译与提问、悬浮论文问答、Markdown 和公式渲染、来源定位。
- **自定义模型**：支持 DeepSeek 官方接口与 OpenAI 兼容的私有部署服务。
- **本地资料**：SQLite 持久化、备份恢复、选区 AI 历史与用量统计；API Key 存入系统凭据库。

## 获取与自动打包

仓库提供源码与构建流程，安装包不存放在 Git 源码历史中。若维护者已发布版本，可在仓库的 **Releases** 页面下载；否则可按下述流程自行构建。

| 平台 | 构建方式 | 产物 |
| --- | --- | --- |
| macOS Apple Silicon | 在 M 系列 Mac 执行 `npm run release:mac` | `.app` / `.dmg` |
| Windows x64 | GitHub Actions，或 Windows 上执行 `npm run release:windows` | `-setup.exe` |

**GitHub 流水线已经包含在本仓库：** [Desktop installers](.github/workflows/windows-build.yml)。将完整代码推送到 GitHub 默认分支后，进入 **Actions → Desktop installers → Run workflow**。流程分别在 Windows x64、macOS Intel 和 macOS ARM 环境安装依赖、执行回归测试和构建，成功后从该次运行的 **Artifacts** 下载各平台安装包及 SHA-256 校验文件。文件名沿用 `windows-build.yml`，显示名称已更新。

也可以推送与应用版本一致的标签（当前为 `v0.1.2`）触发构建。普通分支推送不会自动打包。产物保留 30 天，流程不会自动公开发布 Release。已经存在的 tag 不包含之后的流水线修改；更新推送到默认分支后，请手动选择 `main` 运行。Windows 安装包内置 WebView2 离线安装程序，首次构建需要联网。

安装包目前未配置正式发布者签名；构建成功不代表各平台原生验收完成。环境安装、发布步骤和验收清单见 [发布指南](docs/RELEASING.md)，版本变化见 [v0.1.2 发行说明](releases/0.1.1/发行说明.md)。

## 技术栈与隐私

React 18 + TypeScript strict + TailwindCSS + Tauri 2 + SQLite + 本地 PDF.js Worker。文件、笔记和标注默认保存在本机；arXiv 导入和 AI 问答仅在用户主动操作时联网。

## AI 阅读助手（首批实现）

设置的“服务类型”现提供 DeepSeek、OpenRouter、智谱 GLM（国内 API）、小米 MiMo 和自定义接口。新增预设会自动填写服务地址，模型 ID 请按对应账户可用型号填写；OpenRouter 通常需要完整的 `厂商/模型` ID。当前仍一次使用一个服务，保存配置不会发起推理。

| 预设 | Base URL | 官方文档 |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1` | [接入说明](https://openrouter.ai/docs/quickstart) |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | [官方 SDK](https://github.com/zai-org/z-ai-sdk-python/blob/main/README_CN.md) |
| 小米 MiMo | `https://api.xiaomimimo.com/v1` | [Chat Completions](https://mimo.mi.com/docs/en-US/api/chat/openai-api) |

预设使用端点隔离的系统凭据，旧的自定义配置使用这些地址时会自动识别服务名称。默认不额外请求流式用量字段，服务返回的用量照常统计；MiMo 使用 `max_completion_tokens` 并关闭深度思考。当前只适配文本聊天，不包含语音、工具调用或原生文件上传。Coding Plan、Token Plan 和其他地域地址请按供应商文档通过自定义接口配置，不能混用密钥与地址。请求构建及离线回归已验证，新增供应商的真实账户联调仍需实际测试。

点击顶部齿轮进入 **应用设置 → 模型与对话**，填写 DeepSeek API Key 并保存。密钥通过 Rust 写入系统凭据库，模型名称保存在 SQLite。官方模式的服务地址固定为 `https://api.deepseek.com`；默认模型为 `deepseek-flash`，可按账户可用模型修改。

- **悬浮对话**：打开论文后点击右下角 AI 入口；窗口可拖动、收起或关闭。收起保留对话并继续当前回答，关闭结束会话；切换论文会取消旧请求并清空会话。设置中可开启打开论文时自动显示。
- **选区操作**：拖选正文后出现“翻译 / 问问 AI”。翻译直接开始；提问会打开带原文的输入框。发送选区（最多 8000 UTF-8 字节）及可定位的同页邻近文字，总计不超过 12000 字节。每次原文、问题、回答、页码与来源快照自动保存到右侧“AI 记录”，可展开、定位、删除；失败和取消也保留状态。
- **论文问答**：取消范围下拉框，按问题在本机逐页提取正文并缓存当前文档。短论文在预算允许时发送完整可提取正文；长论文按关键词相关性挑选片段，总结类问题额外保留跨页概览及贡献、结论、局限等段落。默认正文预算 24000 UTF-8 字节，可主动扩大到 48000 字节；历史另限 8000 字节，问题限 2000 字节。界面显示实际页数、字节数与不完整覆盖，模型也收到覆盖限制提示。
- **节省用量的边界**：本机提取和筛选不调用模型，每个问题只发一次模型请求，没有额外的逐段摘要调用。预算是字节而非精确 token 数；词法筛选可能遗漏同义表达或关键细节，不等于模型通读全文。需要核实时可扩大预算或直接选中证据提问。扫描页、图片和复杂公式不做 OCR，不自动上传 PDF。
- **多轮追问**：默认携带最近最多 6 轮成功问答，总计不超过 8000 UTF-8 字节；界面显示携带和省略数量，可取消勾选“携带最近对话”。不发送笔记、截图或整份 PDF。
- **Markdown**：回答支持标题、列表、表格、代码块与 LaTeX 公式；不执行原始 HTML，也不自动加载远程图片。来源按钮仅接受本次正文的来源 ID，可跳回对应页或选区；来源定位不等于事实核查。
- **用量报表**：在“应用设置 → 用量统计”查看近 7 / 30 / 90 天的请求状态、已知输入/输出 token、每日趋势和模型汇总。数据保存在本机；供应商未返回的用量标为未知，费用不估算。请求次数包括失败和取消的尝试，不等于供应商账单调用次数；异常退出可能留下未完成记录。
- **存储与取消**：整篇浮窗对话仅驻留内存；用户要求保存的选区翻译与问答进入 SQLite 和备份 v3。恢复时选区记录随书架替换，旧备份恢复后没有这些记录；用量仍按请求 ID 合并。删除论文会级联删除其选区记录。停止无法撤回已发送的数据或已产生的费用；程序异常退出可能留下“未完成”记录。

**私有部署配置**：在“服务类型”选择“自定义（OpenAI 兼容 / 私有部署）”。例如本机服务的 Base URL 填 `http://127.0.0.1:8000`，模型填服务端实际提供的模型 ID；局域网服务则替换成部署机器的地址。只填主机时自动补 `/v1`，最终请求 `/v1/chat/completions`；也接受 API 前缀或完整聊天接口地址。支持 HTTPS，以及本机/私有 IP/`.local` 域名的 HTTP。服务必须兼容 Chat Completions SSE 流式响应。

- 未启用鉴权时取消“服务需要 API Key”，不访问系统凭据库、不发送 Authorization；需要鉴权时再填写密钥。自定义密钥按规范化后的服务地址隔离，不沿用官方密钥。
- “请求流式 token 用量”默认关闭；支持 `stream_options.include_usage` 的服务可开启，否则用量可能未知，请求次数照常统计。
- 配置保存不测试连通性、不发起推理；发送前对话顶部显示模型，悬停可查看目标地址。修改配置后旧请求预览不会转发到新地址。

已接入 DeepSeek 官方和自定义 OpenAI 兼容服务；整篇会话持久化、PDF 文件上传、对照式全文翻译及非兼容协议的独立适配器尚未实现。

已进行离线单元测试和模拟响应的浏览器交互检查。真实供应商联调、系统凭据库端到端操作及 Windows/Linux 验收仍待完成，不代表 Phase 2A 全量验收通过。新书架、选区和历史交互可在构建后用 `node tests/preview-reading-room.mjs` 预览，仅使用合成论文与模拟响应，不访问真实资料。

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

输出在 `src-tauri/target/debug/bundle/macos/Folio Reader.app`。正式分发签名与公证仍待配置。第二版 macOS/Windows 构建命令及 GitHub Actions 操作见 [发布指南](docs/RELEASING.md)。

## 日常使用

- **书架总览**：默认按标签显示书脊，点击展开该组论文，名称书封与紧凑列表可切换；点击论文进入阅读，顶部“我的书架 / 继续阅读”切换。支持入库时间、发表年份、最近阅读、名称及升降序。默认一层分类，一篇论文可有多个标签；进入标签后可选“继续按共同标签筛选”，面包屑返回。动画遵循系统减少动态效果偏好。

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
- **备份与恢复**：顶部“备份”打开入口。创建备份时选择父文件夹，生成独立的 `paper-reader-backup-<UUID>` 目录，包含 `library.sqlite`、`papers/` 和 `manifest.json`（含草稿）。恢复时选择该完整目录，确认后替换当前书架与草稿并重新加载。恢复前自动在应用数据目录 `recovery/` 下保存当前资料；如安全备份失败则中止恢复。数据库完整性、表结构、外键及 PDF 哈希检查失败不会替换书架；数据库写入失败会回滚。PDF 路径会重建为当前机器路径，原有托管副本不清理。书架仍采用替换恢复，不支持合并导入；AI 用量记录单独按请求 ID 合并。
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
4. `0004_ai_usage.sql`：本地请求状态与可空 token 用量；不保存密钥、问题、回答或论文正文。
5. `0005_ai_records.sql`：用户要求自动保存的选区翻译/问答、来源快照和状态；跟随论文删除，备份 v3 包含，旧备份兼容。

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

## v0.1.2 第二次本地测试发版

新图标、书架、选区 AI 阅读记录与整篇问答纳入 0.1.1。执行 `npm run release:mac` 生成本机 Mac 安装包；在 Windows 上执行 `npm run release:windows` 生成 x64 NSIS 安装包。已提供 `.github/workflows/windows-build.yml`，推送到 GitHub 后可以从 Actions 手动构建 Windows 版；当前未连接远程仓库，Windows 构建与验收尚未执行。

本机交付目录为 `releases/0.1.1/`。升级方法、签名状态和原生验收范围见该目录发行说明及 [发布指南](docs/RELEASING.md)。

## v0.1.0 历史本地测试安装包

Apple Silicon Mac 的优化构建与 DMG：

```sh
CARGO_NET_OFFLINE=true npm run tauri -- build --bundles app,dmg --config '{"bundle":{"active":true}}'
```

安装包输出到 `src-tauri/target/release/bundle/dmg/`，本次交付副本和校验文件放在 `releases/0.1.0/`。请参阅该目录的《发行说明.md》。本版未完成 Developer ID 签名和公证，定位为测试版；尚未公开上传发布。
