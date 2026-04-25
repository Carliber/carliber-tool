import { useEffect, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useApp } from '../context/AppContext';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

const activeSessions = new Set<string>();

let claudeActive = false;
let lastBusySignal = 0;
const BUSY_TIMEOUT = 3000;

const CLAUDE_ACTIVE_PATTERN = /Claude.*Code|claude.*v\d/i;
const CLAUDE_PROMPT_PATTERN = /❯/;
const SHELL_PROMPT_PATTERN = /(?:\$\s|[#$>]\s*$)/;
const BUSY_PATTERN = /Processing|Thinking|Reading|Generating|analyzing|tool use/i;

function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[[\?][0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[^[\]()]?[A-Za-z0-9]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '');
}

export function isClaudeActive() {
  return claudeActive;
}

export function isClaudeBusy() {
  return claudeActive && (Date.now() - lastBusySignal < BUSY_TIMEOUT);
}

export function switchToSession(projectId: string, sessionId: string, cliPath: string) {
  if (claudeActive) {
    // Escape to cancel/dismiss, then send /resume command inside Claude
    window.electronAPI.writeTerminal(projectId, '\x1b');
    window.electronAPI.writeTerminal(projectId, `/resume ${sessionId}\r\n`);
  } else {
    // Shell idle, start Claude with --resume
    window.electronAPI.writeTerminal(projectId, `${cliPath} --resume ${sessionId}\r\n`);
  }
}

function detectClaudeState(data: string) {
  const stripped = stripAnsi(data);
  if (CLAUDE_ACTIVE_PATTERN.test(stripped) || CLAUDE_PROMPT_PATTERN.test(data)) {
    claudeActive = true;
  }
  if (BUSY_PATTERN.test(stripped)) {
    lastBusySignal = Date.now();
  }
  if (SHELL_PROMPT_PATTERN.test(stripped) && !CLAUDE_PROMPT_PATTERN.test(data) && !CLAUDE_ACTIVE_PATTERN.test(stripped)) {
    claudeActive = false;
    lastBusySignal = 0;
  }
}

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
        fontFamily: '"Cascadia Mono", Consolas, Menlo, "DejaVu Sans Mono", "Liberation Mono", monospace',
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
      requestAnimationFrame(() => { if (!cancelled) fitAddon.fit(); });
      if (cancelled) return;

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

      const onDataCallback = (sessionId: string, data: string) => {
        if (sessionId === projectId) {
          term.write(data);
          touchSessionTime();
          detectClaudeState(data);
        }
      };

      if (activeSessions.has(projectId)) {
        const removeListener = window.electronAPI.onPtyData(onDataCallback);
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
        const removeListener = window.electronAPI.onPtyData(onDataCallback);
        term.onData(data => window.electronAPI.writeTerminal(projectId, data));
        term.onResize(({ cols, rows }) => window.electronAPI.resizeTerminal(projectId, cols, rows));

        if (state.settings.claudeCliPath) {
          window.electronAPI.writeTerminal(project.id, `${state.settings.claudeCliPath}\r\n`);
        }

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

  useEffect(() => {
    if (fitAddonRef.current) {
      const timer = setTimeout(() => fitAddonRef.current?.fit(), 100);
      return () => clearTimeout(timer);
    }
  }, [state.activePage]);

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
