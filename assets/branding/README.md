# Folio Reader 图标源文件

`paper-reader.png` 是本项目应用图标源图，由内置 image_gen 工具生成（非 CLI）。透明外边缘、墨绿色圆角底、暖白书页、珊瑚色书签、黄色高亮，对应阅读、整理和标注功能。

图标不含应用名称，继续用于 Folio Reader，无需因更名而重绘。下方保留原始生成提示词作为来源记录。

原始生成提示词：

> Use case: logo-brand. Create a production desktop app icon for a local academic Paper Reader and research assistant. Single centered icon, square 1024x1024 canvas, actual transparent background outside the icon. A premium rounded-square deep forest teal tile with subtle refined dimensional shading; on it a large warm ivory academic paper/page with a gently folded upper corner, two or three simple thick typeset-line marks, a muted golden yellow highlighted line and a slim coral bookmark ribbon. The page silhouette should also gently suggest a book. Modern macOS productivity app aesthetic, restrained, warm, scholarly, polished crisp geometric edges, clean bold shapes legible at 32px. No letters, no words, no robot, no magnifying glass, no tiny ornaments, no additional surrounding objects or mockup. Fill about 85% of the canvas, centered, balanced. Deliver just the icon artwork.

通过 Tauri icon 命令转换为 `src-tauri/icons/` 中的桌面 PNG、ICO 和 ICNS。生成器实际输出尺寸由源 PNG 决定，Tauri 再重采样为平台需要的尺寸。
