import { useState, useEffect, type MouseEvent } from 'react';
import { useApp } from '../context/AppContext';
import { formatTime } from '../utils/format';
import { isClaudeBusy, switchToSession } from './TerminalPanel';
import type { ClaudeSession, SessionMessage } from '../types/electron';

export function SessionList({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const { state } = useApp();
  const project = state.projects.find((p) => p.id === state.currentProjectId);
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);

  useEffect(() => {
    if (project) loadSessions();
  }, [project?.id]);

  const loadSessions = async () => {
    if (!project) return;
    const list = await window.electronAPI.getSessions(project.path);
    setSessions(list);
  };

  const handleDelete = async (e: MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!project || !confirm('删除此会话？不可恢复。')) return;
    await window.electronAPI.deleteSession(project.path, sessionId);
    loadSessions();
  };

  const handleSwitchSession = (e: MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!project) return;
    const cliPath = state.settings.claudeCliPath || 'claude';
    if (isClaudeBusy() && !confirm('Claude 正在执行任务，切换将中断当前操作。继续？')) return;
    switchToSession(project.id, sessionId, cliPath);
  };

  if (!project) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="text-sm text-bold">{sessions.length} 个会话</span>
        <button className="btn-sm" onClick={loadSessions}>刷新</button>
      </div>
      {sessions.length === 0 && (
        <div className="text-muted text-sm" style={{ padding: 12, textAlign: 'center' }}>暂无会话</div>
      )}
      {sessions.map(s => (
        <div key={s.sessionId} className="session-item" onClick={() => onOpenSession(s.sessionId)}>
          <div className="text-sm" style={{ fontWeight: 500, marginBottom: 2 }}>{s.title}</div>
          <div className="text-sm text-muted" style={{ display: 'flex', gap: 8 }}>
            <span>{s.messageCount} 条</span>
            <span>{formatTime(s.lastModified)}</span>
          </div>
          <div style={{ position: 'absolute', right: 4, top: 4, display: 'flex', gap: 2 }}>
            <button className="btn-sm btn-switch-session" title="切换到此会话"
              onClick={e => handleSwitchSession(e, s.sessionId)}>↗</button>
            <button className="btn-sm btn-danger" title="删除会话"
              onClick={e => handleDelete(e, s.sessionId)}>×</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SessionDetail({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { state } = useApp();
  const project = state.projects.find((p) => p.id === state.currentProjectId);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!project) return;
    window.electronAPI.getSessions(project.path).then(list => {
      const s = list.find(s => s.sessionId === sessionId);
      if (s) setTitle(s.title);
    });
    window.electronAPI.getSessionMessages(project.path, sessionId).then(setMessages);
  }, [project?.path, sessionId]);

  return (
    <div className="session-detail-full">
      <div className="session-detail-bar">
        <span className="text-sm">{title || '会话详情'}</span>
        <button className="btn-sm" onClick={onClose}>✕</button>
      </div>
      <div className="session-messages">
        {messages.length === 0 && <div className="text-muted" style={{ padding: 20 }}>无消息内容</div>}
        {messages.map((m, i) => (
          <div key={i} className={`message message-${m.role}`}>
            <div className="message-role">
              {m.role === 'user' ? '👤 你' : m.role === 'assistant' ? '🤖 Claude' : '📝 系统'}
            </div>
            <div className="message-text">{m.text}</div>
            {m.ts && <div className="message-time">{new Date(m.ts).toLocaleString('zh-CN')}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
