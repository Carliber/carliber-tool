# carliber-tool

基于 Tauri 2 + React 19 + Rust 的桌面应用，作为 omp CLI 的图形前端，内嵌 Warp 风格的 Block 终端，并支持多 agent 项目配置编辑。

## 功能

- **项目管理**：添加、切换、搜索、标签分类、状态管理
- **omp 会话扫描**：自动发现本地 omp 会话并一键导入（读取 `~/.omp/agent/sessions/`）
- **Warp 风格 Block 终端**：命令/输出分块显示、CodeMirror 输入框、AI 命令搜索、历史搜索（Ctrl-R）、Workflow 复用
- **文件管理器**：懒加载文件树、搜索过滤、隐藏文件切换、右键菜单（新建/重命名/删除）、文件监控（notify）
- **代码编辑器**：CodeMirror 6，多标签编辑，语法高亮（JS/TS/CSS/HTML/JSON/MD/Python），主题切换
- **会话管理**：查看和浏览 omp 会话历史，按时间排序
- **多 agent 配置编辑**：项目配置面板顶部 agent 选择器（omp / Claude / Codex / Gemini / GitHub Copilot），切换后编辑对应工具的项目配置文件
- **数据备份**：导出/导入项目配置和会话数据
- **安全**：文件操作限制在已注册项目路径内

## 开发

```bash
npm install
npm run dev      # 开发模式（Vite + Tauri）
npm run build    # 构建生产二进制
```

### 依赖

- Node.js 18+
- Rust toolchain（stable）+ Tauri 2 CLI
- omp CLI（`%LOCALAPPDATA%\omp\omp.exe` 或 PATH）

## 数据目录

- 应用数据：`~/.carliber-tool/`（config.json、data/projects.json、workflows.json、history.json、app.log）
- omp 会话：`~/.omp/agent/sessions/<dir-encoded>/`（尊重 `PI_CODING_AGENT_DIR` 环境变量）

## 技术栈

- Tauri 2 / React 19 / Vite 6
- Rust 后端（portable-pty、notify、serde）
- CodeMirror 6（代码编辑 + 终端输入）
- TypeScript

## 许可证

[AGPL-3.0](LICENSE)
