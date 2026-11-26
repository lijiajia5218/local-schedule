# 本地日程 · LocalSchedule

轻量级本地日程管理桌面客户端（支持 **macOS + Windows**），基于 **Tauri 2 + Vue 3 + TypeScript + Pinia + SQLite (`rusqlite`)** 构建。数据完全存储在本地，不依赖账号与网络。

## 核心特性（v0.4）

- **Nordic Warm Paper 浅色界面与精致品牌图标**：
  - 采用温润纸感浅色系（`#F6F5F1` 画布 + 纯白浮起卡片 + 雾霭灰蓝、鼠尾草绿与暖琥珀低饱和三色语义搭配），顶栏毛玻璃分段控件与周/日完成度微型进度条。
  - 全套跨平台应用图标遵循 macOS HIG Squircle 安全区与 Windows 多尺寸图层规范（`16–256px` `.ico` / `.icns`）。
- **多周流式周视图（未来周在上、过去周在下）**：
  - 默认展示下周、本周、上周共 3 周（未来周硬上限为 1 周，启动即聚焦本周），支持向底部加载更早历史周。
  - **周末折叠与自适应展宽**：默认聚焦周一至周五，列宽更充裕；最右侧保留竖向「周末」窄提示条（带周末记录数徽标），支持点击单独展开某一周或顶栏一键切换 `5天 / 7天`（周末当天自动展开本周）。
  - 待办区与备忘区水平虚线横跨全部可见列严格对齐。
- **单日精读日视图**：点击任意日期列头下钻至日视图，查看当日任务完成进度，文档化编辑日程与备忘。
- **纯文档化交互、拖拽排序与绿色完成态**：
  - **点击空白处自动预填**：待办与周重点自动预填 `【】`，备忘自动预填 `- `；未输入内容直接失焦或 `Esc` 静默收起。
  - **严格双击原地单行编辑**：双击任意待办、备忘或周重点直接原地变为单行文本，`Enter` / 失焦保存，`Esc` 还原，清空后按 `Enter` 删除并进 5 秒撤销队列。
  - **完成态与鼠标拖拽排序**：待办与周重点支持点击复选框或悬停完成按钮标记完成（鼠尾草绿填充勾选 + 文字时间删除线置灰），支持指针拖拽调整周重点、待办与备忘顺序并持久化至 SQLite。
  - **提交时再校验与点分时间**：输入过程完全静音（无实时爆红与预览跳动），仅在提交非法格式时轻提示，统一语法支持：
    - **日待办**：`【】9-10｜周会`、`【x】10:30-11:30|评审`、`10.30-11.45｜沟通`（支持半角 `|` / 全角 `｜`、`：` / `.` / `－`），按起始时间自动排序。
    - **日备忘**：`- 会议纪要与跟进`（必须以 `- ` 或 `－ ` 开头）。
    - **周重点**：`【】任务名 @目标时间 - 状态备注`（也支持 `（时间）` 与 `//备注`）。
- **本地存储、导出与跨端自动更新**：
  - SQLite 单文件存储（macOS 默认 `~/Documents/本地日程/data.sqlite`，Windows 默认 `%USERPROFILE%\Documents\本地日程\data.sqlite`），支持修改数据目录并自动搬迁。
  - 支持导出结构化周报形态的 Markdown 文档、全量 JSON 备份以及覆盖式 JSON 恢复。
  - 内置 `tauri-plugin-updater` 自动检查与原地更新（支持 macOS 与 Windows NSIS 客户端），推送 `v*` 标签由 GitHub Actions 自动双端编译发布。

## 目录结构

```text
.
├── .github/workflows/  # GitHub Actions 自动构建与 Release 发布工作流
├── scripts/            # macOS 本地快速覆盖升级脚本 (upgrade-mac.sh)
├── src/                # Vue 3 + TypeScript + Pinia 前端源码
│   ├── core/           # 日期计算、时间与文档语法解析、Markdown 导出及单元测试
│   ├── services/       # Tauri 命令调用与浏览器 LocalStorage 预览适配层
│   ├── stores/         # Pinia 多周状态管理、更新状态与集成测试
│   ├── composables/    # 指针拖拽排序等前端交互组合式函数
│   ├── components/     # 周/日视图、文档式行内编辑器、导出与设置弹窗
│   └── styles/         # 设计令牌与基础样式
├── src-tauri/          # Tauri 2.x Rust 后端（SQLite 仓储、导出服务、自动更新配置与多平台图标）
├── doc/                # 本地设计文档目录（不纳入 Git 追踪）
└── temp/               # 本地测试报告与临时文档目录（不纳入 Git 追踪）
```

## 快速开始

### 1. 浏览器界面预览

```bash
npm install
npm run dev
```

访问 `http://localhost:1420` 即可完整预览与交互（自动使用 `localStorage` 持久化并预置示例数据）。

### 2. 类型检查、单元测试与前端构建

```bash
npm run typecheck
npm test
npm run build
```

### 3. macOS 桌面应用运行与本地升级（需 Rust 工具链）

```bash
npm run tauri dev
npm run tauri build
npm run upgrade:mac   # 编译并原地覆盖 /Applications/本地日程.app
```

### 4. Windows x64 构建与自动发布

- 本地调试构建：需安装 Rust MSVC 工具链、Visual Studio C++ Build Tools 与 WebView2，执行 `npm run build:windows` 生成简体中文 `currentUser` 模式 NSIS 安装包。
- 自动发版：推送 `v*` 标签（如 `git tag v0.4.0 && git push origin v0.4.0`）触发 `.github/workflows/release.yml` 并行打包 macOS 与 Windows 产物及签名清单 `latest.json`。
