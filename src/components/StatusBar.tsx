import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { BUSY_TIMEOUT } from '../hooks/useClaudeState';
import * as api from '../lib/tauri-api';

interface ToolCount { read: number; edit: number; bash: number; write: number }
interface StatusState {
  model: string;
  mode: string;
  status: 'idle' | 'thinking' | 'processing' | 'waiting' | 'error';
  statusText: string;
  cwd: string;
  gitBranch: string;
  gitDirty: boolean;
  toolCount: ToolCount;
  sessionStart: number;
  contextPercent: number;
  contextUsed: number;
  contextTotal: number;
}

const STATUS_PATTERNS: [RegExp, StatusState['status'], string][] = [
  [/Thinking|thinking/i, 'thinking', '思考中'],
  [/Processing|processing/i, 'processing', '处理中'],
  [/Reading|reading/i, 'processing', '读取中'],
  [/Generating|generating/i, 'processing', '生成中'],
  [/analyzing/i, 'processing', '分析中'],
  [/tool use|Tool:/i, 'processing', '工具调用'],
  [/waiting|Waiting/i, 'waiting', '等待中'],
];

const TOOL_PATTERNS: [RegExp, keyof ToolCount][] = [
  [/\bRead\b.*file/i, 'read'],
  [/\bEdit\b.*file/i, 'edit'],
  [/\bBash\b.*command/i, 'bash'],
  [/\bWrite\b.*file/i, 'write'],
];

