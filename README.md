# Claude Tool

基于 Electron 33 + React 19 + Vite 6 的桌面应用，管理 Claude Code 项目。

## 功能

- **项目管理**：添加、切换、搜索、标签分类、状态管理
- **Claude 会话扫描**：自动发现本地 Claude Code 会话并一键导入
- **集成终端**：node-pty + xterm.js，内置 Claude CLI，支持右键粘贴和 Ctrl+Shift+C/V
- **文件管理器**：懒加载文件树、搜索过滤、隐藏文件切换、右键菜单（新建/重命名/删除）、fs.watch 文件监控
- **代码编辑器**：CodeMirror 6，多标签编辑，语法高亮（JS/TS/CSS/HTML/JSON/MD/Python），主题切换
- **会话管理**：查看和浏览 Claude Code 会话历史，按时间排序
- **设置管理**：声明式配置 UI，支持全局/项目级 Claude settings、环境变量、权限规则、CLAUDE.md、rules 文件编辑
- **数据备份**：导出/导入项目配置和会话数据
- **安全**：生产环境 CSP header，文件操作限制在已注册项目路径内

## 开发

```bash
npm install
npm run dev      # 开发模式（Vite + Electron concurrently）
npm run build    # Vite 构建 → dist/
npm run dist     # 构建 + electron-builder 打包
```

## 技术栈

- Electron 33 / React 19 / Vite 6
- CodeMirror 6（代码编辑）
- node-pty + xterm.js（终端）
- TypeScript

## 许可证

[AGPL-3.0](LICENSE)
