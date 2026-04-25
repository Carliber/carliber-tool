import React, { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useApp } from '../context/AppContext';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

// Track which sessions already have a pty, survive remounts
const activeSessions = new Set<string>();

export default function TerminalPanel() {
  const { state, updateProject } = useApp();
  const project = state.projects.find((p) => p.id === state.currentProjectId);
  const termRef = useRef<HTMLDivElement>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastSessionUpdateRef = useRef(0);

  const touchSessionTime = () => {
    const now = Date.now();
    if (now - lastSessionUpdateRef.current < 60000) return;
    lastSessionUpdateRef.current = now;
    if (project) {
      updateProject({ ...project, updatedAt: new Date().toISOString() });
    }
  };

  useEffect(() => {
    if (!termRef.current || !project) return;
    const projectId = project.id;

    let cancelled = false;
    const initTerminal = async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      if (cancelled) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: state.settings.terminalFontSize || 14,
        fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
        lineHeight: 1.15,
        letterSpacing: 0,
        scrollOnUserInput: true,
        convertEol: true,
        allowProposedApi: true,
        scrollback: 3000,
        theme: {
          background: '#0c0c0c',
          foreground: '#cccccc',
          cursor: '#cccccc',
          selectionBackground: '#264f78',
          black: '#0c0c0c',
          red: '#c50f1f',
          green: '#13a10e',
          yellow: '#c19c00',
          blue: '#0037da',
          magenta: '#881798',
          cyan: '#3a96dd',
          white: '#cccccc',
          brightBlack: '#767676',
          brightRed: '#e74856',
          brightGreen: '#16c60c',
          brightYellow: '#f9f1a5',
          brightBlue: '#3b78ff',
          brightMagenta: '#b4009e',
          brightCyan: '#61d6d6',
          brightWhite: '#f2f2f2',
        },
      });

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      termRefForFontSize.current = term;
      term.loadAddon(fitAddon);
      term.open(termRef.current!);
      // Delayed fit — container may not have final dimensions yet
      requestAnimationFrame(() => { if (!cancelled) fitAddon.fit(); });
      if (cancelled) return;

      // Right-click paste, Ctrl+Shift+C/V copy/paste
      termRef.current!.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
        } else {
          navigator.clipboard.readText().then(text => {
            if (text) window.electronAPI.writeTerminal(projectId, text);
          });
        }
      });
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
          if (term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); term.clearSelection(); }
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'V') {
          navigator.clipboard.readText().then(text => { if (text) window.electronAPI.writeTerminal(projectId, text); });
          return false;
        }
        return true;
      });

      const resizeObserver = new ResizeObserver(() => fitAddon.fit());
      resizeObserver.observe(termRef.current!);

      // Only create pty if not already running
      if (activeSessions.has(projectId)) {
        // Reconnect data listener for existing pty
        const removeListener = window.electronAPI.onPtyData((sessionId: string, data: string) => {
          if (sessionId === projectId) { term.write(data); touchSessionTime(); }
        });
        term.onData(data => window.electronAPI.writeTerminal(projectId, data));
        term.onResize(({ cols, rows }) => window.electronAPI.resizeTerminal(projectId, cols, rows));
        return () => {
          removeListener();
          resizeObserver.disconnect();
          term.dispose();
        };
      }

      const { cols, rows } = term;
      try {
        const ok = await window.electronAPI.createTerminal(project.id, project.path, cols, rows);
        if (!ok) {
          term.writeln('\x1b[31m终端创建失败 - pty spawn 失败\x1b[0m');
          term.writeln('请确认 node-pty 已正确安装');
          term.write('$ ');
          term.onData(data => {
            if (data === '\r') { term.writeln(''); term.write('$ '); }
            else term.write(data);
          });
          return () => { resizeObserver.disconnect(); term.dispose(); };
        }
        activeSessions.add(projectId);
        const removeListener = window.electronAPI.onPtyData((sessionId: string, data: string) => {
          if (sessionId === projectId) { term.write(data); touchSessionTime(); }
        });
        term.onData(data => window.electronAPI.writeTerminal(projectId, data));
        term.onResize(({ cols, rows }) => window.electronAPI.resizeTerminal(projectId, cols, rows));

        if (state.settings.claudeCliPath) {
          window.electronAPI.writeTerminal(project.id, `${state.settings.claudeCliPath}\r\n`);
        }

        // Listen for PTY exit to clean up
        const removeExitListener = window.electronAPI.onPtyExit((sessionId: string) => {
          if (sessionId === projectId) activeSessions.delete(sessionId);
        });

        return () => {
          removeListener();
          removeExitListener();
          resizeObserver.disconnect();
          term.dispose();
        };
      } catch {
        term.writeln('终端初始化失败 - node-pty 未安装');
        term.writeln('请运行: npm install node-pty && npm run rebuild');
        term.writeln('');
        term.write('$ ');
        term.onData(data => {
          if (data === '\r') {
            term.writeln('');
            term.write('$ ');
          } else {
            term.write(data);
          }
        });
      }
    };

    const cleanup = initTerminal();
    return () => { cancelled = true; cleanup.then(fn => fn && fn()); };
  }, [project?.id]);

  // Fit terminal when layout changes
  useEffect(() => {
    if (fitAddonRef.current) {
      const timer = setTimeout(() => fitAddonRef.current?.fit(), 100);
      return () => clearTimeout(timer);
    }
  }, [state.activePage]);

  // Update terminal font size dynamically
  const termRefForFontSize = useRef<XTermTerminal | null>(null);
  useEffect(() => {
    if (termRefForFontSize.current) {
      termRefForFontSize.current.options.fontSize = state.settings.terminalFontSize || 14;
      fitAddonRef.current?.fit();
    }
  }, [state.settings.terminalFontSize]);

  if (!project) return <div>未选择项目</div>;

  return (
    <div className="terminal-container">
      <div ref={termRef} className="terminal-panel" />
    </div>
  );
}
