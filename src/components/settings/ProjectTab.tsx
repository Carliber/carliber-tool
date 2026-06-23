import type { ClaudeSettings } from '../../types/api';
import type { AgentKind } from '../../lib/tauri-api';

export default function ProjectTab({ settings, update, projectPath, kind = 'claude' }: {
  settings: ClaudeSettings; update: (k: string, v: unknown) => void; projectPath: string; kind?: AgentKind;
}) {
  const configFile =
    kind === 'omp' ? `${projectPath}/.omp/config.yml` :
    kind === 'codex' ? `${projectPath}/.codex/config.toml` :
    kind === 'gemini' ? `${projectPath}/.gemini/settings.json` :
    `${projectPath}/.claude/settings.local.json`;
  const allowedCommands = (settings.allowedCommands as string[] | undefined) || [];
  const mcpServers = (settings.mcpServers as Record<string, unknown> | undefined) || {};
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        项目级设置 · {configFile}
      </p>
      <div className="form-group">
        <label>项目允许的命令（每行一个）</label>
        <textarea value={allowedCommands.join('\n')} rows={6}
          onChange={e => update('allowedCommands', e.target.value.split('\n').filter(Boolean))}
          placeholder="Bash(git status)&#10;Bash(npm test)" />
      </div>
      <div className="form-group">
        <label>项目 MCP 服务器（JSON）</label>
        <textarea value={JSON.stringify(mcpServers, null, 2)} rows={6}
          onChange={e => { try { update('mcpServers', JSON.parse(e.target.value)); } catch {} }}
          placeholder='{"server-name": { "command": "npx", "args": [...] }}' />
      </div>
    </div>
  );
}
