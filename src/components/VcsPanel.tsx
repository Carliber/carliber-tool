// Version control panel — Git + SVN.
// Lives in the right-hand accordion. Shows branch, ahead/behind, staged/unstaged/
// untracked files, commit message input, push/pull/fetch, and a recent log.
// File status codes follow git porcelain (M/A/D/R/C/?) for git and svn's single-letter
import * as api from '../lib/tauri-api';
import type { VcsStatus, VcsLogEntry, VcsDiff } from '../lib/tauri-api';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { formatTime } from '../utils/format';

const STATUS_LABEL: Record<string, string> = {
  M: '修改', A: '新增', D: '删除', R: '重命名', C: '复制', '?': '未跟踪',
  U: '冲突', '!': '忽略',
};

function statusText(code: string): string {
  return STATUS_LABEL[code] ?? code;
}

function statusColor(code: string): string {
  switch (code) {
    case 'M': return 'var(--accent)';
    case 'A': return '#13a10e';
    case 'D': return '#c50f1f';
    case '?': return 'var(--text-tertiary)';
    case 'U': return '#c19c00';
    default: return 'var(--text-secondary)';
  }
}

export default function VcsPanel() {
  const { state } = useApp();
  const project = state.projects.find(p => p.id === state.currentProjectId);
  const [status, setStatus] = useState<VcsStatus | null>(null);
  const [log, setLog] = useState<VcsLogEntry[]>([]);
  const [diff, setDiff] = useState<VcsDiff | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [showBranches, setShowBranches] = useState(false);

  const refresh = useCallback(async () => {
    if (!project) return;
    const [s, l] = await Promise.all([
      api.vcsStatus(project.path),
      api.vcsLog(project.path, 20),
    ]);
    setStatus(s);
    setLog(l);
  }, [project]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<boolean>) => {
    setBusy(label);
    try { await fn(); await refresh(); }
    catch { /* ignore */ }
    setBusy('');
  };

  const handleStage = (paths: string[]) => {
    if (!project) return;
    run('暂存中', () => api.vcsStage(project.path, paths));
  };
  const handleUnstage = (paths: string[]) => {
    if (!project) return;
    run('取消暂存', () => api.vcsUnstage(project.path, paths));
  };
  const handleStageAll = () => {
    if (!status) return;
    const all = [...status.unstaged.map(f => f.path), ...status.untracked];
    if (all.length > 0) handleStage(all);
  };
  const handleCommit = () => {
    if (!project || !commitMsg.trim()) return;
    run('提交中', async () => {
      const ok = await api.vcsCommit(project.path, commitMsg.trim());
      if (ok) setCommitMsg('');
      return ok;
    });
  };
  const handlePull = () => { if (project) run('拉取中', () => api.vcsPull(project.path)); };
  const handlePush = () => { if (project) run('推送中', () => api.vcsPush(project.path)); };
  const handleFetch = () => { if (project) run('获取中', () => api.vcsFetch(project.path)); };

  const handleDiff = (path: string, staged: boolean) => {
    if (!project) return;
    api.vcsDiff(project.path, path, staged).then(setDiff);
  };

  const handleDiscard = (path: string) => {
    if (!project) return;
    if (!confirm(`放弃 ${path} 的修改？不可恢复。`)) return;
    run('放弃修改', () => api.vcsDiscard(project.path, path));
  };

  const handleBranchSwitch = (branch: string) => {
    if (!project) return;
    if (!confirm(`切换到分支 ${branch}？`)) return;
    setShowBranches(false);
    run('切换分支', () => api.vcsCheckout(project.path, branch));
  };

  const loadBranches = async () => {
    if (!project) return;
    const list = await api.vcsBranches(project.path);
    setBranches(list);
    setShowBranches(s => !s);
  };

  if (!project) return null;
  if (!status) return <div className="text-muted text-sm">加载中...</div>;

  if (status.kind === 'none') {
    return (
      <div className="vcs-panel">
        <div className="text-muted text-sm" style={{ padding: 12, textAlign: 'center' }}>
          此项目未检测到 Git / SVN 仓库
        </div>
      </div>
    );
  }

  const kindLabel = status.kind === 'git' ? 'Git' : 'SVN';
  const aheadBehind = status.kind === 'git' && (status.ahead > 0 || status.behind > 0)
    ? ` ↑${status.ahead} ↓${status.behind}`
    : '';

  return (
    <div className="vcs-panel">
      {/* Branch + actions */}
      <div className="vcs-header">
        <span className="vcs-kind-badge">{kindLabel}</span>
        <span className="vcs-branch" onClick={loadBranches} title="切换分支">
          {status.branch || '(无分支)'}{aheadBehind}
        </span>
        {busy && <span className="text-sm text-muted">{busy}</span>}
      </div>
      {showBranches && branches.length > 0 && (
        <div className="vcs-branch-list">
          {branches.map(b => (
            <div key={b} className={`vcs-branch-item ${b === status.branch ? 'active' : ''}`}
              onClick={() => handleBranchSwitch(b)}>
              {b}
            </div>
          ))}
        </div>
      )}

      {/* Remote actions */}
      <div className="vcs-actions">
        <button className="btn-sm" onClick={handleFetch} disabled={!!busy}>获取</button>
        <button className="btn-sm" onClick={handlePull} disabled={!!busy}>拉取</button>
        <button className="btn-sm" onClick={handlePush} disabled={!!busy}>推送</button>
      </div>

      {/* Commit message */}
      <div className="vcs-commit">
        <textarea
          className="vcs-commit-input"
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          placeholder="提交信息..."
          rows={2}
          disabled={!!busy}
        />
        <div className="vcs-commit-actions">
          <button className="btn-sm" onClick={handleStageAll} disabled={!!busy}>全部暂存</button>
          <button className="primary btn-sm" onClick={handleCommit}
            disabled={!!busy || !commitMsg.trim() || status.staged.length === 0}>
            提交 ({status.staged.length})
          </button>
        </div>
      </div>

      {/* Staged changes */}
      {status.staged.length > 0 && (
        <div className="vcs-section">
          <div className="vcs-section-header">
            <span className="text-sm text-bold">已暂存 ({status.staged.length})</span>
          </div>
          {status.staged.map((f, i) => (
            <div key={i} className="vcs-file-row">
              <span className="vcs-file-status" style={{ color: statusColor(f.status) }}>
                {f.status}
              </span>
              <span className="vcs-file-path" onClick={() => handleDiff(f.path, true)} title="查看 diff">
                {f.path}
              </span>
              <button className="btn-sm" onClick={() => handleUnstage([f.path])} title="取消暂存">−</button>
            </div>
          ))}
        </div>
      )}

      {/* Unstaged changes */}
      {status.unstaged.length > 0 && (
        <div className="vcs-section">
          <div className="vcs-section-header">
            <span className="text-sm text-bold">已修改 ({status.unstaged.length})</span>
          </div>
          {status.unstaged.map((f, i) => (
            <div key={i} className="vcs-file-row">
              <span className="vcs-file-status" style={{ color: statusColor(f.status) }}>
                {f.status}
              </span>
              <span className="vcs-file-path" onClick={() => handleDiff(f.path, false)} title="查看 diff">
                {f.path}
              </span>
              <div className="vcs-file-actions">
                <button className="btn-sm" onClick={() => handleStage([f.path])} title="暂存">+</button>
                <button className="btn-sm btn-danger" onClick={() => handleDiscard(f.path)} title="放弃修改">↺</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Untracked */}
      {status.untracked.length > 0 && (
        <div className="vcs-section">
          <div className="vcs-section-header">
            <span className="text-sm text-bold">未跟踪 ({status.untracked.length})</span>
          </div>
          {status.untracked.map((p, i) => (
            <div key={i} className="vcs-file-row">
              <span className="vcs-file-status" style={{ color: statusColor('?') }}>?</span>
              <span className="vcs-file-path">{p}</span>
              <button className="btn-sm" onClick={() => handleStage([p])} title="添加">+</button>
            </div>
          ))}
        </div>
      )}

      {/* Clean state */}
      {status.clean && (
        <div className="text-muted text-sm" style={{ padding: 8, textAlign: 'center' }}>
          工作区干净，无待提交的修改
        </div>
      )}

      {/* Diff viewer */}
      {diff && (
        <div className="vcs-section vcs-diff-section">
          <div className="vcs-section-header">
            <span className="text-sm text-bold">Diff: {diff.path}{diff.staged ? ' (已暂存)' : ''}</span>
            <button className="btn-sm" onClick={() => setDiff(null)}>✕</button>
          </div>
          <pre className="vcs-diff">{diff.diff || '(无差异)'}</pre>
        </div>
      )}

      {/* Recent log */}
      {log.length > 0 && (
        <div className="vcs-section">
          <div className="vcs-section-header">
            <span className="text-sm text-bold">最近提交</span>
            <button className="btn-sm" onClick={refresh} title="刷新">↻</button>
          </div>
          {log.map((e, i) => (
            <div key={i} className="vcs-log-entry">
              <div className="vcs-log-line">
                <code className="vcs-log-hash">{e.shortHash}</code>
                <span className="vcs-log-author">{e.author}</span>
                <span className="vcs-log-date text-muted">{formatTime(e.date)}</span>
              </div>
              <div className="vcs-log-msg">{e.message.split('\n')[0]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
