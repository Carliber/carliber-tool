import { useState } from 'react';

export function GlobalMdTab({ md, setMd }: { md: string; setMd: (v: string) => void }) {
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 8 }}>~/.claude/CLAUDE.md</p>
      <textarea className="claude-md-editor"
        value={md}
        onChange={e => setMd(e.target.value)}
        placeholder="全局指令，对所有会话生效..."
        spellCheck={false} />
    </div>
  );
}

export default function InstructionsTab({ globalMd, setGlobalMd, projectMd, setProjectMd, hasProject }: {
  globalMd: string; setGlobalMd: (v: string) => void;
  projectMd: string; setProjectMd: (v: string) => void; hasProject: boolean;
}) {
  const [scope, setScope] = useState('global');
  return (
    <div className="settings-section">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={scope === 'global' ? 'primary' : ''} onClick={() => setScope('global')}>全局 CLAUDE.md</button>
        {hasProject && <button className={scope === 'project' ? 'primary' : ''} onClick={() => setScope('project')}>项目 CLAUDE.md</button>}
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
        {scope === 'global' ? '~/.claude/CLAUDE.md' : '项目根目录/CLAUDE.md'}
      </p>
      <textarea className="claude-md-editor"
        value={scope === 'global' ? globalMd : projectMd}
        onChange={e => scope === 'global' ? setGlobalMd(e.target.value) : setProjectMd(e.target.value)}
        placeholder={scope === 'global' ? '全局指令，对所有会话生效...' : '项目指令，对本项目会话生效...'}
        spellCheck={false} />
    </div>
  );
}
