import { useState } from 'react';
import type { AgentKind } from '../../lib/tauri-api';
import { AGENT_LABELS } from './agent-specs';

export function GlobalMdTab({ md, setMd, kind = 'claude' }: { md: string; setMd: (v: string) => void; kind?: AgentKind }) {
  const path = kind === 'omp' ? '~/.omp/agent/AGENTS.md' : kind === 'claude' ? '~/.claude/CLAUDE.md' : `~/.${kind}/`;
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 8 }}>{path}</p>
      <textarea className="claude-md-editor"
        value={md}
        onChange={e => setMd(e.target.value)}
        placeholder={`${AGENT_LABELS[kind]} 全局指令，对所有会话生效...`}
        spellCheck={false} />
    </div>
  );
}

export default function InstructionsTab({ globalMd, setGlobalMd, projectMd, setProjectMd, hasProject, kind = 'claude' }: {
  globalMd: string; setGlobalMd: (v: string) => void;
  projectMd: string; setProjectMd: (v: string) => void; hasProject: boolean; kind?: AgentKind;
}) {
  const [scope, setScope] = useState('global');
  const globalPath = kind === 'omp' ? '~/.omp/agent/AGENTS.md' : kind === 'claude' ? '~/.claude/CLAUDE.md' : `~/.${kind}/`;
  const projectPath = kind === 'omp' ? '项目/.omp/AGENTS.md' : kind === 'claude' ? '项目/CLAUDE.md' : `项目/.${kind}/`;
  return (
    <div className="settings-section">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={scope === 'global' ? 'primary' : ''} onClick={() => setScope('global')}>全局指令</button>
        {hasProject && <button className={scope === 'project' ? 'primary' : ''} onClick={() => setScope('project')}>项目指令</button>}
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
        {scope === 'global' ? globalPath : projectPath}
      </p>
      <textarea className="claude-md-editor"
        value={scope === 'global' ? globalMd : projectMd}
        onChange={e => scope === 'global' ? setGlobalMd(e.target.value) : setProjectMd(e.target.value)}
        placeholder={scope === 'global' ? `${AGENT_LABELS[kind]} 全局指令...` : `${AGENT_LABELS[kind]} 项目指令...`}
        spellCheck={false} />
    </div>
  );
}
