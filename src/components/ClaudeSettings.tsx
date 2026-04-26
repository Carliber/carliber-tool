import { useState, useEffect } from 'react';
import type { ClaudeSettings } from '../types/electron';
import Titlebar from './Titlebar';
import { PermissionsEditor } from './settings/PermissionsTab';

const MODELS = [
  { value: 'opus[1m]', label: 'Opus (默认)' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'plan', label: 'Plan' },
  { value: 'code', label: 'Code' },
];

const EFFORTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function ClaudeSettings() {
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [claudeMd, setClaudeMd] = useState('');
  const [tab, setTab] = useState('general');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await window.electronAPI.getClaudeSettings();
      const md = await window.electronAPI.getClaudeMd();
      const config = await window.electronAPI.getConfig();
      document.body.className = config.theme === 'dark' ? 'theme-dark' : '';
      setSettings(s || {});
      setClaudeMd(md || '');
    })();
  }, []);

  if (!settings) return <div className="text-muted">加载中...</div>;

  const update = (key: string, value: unknown) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const updateEnv = (key: string, value: string) => {
    const env: Record<string, string> = { ...(settings.env || {}) };
    if (value === '') delete env[key]; else env[key] = value;
    update('env', env);
  };

  const save = async () => {
    await window.electronAPI.saveClaudeSettings(settings);
    await window.electronAPI.saveClaudeMd(claudeMd);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="popup-root">
      <Titlebar title="Claude 全局设置" showMaximize={false} />
      <div className="popup-body">
      <div className="claude-settings-header">
        <h2 className="title-lg">Claude 全局设置</h2>
        <span className="text-sm text-muted">~/.claude/</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span className="text-sm" style={{ color: 'var(--success)' }}>已保存</span>}
          <button className="primary" onClick={save}>保存</button>
        </div>
      </div>

      <div className="claude-settings-tabs">
        {[
          { id: 'general', label: '通用' },
          { id: 'env', label: '环境变量' },
          { id: 'permissions', label: '权限' },
          { id: 'plugins', label: '插件' },
          { id: 'instructions', label: 'CLAUDE.md' },
        ].map(t => (
          <div key={t.id} className={`claude-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      <div className="claude-settings-body">
        {tab === 'general' && <GeneralTab settings={settings} update={update} />}
        {tab === 'env' && <EnvTab env={settings.env || {}} updateEnv={updateEnv} />}
        {tab === 'permissions' && (
          <div className="settings-section">
            <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
              允许的权限规则（{((settings.permissions || {}).allow || []).length} 条）
            </p>
            <PermissionsEditor permissions={settings.permissions || {}} update={update} />
          </div>
        )}
        {tab === 'plugins' && <PluginsTab plugins={settings.enabledPlugins || {}} update={update} />}
        {tab === 'instructions' && <InstructionsTab value={claudeMd} onChange={setClaudeMd} />}
      </div>
      </div>
    </div>
  );
}

function GeneralTab({ settings, update }: { settings: ClaudeSettings; update: (key: string, value: unknown) => void }) {
  return (
    <div className="settings-section">
      <div className="form-group">
        <label>模型</label>
        <select value={settings.model || ''} onChange={e => update('model', e.target.value)}>
          {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>默认模式</label>
        <select value={settings.defaultMode || 'auto'} onChange={e => update('defaultMode', e.target.value)}>
          {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>努力程度</label>
        <select value={settings.effortLevel || 'high'} onChange={e => update('effortLevel', e.target.value)}>
          {EFFORTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>语言</label>
        <input value={settings.language || ''} onChange={e => update('language', e.target.value)} />
      </div>
      <div className="form-group" style={{ display: 'flex', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={settings.alwaysThinkingEnabled || false}
            onChange={e => update('alwaysThinkingEnabled', e.target.checked)} />
          扩展思考
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={settings.fastMode || false}
            onChange={e => update('fastMode', e.target.checked)} />
          快速模式
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={settings.skipAutoPermissionPrompt || false}
            onChange={e => update('skipAutoPermissionPrompt', e.target.checked)} />
          跳过自动权限提示
        </label>
      </div>
    </div>
  );
}

function EnvTab({ env, updateEnv }: { env: Record<string, string>; updateEnv: (key: string, value: string) => void }) {
  const [newKey, setNewKey] = useState('');

  const entries = Object.entries(env);
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        环境变量（{entries.length} 个）
      </p>
      {entries.map(([key, value]) => (
        <div key={key} className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code className="env-key">{key}</code>
          <input value={value} style={{ flex: 1 }}
            onChange={e => updateEnv(key, e.target.value)} />
          <button className="btn-sm btn-danger" onClick={() => updateEnv(key, '')}>删除</button>
        </div>
      ))}
      <div className="separator" />
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={newKey} placeholder="新变量名" onChange={e => setNewKey(e.target.value)} />
        <button onClick={() => { if (newKey.trim()) { updateEnv(newKey.trim(), ''); setNewKey(''); } }}>
          添加
        </button>
      </div>
    </div>
  );
}

function PluginsTab({ plugins, update }: { plugins: Record<string, boolean>; update: (key: string, value: unknown) => void }) {
  const entries = Object.entries(plugins);
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        已安装插件（{entries.length} 个）
      </p>
      {entries.map(([name, enabled]) => (
        <div key={name} className="permission-row">
          <span className="text-sm">{name}</span>
          <span className={`badge ${enabled ? 'badge-active' : 'badge-archived'}`}>
            {enabled ? '启用' : '禁用'}
          </span>
          <button className="btn-sm" onClick={() => {
            const p = { ...plugins };
            p[name] = !p[name];
            update('enabledPlugins', p);
          }}>
            {enabled ? '禁用' : '启用'}
          </button>
        </div>
      ))}
    </div>
  );
}

function InstructionsTab({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        ~/.claude/CLAUDE.md — 全局指令，对所有 Claude Code 会话生效
      </p>
      <textarea
        className="claude-md-editor"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="输入全局指令..."
        spellCheck={false}
      />
    </div>
  );
}
