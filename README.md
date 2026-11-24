# 本地日程 · LocalSchedule

轻量级本地日程管理桌面客户端（macOS 优先，兼顾未来 Windows 兼容），基于 **Tauri 2 + Vue 3 + TypeScript + Pinia + SQLite (`rusqlite`)** 构建。数据完全存储在本地，不依赖账号与网络。

## MVP 功能（v0.2）

- **多周流式周视图（未来周在上、过去周在下）**：
  - 支持展示连续多周（默认展示后两周、下周、本周、上周），并支持向顶部加载未来周、向底部加载更早周。
  - 每周完整覆盖周一至周日 7 天（周末同等支持录入与勾选），日程区与备忘区水平分割线横跨七天对齐。
- **单日精读日视图**：点击任意日期列头下钻至日视图，查看当日任务完成进度，精细编辑日程与备忘。
- **文档式空白点击录入与统一语法**：
  - 点击空白处直接输入，禁止裸纯文本：
    - **日待办**：`【】9-10｜周会`、`【x】10:30-11:30|评审`（支持半角 `|` / 全角 `｜` 与 `：` / `－`），按起始时间自动排序。
    - **日备忘**：`- 会议纪要与跟进`（必须以 `- ` 或 `－ ` 开头）。
    - **周重点**：`【】任务名 @目标时间 - 状态备注`（也支持 `（时间）` 与 `//备注`）。
  - 同时提供分字段表单切换，支持双击原位编辑与 5 秒删除撤销窗口。
- **本地存储与导入导出**：
  - SQLite 单文件存储（macOS 默认 `~/Documents/本地日程/data.sqlite`，Windows 兼容 `%USERPROFILE%\Documents\本地日程\data.sqlite`），支持修改数据目录并自动搬迁。
  - 支持导出结构化周报形态的 Markdown 文档、全量 JSON 备份以及覆盖式 JSON 恢复。

## 目录结构

```text
.
├── src/                # Vue 3 + TypeScript + Pinia 前端源码
│   ├── core/           # 日期计算、时间与文档语法解析、Markdown 导出及单元测试
│   ├── services/       # Tauri 命令调用与浏览器 LocalStorage 预览适配层
│   ├── stores/         # Pinia 多周状态管理、5 秒撤销队列与集成测试
│   ├── components/     # 周/日视图、文档式行内编辑器、导出与设置弹窗
│   └── styles/         # 设计令牌与基础样式
├── src-tauri/          # Tauri 2.x Rust 后端（SQLite 仓储、时间解析、导出服务、多平台图标）
├── doc/                # 本地设计文档目录（不纳入 Git 追踪）
└── temp/               # 本地测试报告与临时文档目录（不纳入 Git 追踪）
```

## 快速开始

### 1. 浏览器界面预览

```bash
npm install
npm run dev
```

访问 `http://localhost:1420` 即可完整预览与交互（自动使用 `localStorage` 持久化并预置多周示例数据）。

### 2. 类型检查、单元测试与前端构建

```bash
npm run typecheck
npm test
npm run build
```

### 3. macOS 桌面应用运行与打包（需 Rust 工具链）

```bash
# 如尚未安装 Rust：
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

npm run tauri dev
npm run tauri build
```
