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
- **PTY** (`electron/pty.js`)：node-pty 封装，spawn `COMSPEC`（Windows）或 `$SHELL`（Linux/Mac），通过 IPC 事件转发数据到 xterm.js。

### 路由

无 React Router。`window.location.hash` 驱动三个入口：
- `#project-selector` → `<ProjectSelector />`（独立窗口）
- `#claude-settings` → `<ClaudeSettings />`（独立窗口）
- `#workspace/{id}` → `<AppProvider><Workspace /></AppProvider>`
- 默认 → `<AppProvider><Hub /></AppProvider>`（空启动页）

### 数据层

- **AppConfig / Projects**：JSON 文件存储在 `~/.claude-tool-electron/`（由 `shared.js` 的 `DATA_DIR` 常量定义）。`atomicWrite` 模式（写 .tmp → rename）。
- **Claude Settings**：读写 `~/.claude/settings.json`、`settings.local.json` 和项目级 `.claude/settings.json`。
- **会话数据**：`sessions.js` 读取 `~/.claude/projects/` 下的 `.jsonl` 文件，使用 `claudeDirCache` Map 缓存目录查找结果。
- **Storage 工具** (`src/utils/storage.ts`)：通过 IPC 调用 Main 进程的文件操作。
- **格式化工具** (`src/utils/format.ts`)：`formatTime(iso)` 相对时间显示（中文："刚刚"、"X分钟前"）。
- **AppContext** (`src/context/AppContext.tsx`)：useReducer + Context，管理项目列表、当前项目、配置、activePage。

### 组件缓存

Workspace 内编辑器实例用 `display: none/contents` 切换，不销毁 CodeMirror DOM。右侧手风琴区域用 `toggleSection` 独立展开/折叠，不影响面板显隐。

### 类型定义

`src/types/electron.d.ts`：`Project`、`AppConfig`（含 closeAction、uiFontSize、editorFontSize、terminalFontSize、treeFontSize、rightPanelOpen、beautifyTerminal）、`ClaudeSession`、`SessionMessage`、`ScannedProject`、`FileEntry`、`ChatMessage`、`FileContent`、`ClaudeSettings`、`ElectronAPI` 接口。`window.electronAPI` 挂在全局。

### IPC 通道

preload.js 暴露 ~50 个方法，覆盖：配置 CRUD、项目 CRUD、窗口控制、弹窗管理、PTY 终端、Claude settings、会话查询、项目 rules/CLAUDE.md 管理、文件 CRUD（createFile/createDir/renamePath/deletePath）、文件监控（watchDir/unwatchDir + fs-change 事件）、备份导入导出。

所有文件操作通过 `isPathAllowed()` 限制在已注册项目路径内。Windows/Mac 上路径匹配不区分大小写。文件读取有 2MB (`MAX_FILE_SIZE`) 上限。

### Claude Settings 面板

`src/components/settings/`：声明式配置 UI。`config-spec.ts` 定义字段规格（类型、分组：core/display/advanced），`ENV_SPEC` 定义 ~16 个环境变量编辑项。`tab-configs.ts` 按 tab 聚合，`ConfigItem.tsx` 根据规格渲染控件。包含 GeneralTab、ClaudeGlobalConfigTab、PermissionsTab、RulesEditor、ProjectTab、InstructionsTab。

### 文件管理器

- **FileTree** (`src/components/FileTree.tsx`)：懒加载树、搜索过滤、右键菜单（新建/重命名/删除）、内联重命名、显示隐藏文件开关。
- **多标签编辑**：`openFiles[]` + `activeFileIndex` 状态管理，`display: none/contents` 切换保持 CodeMirror 实例。
- **文件监控**：`fs.watch({ recursive: true })` + 200ms debounce，过滤 IGNORED_DIRS。
- **路径工具**：`pathSep()`、`parentDir()`、`getExt()` 内联于 FileTree（渲染进程无法使用 Node path 模块）。

### 面板布局

Workspace 三栏布局：左侧 Sidebar（可拖动调整宽度）+ 中间主区域（终端 + 编辑器叠加）+ 右侧信息面板（可拖动）。拖动分割条 `resize-bar`，菜单栏按钮控制显隐。`rightPanelOpen` 状态持久化到 AppConfig。

### ClaudeChat

`src/components/ClaudeChat.tsx`：美化终端视图，由 `beautifyTerminal` 配置项控制（默认启用）。启用时替代原始 xterm 终端，以聊天气泡样式展示 Claude 会话。

### 多标签编辑器

`openFiles[]` + `activeFileIndex` 状态管理。设置面板（app-settings、claude-global）作为虚拟文件条目 `__virtual__::${kind}` 加入标签系统，不经过文件系统。

### 运行时安全

- `main.js` 在生产模式设置 Content-Security-Policy
- `app.requestSingleInstanceLock()` 确保单实例运行
- 渲染进程错误通过 `window.onerror` + `unhandledrejection` 捕获，经 `renderer-error` IPC 通道发送到 Main 进程写日志
- 日志系统：`shared.js` 实现 `~/.claude-tool-electron/app.log`，512KB 自动轮转

### 启动行为

启动时过滤磁盘上已不存在的项目路径（stale cleanup）。若有项目，自动打开最近使用的项目窗口并隐藏主窗口。

### 跨平台

- Linux：`--ozone-platform=x11` + `--enable-features=ImeV2` 支持 IME 输入
- `start.sh` 辅助脚本支持 dev/build/dist/clean，检查 Node >= 18
- `electron-builder.json` 配置 Windows (NSIS)、Mac (DMG)、Linux (AppImage)

## Design System

所有前端视觉变更**必须**遵循 `.claude/DESIGN.md`。核心约束：

- 背景 Parchment `#f5f4ed`，品牌色 Terracotta `#c96442`
- 暖色调中性色，禁止冷蓝灰
- 标题 Serif (Georgia weight 500)，UI Sans (Arial/system-ui)
- Ring shadow `0px 0px 0px 1px`，圆角 6–16px
- 行高正文 1.60，标题 1.10–1.30