const PROMPT_PATTERN = /^❯\s*$/;
const SHELL_PROMPT_PATTERN = /^(?:\$\s*|[#$>]\s*)$/;
const CONTEXT_PATTERN = /(\d[\d.]*)k?\s*\/\s*(\d[\d.]*)k/i;
import { stripAnsi } from '../utils/ansi';

function detectModel(data: string): string | null {
  const m = data.match(/claude-([\w]+-[\d.]+)/i);
  if (m) return m[1];
  if (/sonnet/i.test(data)) return 'Sonnet';
  if (/opus/i.test(data)) return 'Opus';
  if (/haiku/i.test(data)) return 'Haiku';
  return null;
}

function detectMode(data: string): string | null {
  if (/plan\s*mode/i.test(data)) return 'Plan';
  if (/auto\s*mode/i.test(data)) return 'Auto';
  if (/fast\s*mode/i.test(data)) return 'Fast';
  return null;
}

function detectToolUse(data: string): keyof ToolCount | null {
  for (const [pat, tool] of TOOL_PATTERNS) {
    if (pat.test(data)) return tool;
  }
  return null;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function StatusBar() {
  const { state } = useApp();
  const project = state.projects.find(p => p.id === state.currentProjectId);
  const [status, setStatus] = useState<StatusState>({
    model: '', mode: '', status: 'idle', statusText: '', cwd: '',
    gitBranch: '', gitDirty: false, toolCount: { read: 0, edit: 0, bash: 0, write: 0 },
    sessionStart: Date.now(), contextPercent: 0, contextUsed: 0, contextTotal: 200,
  });
  const lastBusyRef = useRef(0);
  const [elapsed, setElapsed] = useState('');

  const updateGitBranch = useCallback(async (cwd: string) => {
    if (!cwd) return;
    try {
      const entries = await api.readDir(cwd);
      const hasGit = entries.some(e => e.name === '.git' && e.type === 'dir');
      if (!hasGit) { setStatus(p => ({ ...p, gitBranch: '', gitDirty: false })); return; }
      const headFile = `${cwd}/.git/HEAD`;
      const content = await api.readFile(headFile);
      if (content.error || !content.content) return;
      const match = content.content.match(/ref:\s*refs\/heads\/(.+)/);
      if (match) {
        const branch = match[1].trim();
        setStatus(p => ({ ...p, gitBranch: branch, gitDirty: false }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!project) return;
    setStatus(prev => ({ ...prev, cwd: project.path, sessionStart: Date.now(),
      toolCount: { read: 0, edit: 0, bash: 0, write: 0 } }));
    updateGitBranch(project.path);
  }, [project?.id, updateGitBranch]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(formatDuration(Date.now() - status.sessionStart));
    }, 10000);
    setElapsed(formatDuration(Date.now() - status.sessionStart));
    return () => clearInterval(timer);
  }, [status.sessionStart]);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;

    api.onPtyData((_sid, data) => {
      const clean = stripAnsi(data);
      if (!clean.trim()) return;

      const model = detectModel(clean);
      const mode = detectMode(clean);
      const tool = detectToolUse(clean);
      const ctxMatch = clean.match(CONTEXT_PATTERN);

      if (PROMPT_PATTERN.test(clean)) {
        setStatus(prev => ({ ...prev, status: 'idle', statusText: '',
          model: model || prev.model, mode: mode || prev.mode }));
        lastBusyRef.current = 0;
        return;
      }
      if (SHELL_PROMPT_PATTERN.test(clean) && !PROMPT_PATTERN.test(clean)) {
        setStatus(prev => ({ ...prev, status: 'idle', statusText: '', model: '', mode: '' }));
        lastBusyRef.current = 0;
        return;
      }
      setStatus(prev => {
        const nextToolCount = { ...prev.toolCount };
        if (tool) nextToolCount[tool]++;
        let ctxPercent = prev.contextPercent;
        let ctxUsed = prev.contextUsed;
        let ctxTotal = prev.contextTotal;
        if (ctxMatch) {
          ctxUsed = parseFloat(ctxMatch[1]);
          ctxTotal = parseFloat(ctxMatch[2]);
          ctxPercent = ctxTotal > 0 ? Math.round((ctxUsed / ctxTotal) * 100) : 0;
        }
        for (const [pat, st, text] of STATUS_PATTERNS) {
          if (pat.test(clean)) {
            lastBusyRef.current = Date.now();
            return { ...prev, status: st, statusText: text,
              model: model || prev.model, mode: mode || prev.mode,
              toolCount: nextToolCount, contextPercent: ctxPercent,
              contextUsed: ctxUsed, contextTotal: ctxTotal };
          }
        }
        return { ...prev, toolCount: nextToolCount, contextPercent: ctxPercent,
          contextUsed: ctxUsed, contextTotal: ctxTotal };
      });
    }).then(u => { if (cancelled) u(); else unsubData = u; });

    api.onPtyExit(() => {
      setStatus(prev => ({ ...prev, status: 'idle', statusText: '', model: '', mode: '' }));
    }).then(u => { if (cancelled) u(); else unsubExit = u; });

    return () => { cancelled = true; unsubData?.(); unsubExit?.(); };
  }, [project?.id]);

  useEffect(() => {
    if (status.status === 'idle' || !lastBusyRef.current) return;
    const timer = setInterval(() => {
      if (lastBusyRef.current && Date.now() - lastBusyRef.current > BUSY_TIMEOUT) {
        setStatus(prev => ({ ...prev, status: 'idle', statusText: '' }));
        lastBusyRef.current = 0;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status.status]);

  const modelName = status.model || 'omp';
  const projectName = project?.name || '';
  const branchDisplay = status.gitBranch
    ? `git:(${status.gitBranch}${status.gitDirty ? '*' : ''})`
    : '';
  const hasTools = Object.values(status.toolCount).some(v => v > 0);
  const statusColor: Record<StatusState['status'], string> = {
    idle: 'var(--text-tertiary)', thinking: 'var(--accent)',
    processing: 'var(--accent)', waiting: '#c19c00', error: '#c50f1f',
  };

  const tooltipParts: string[] = [];
  if (status.contextPercent > 0) tooltipParts.push(`Context: ${status.contextPercent}% (${status.contextUsed}k/${status.contextTotal}k)`);
  if (hasTools) {
    const parts: string[] = [];
    if (status.toolCount.read > 0) parts.push(`Read ×${status.toolCount.read}`);
    if (status.toolCount.edit > 0) parts.push(`Edit ×${status.toolCount.edit}`);
    if (status.toolCount.bash > 0) parts.push(`Bash ×${status.toolCount.bash}`);
    if (status.toolCount.write > 0) parts.push(`Write ×${status.toolCount.write}`);
    tooltipParts.push(parts.join(', '));
  }

  return (
    <div className="status-bar" title={tooltipParts.join('\n')}>
      <div className="status-row">
        <div className="status-bar-left">
          <span className={`status-indicator status-${status.status}`}>
            <span className="status-dot" />
          </span>
          {status.statusText && (
            <span className="status-text" style={{ color: statusColor[status.status] }}>
              {status.statusText}
            </span>
          )}
          {!status.statusText && <span className="status-text">就绪</span>}
          <span className="status-sep">│</span>
          <span className="status-model-tag">{modelName}</span>
          <span className="status-sep">│</span>
          <span className="status-project">{projectName}</span>
          {branchDisplay && <span className="status-git">{branchDisplay}</span>}
          <span className="status-sep">│</span>
          <span className="status-env">{navigator.platform.startsWith('Win') ? 'Win' : navigator.platform.startsWith('Mac') ? 'Mac' : 'Linux'}</span>
          <span className="status-sep">│</span>
          <span className="status-time">⏱ {elapsed}</span>
          {status.contextPercent > 0 && (
            <>
              <span className="status-sep">│</span>
              <span className="status-label">Ctx</span>
              <span className="status-context-pct">{status.contextPercent}%</span>
            </>
          )}
        </div>
        <div className="status-bar-right">
          <span className="status-perm">⏵⏵ accept edits</span>
        </div>
      </div>
    </div>
  );
}
