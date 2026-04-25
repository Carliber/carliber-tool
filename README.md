# Claude Tool

一个基于 Electron 33 + React 19 + Vite 6 的桌面应用，用于管理 Claude Code 项目。

## 功能

- **项目管理**：添加、切换、管理多个 Claude Code 项目
- **集成终端**：node-pty + xterm.js，内置 Claude CLI
- **文件管理器**：文件树、搜索过滤、右键菜单（新建/重命名/删除）、文件监控
- **代码编辑器**：CodeMirror 6，多标签编辑，语法高亮
- **会话管理**：查看和浏览 Claude Code 会话历史
- **设置管理**：全局和项目级 Claude settings 编辑

## 开发

```bash
npm install
npm run dev      # 开发模式（Vite + Electron）
npm run build    # 构建
npm run dist     # 打包安装程序
```

## 技术栈

- Electron 33 / React 19 / Vite 6
- CodeMirror 6（代码编辑）
- node-pty + xterm.js（终端）
- TypeScript

## 许可证

[AGPL-3.0](LICENSE)
