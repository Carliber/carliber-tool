import { useState } from 'react';
import type { ClaudeSettings } from '../../types/api';

export function PermissionsEditor({ permissions, update }: { permissions: { allow?: string[]; deny?: string[] }; update: (k: string, v: unknown) => void }) {
  const allowList: string[] = permissions.allow || [];
  const [newRule, setNewRule] = useState('');

  const grouped: Record<string, { rule: string; index: number }[]> = {};
  allowList.forEach((r: string, i: number) => {
    const tool = r.match(/^(\w+)\(/)?.[1] || 'other';
    if (!grouped[tool]) grouped[tool] = [];
    grouped[tool].push({ rule: r, index: i });
  });

  return (
    <div style={{ marginTop: 8 }}>
      {Object.entries(grouped).map(([tool, rules]) => (
        <div key={tool} style={{ marginBottom: 8 }}>
          <div className="text-sm text-bold" style={{ marginBottom: 4 }}>{tool}</div>
          {rules.map(({ rule, index }) => (
            <div key={index} className="permission-row">
              <code className="text-sm">{rule}</code>
              <button className="btn-sm btn-danger" onClick={() => {
                const list = [...allowList]; list.splice(index, 1);
                update('permissions', { ...permissions, allow: list });
              }}>×</button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={newRule} placeholder='如 Bash(git push*)' style={{ flex: 1 }}
          onChange={e => setNewRule(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newRule.trim()) {
            update('permissions', { ...permissions, allow: [...allowList, newRule.trim()] }); setNewRule('');
          }}} />
        <button className="primary" onClick={() => {
          if (newRule.trim()) { update('permissions', { ...permissions, allow: [...allowList, newRule.trim()] }); setNewRule(''); }
        }}>添加</button>
      </div>
    </div>
  );
}

export default function PermissionsTab({ settings, update }: {
  settings: ClaudeSettings; update: (k: string, v: unknown) => void;
}) {
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>~/.claude/settings.json · permissions</p>
      <PermissionsEditor permissions={settings.permissions || {}} update={update} />
    </div>
  );
}
