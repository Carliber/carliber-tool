# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # Vite dev server + Electron (concurrently)
npm run build   # Vite build → dist/
npm run dist    # Build + electron-builder 打包
```

无测试框架、无 linter 配置。`vite build` 是唯一验证手段。

## Architecture

**Electron 33 + React 19 + Vite 6** 桌面应用，管理 Claude Code 项目。

### 双进程

- **Main** (`electron/main.js`)：BrowserWindow 管理、Tray、生命周期。纯 CommonJS。
- **IPC 模块** (`electron/ipc/`)：按领域拆分的 IPC handler 注册。`config.js`、`projects.js`、`claude-settings.js`、`sessions.js`、`system.js`、`files.js`、`windows.js`、`pty.js`。每个模块导出 `register(ipcMain)` 函数。
- **Shared** (`electron/shared.js`)：数据目录常量、JSON 读写（atomicWrite）、规则文件操作、项目缓存、日志工具。所有 IPC 模块共享。
- **Renderer** (`src/`)：React SPA，通过 `window.electronAPI` (contextBridge) 与 Main 通信。
- **PTY** (`electron/pty.js`)：node-pty 封装，spawn cmd.exe，通过 IPC 事件转发数据到 xterm.js。

### 路由

无 React Router。`window.location.hash` 驱动三个入口：
- `#project-selector` → `<ProjectSelector />`（独立窗口）
- `#claude-settings` → `<ClaudeSettings />`（独立窗口）
- `#workspace/{id}` → `<AppProvider><Workspace /></AppProvider>`
- 默认 → `<AppProvider><Hub /></AppProvider>`（空启动页）

### 数据层

- **AppConfig / Projects**：JSON 文件存储在 `%USERPROFILE%/.claude-tool-electron/`。`atomicWrite` 模式（写 .tmp → rename）。
- **Claude Settings**：读写 `~/.claude/settings.json` 和项目级 `.claude/settings.json`。
- **Storage 工具** (`src/utils/storage.ts`)：通过 IPC 调用 Main 进程的文件操作。
- **格式化工具** (`src/utils/format.ts`)：时间格式化等纯函数。
- **AppContext** (`src/context/AppContext.tsx`)：useReducer + Context，管理项目列表、当前项目、配置、activePage。

### 组件缓存

Workspace 内编辑器实例用 `display: none/contents` 切换，不销毁 CodeMirror DOM。右侧手风琴区域用 `toggleSection` 独立展开/折叠，不影响面板显隐。

### 类型定义

`src/types/electron.d.ts`：`Project`、`AppConfig`、`ClaudeSession`、`SessionMessage`、`ScannedProject`、`ElectronAPI` 接口。`window.electronAPI` 挂在全局。

### IPC 通道

preload.js 暴露 ~50 个方法，覆盖：配置 CRUD、项目 CRUD、窗口控制、弹窗管理、PTY 终端、Claude settings、会话查询、项目 rules/CLAUDE.md 管理、文件 CRUD（createFile/createDir/renamePath/deletePath）、文件监控（watchDir/unwatchDir + fs-change 事件）、备份导入导出。

所有文件操作通过 `isPathAllowed()` 限制在已注册项目路径内。

### Claude Settings 面板

`src/components/settings/`：声明式配置 UI。`config-spec.ts` 定义字段规格（类型、分组、选项），`tab-configs.ts` 按 tab 聚合，`ConfigItem.tsx` 根据规格渲染控件。包含 GeneralTab、ClaudeGlobalConfigTab、PermissionsTab、RulesEditor、ProjectTab、InstructionsTab。

### 文件管理器

- **FileTree** (`src/components/FileTree.tsx`)：懒加载树、搜索过滤、右键菜单（新建/重命名/删除）、内联重命名、显示隐藏文件开关。
- **多标签编辑**：`openFiles[]` + `activeFileIndex` 状态管理，`display: none/contents` 切换保持 CodeMirror 实例。
- **文件监控**：`fs.watch({ recursive: true })` + 200ms debounce，过滤 IGNORED_DIRS。
- **路径工具**：`pathSep()`、`parentDir()`、`getExt()` 内联于 FileTree（渲染进程无法使用 Node path 模块）。

### 面板布局

Workspace 三栏布局：左侧 Sidebar（可拖动调整宽度）+ 中间主区域（终端 + 编辑器叠加）+ 右侧信息面板（可拖动）。拖动分割条 `resize-bar`，菜单栏按钮控制显隐。

## Design System

所有前端视觉变更**必须**遵循 `.claude/DESIGN.md`。核心约束：

- 背景 Parchment `#f5f4ed`，品牌色 Terracotta `#c96442`
- 暖色调中性色，禁止冷蓝灰
- 标题 Serif (Georgia weight 500)，UI Sans (Arial/system-ui)
- Ring shadow `0px 0px 0px 1px`，圆角 6–16px
- 行高正文 1.60，标题 1.10–1.30
