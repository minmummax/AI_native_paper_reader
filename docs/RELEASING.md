# 第二版与跨平台构建

当前版本：**0.1.1 测试版**。应用标识仍为 `com.local.paperreader`，升级继续使用原有资料。发布前先通过应用“备份”导出资料；新版会增加 AI 用量与阅读记录表。系统凭据库中的 API Key 不在资料备份中。

## macOS Apple Silicon

在 M 系列 Mac 上安装 Node 22、Rust stable、Xcode Command Line Tools 后，在项目根目录执行：

```sh
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run release:mac -- -- --locked
```

产物位于 `src-tauri/target/release/bundle/macos/` 和 `src-tauri/target/release/bundle/dmg/`。本次交付副本在 `releases/0.1.1/`。Intel Mac 需要在 Intel 构建环境单独构建或准备 universal 所需的两个 Rust target，不能直接使用 Apple Silicon 包。

当前未配置 Developer ID 签名及公证，包仅用于受控测试。正式外部分发需按 [Tauri macOS 签名文档](https://v2.tauri.app/distribute/sign/macos/) 配置证书与公证。

## Windows：推荐 GitHub Actions

Windows 使用同一套源码，无需再写一个前端。当前工作流构建 **Windows 10/11 x64** 的 NSIS `-setup.exe`；ARM64/32 位不在本次验证范围。Mac 上的普通 `tauri build` 生成的是 Mac 应用；Windows 原生 runner 可避免交叉编译工具链差异。参见 [Tauri Windows 安装包文档](https://v2.tauri.app/distribute/windows-installer/)。

1. 将完整项目提交并推送到自己的 GitHub 仓库（包含新代码、迁移、图标、锁文件及 `.github/workflows/windows-build.yml`，不包含 node_modules、target 或本机资料）。当前本地仓库尚未设置 remote。
2. 在仓库 **Actions → Windows installer → Run workflow** 选择要构建的分支并启动。工作流文件先进入默认分支，GitHub 才显示手动运行入口。
3. 流程自动准备 Node、Python、Rust，执行 JS/Python/Rust 回归测试，再构建 Windows 安装包。
4. 成功后在该次运行的 **Artifacts** 下载 `paper-reader-windows-x64-…`。解压即可获得 `.exe` 和 `SHA256SUMS.txt`。默认保留 30 天。
5. 在一台 Windows 测试机完成下方验收后，将 `.exe`、校验文件与发行说明添加到 GitHub Release，选择 `v0.1.1`。也可先推送 `v0.1.1` 标签触发同一构建流程；标签版本必须与配置一致。

工作流仅上传构建产物，不自动创建公开 Release。当前环境没有 Windows runner，也没有配置 GitHub remote，因此本地准备完成不等于 Windows 构建或验收已通过。

### Windows 本机编译

安装 Node 22、Rust stable（MSVC 工具链）、Visual Studio 2022 Build Tools 的“使用 C++ 的桌面开发”（含 Windows SDK），以及 Python 3（用于测试）。这些工具只在开发/构建机器上需要，最终用户只安装 `.exe`。

在项目根目录的 PowerShell 执行：

```powershell
rustup target add x86_64-pc-windows-msvc
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run release:windows -- -- --locked
```

产物目录：`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`。

`src-tauri/tauri.windows.conf.json` 会由 Tauri 自动合并：安装界面提供简体中文/英文，默认安装到当前用户。WebView2 使用 **offlineInstaller**，构建时下载运行时并嵌入安装包，安装包较大，但用户安装时无需再联网下载 WebView2。首次构建仍需要联网下载 npm/crates、NSIS 和 WebView2。

尚未配置 Windows 代码签名，测试包可能出现未知发布者/SmartScreen 提示。正式分发请配置 [Windows 代码签名](https://v2.tauri.app/distribute/sign/windows/)，不能把成功打包等同于已签名或已获信誉。

## 每个平台的发布验收

- 从上一版备份，升级安装，确认论文、标签、标注、笔记和阅读位置保留。
- 导入中文路径的 PDF；阅读、正文搜索及关闭搜索栏；关闭窗口后重启，确认数据持久化。
- 创建多标签，书架筛选、排序、打开论文；验证高亮/笔记恢复。
- 备份后恢复，确认托管 PDF、AI 阅读记录及笔记一致；取消恢复不更改现有数据。
- 配置实际供应商或私有模型；验证凭据保存/删除、流式响应、停止、Markdown、用量及引用定位。
- 卸载/重新安装的资料保留行为，以及原生文件对话框、窗口关闭行为。

自动化测试覆盖数据库迁移、SQLite 持久化、备份恢复和阅读上下文等逻辑，不能替代上述原生交互验收。未完成的平台应继续标记测试版。

## 图标

源图：`assets/branding/paper-reader.png`；桌面运行资源：`src-tauri/icons/`。修改源图后用 `npm run tauri -- icon assets/branding/paper-reader.png --output <临时输出目录>` 生成，复制桌面 PNG/ICO/ICNS 到 icons。无需提交移动平台图标。

下次发版时同步更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 和 `src-tauri/tauri.conf.json` 的应用版本。
