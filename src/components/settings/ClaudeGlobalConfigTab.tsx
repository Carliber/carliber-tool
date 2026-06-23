import { useState } from 'react';
import { CLAUDE_CONFIG_SPEC, EXCLUDED_KEYS, ENV_SPEC } from './config-spec';
import ConfigItem from './ConfigItem';
import type { ClaudeSettings } from '../../types/api';

export default function ClaudeGlobalConfigTab({ settings, update, updateEnv }: {
  settings: ClaudeSettings; update: (k: string, v: unknown) => void;
  updateEnv: (k: string, v: string) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [showAddSelect, setShowAddSelect] = useState(false);
  const [addFilter, setAddFilter] = useState('');
  const envEntries = Object.entries(settings.env || {});

  const existingKeys = Object.keys(settings).filter(k => !EXCLUDED_KEYS.has(k));
  const coreKeys = existingKeys.filter(k => CLAUDE_CONFIG_SPEC[k]?.group === 'core' && CLAUDE_CONFIG_SPEC[k]?.type !== 'json');
  const displayKeys = existingKeys.filter(k => CLAUDE_CONFIG_SPEC[k]?.group === 'display' && CLAUDE_CONFIG_SPEC[k]?.type !== 'json');
  const jsonKeys = existingKeys.filter(k => CLAUDE_CONFIG_SPEC[k]?.type === 'json');
  const unknownKeys = existingKeys.filter(k => !CLAUDE_CONFIG_SPEC[k]);

  const availableToAdd = Object.keys(CLAUDE_CONFIG_SPEC)
    .filter(k => !EXCLUDED_KEYS.has(k) && !existingKeys.includes(k))
    .filter(k => !addFilter || CLAUDE_CONFIG_SPEC[k].label.includes(addFilter) || CLAUDE_CONFIG_SPEC[k].desc.includes(addFilter) || k.includes(addFilter));

  const handleAddConfig = (key: string) => {
    const spec = CLAUDE_CONFIG_SPEC[key];
    if (!spec) return;
    let defaultVal: unknown = '';
    if (spec.type === 'boolean') defaultVal = false;
    else if (spec.type === 'number') defaultVal = 0;
    else if (spec.type === 'json') defaultVal = {};
    update(key, defaultVal);
    setShowAddSelect(false);
  };

  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>~/.claude/settings.json</p>

      {/* Core config */}
      {coreKeys.length > 0 && (
        <>
          <h3 className="title-sm">核心配置</h3>
          {coreKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={CLAUDE_CONFIG_SPEC[key]}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* Display config */}
      {displayKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">显示配置</h3>
          {displayKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={CLAUDE_CONFIG_SPEC[key]}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* Unknown keys */}
      {unknownKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">其他配置</h3>
          {unknownKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={undefined}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* JSON config items */}
      {jsonKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">高级配置 (JSON)</h3>
          {jsonKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={CLAUDE_CONFIG_SPEC[key]}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* Add config dropdown */}
      <div className="separator" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {showAddSelect ? (
          <div style={{ flex: 1 }}>
            <input value={addFilter} placeholder="搜索配置项..." style={{ width: '100%', marginBottom: 6 }}
              onChange={e => setAddFilter(e.target.value)} autoFocus />
            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {availableToAdd.length === 0 && <div className="text-sm text-muted" style={{ padding: 12 }}>没有匹配的配置项</div>}
              {availableToAdd.map(k => (
                <div key={k} className="add-config-item" style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onClick={() => handleAddConfig(k)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{CLAUDE_CONFIG_SPEC[k].label} <code className="text-sm text-muted">{k}</code></div>
                  <div className="text-sm text-muted">{CLAUDE_CONFIG_SPEC[k].desc}</div>
                </div>
              ))}
            </div>
            <button style={{ marginTop: 6 }} onClick={() => { setShowAddSelect(false); setAddFilter(''); }}>取消</button>
          </div>
        ) : (
          <>
            <button className="primary" onClick={() => setShowAddSelect(true)}>添加配置</button>
            <span className="text-sm text-muted">或手动输入：</span>
            <input value={newKey} placeholder="自定义键名" style={{ flex: 1 }}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newKey.trim()) { update(newKey.trim(), ''); setNewKey(''); } }} />
            <button onClick={() => { if (newKey.trim()) { update(newKey.trim(), ''); setNewKey(''); } }}>添加</button>
          </>
        )}
      </div>

      {/* Environment variables */}
      <div className="separator" />
      <h3 className="title-sm">环境变量（{envEntries.length} 个）</h3>
      {envEntries.map(([key, value]) => {
        const spec = ENV_SPEC[key];
        return (
          <div key={key} className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>{spec ? `${spec.label} (${key})` : key}</label>
              <button className="btn-sm btn-danger" onClick={() => updateEnv(key, '')}>×</button>
            </div>
            {spec && <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{spec.desc}</div>}
            <input value={String(value)} style={{ width: '100%' }} onChange={e => updateEnv(key, e.target.value)} />
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={newEnvKey} placeholder="新变量名" style={{ flex: 1 }} onChange={e => setNewEnvKey(e.target.value)} />
        <button onClick={() => { if (newEnvKey.trim()) { updateEnv(newEnvKey.trim(), ''); setNewEnvKey(''); } }}>添加</button>
      </div>
    </div>
  );
}
