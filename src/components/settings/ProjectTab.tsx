import type { ClaudeSettings } from '../../types/electron';

export default function ProjectTab({ settings, update, projectPath }: {
  settings: ClaudeSettings; update: (k: string, v: unknown) => void; projectPath: string;
}) {
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        项目级设置 · {projectPath}/.claude/settings.local.json
      </p>
      <div className="form-group">
        <label>项目允许的命令（每行一个）</label>
        <textarea value={(settings.allowedCommands || []).join('\n')} rows={6}
          onChange={e => update('allowedCommands', e.target.value.split('\n').filter(Boolean))}
          placeholder="Bash(git status)&#10;Bash(npm test)" />
      </div>
      <div className="form-group">
        <label>项目 MCP 服务器（JSON）</label>
        <textarea value={JSON.stringify(settings.mcpServers || {}, null, 2)} rows={6}
          onChange={e => { try { update('mcpServers', JSON.parse(e.target.value)); } catch {} }}
          placeholder='{"server-name": { "command": "npx", "args": [...] }}' />
      </div>
    </div>
  );
}
