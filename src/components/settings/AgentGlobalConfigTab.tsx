// Generalized agent global config tab — renders structured config controls for the
// selected agent. For Claude it reuses CLAUDE_CONFIG_SPEC; for omp it uses OMP_CONFIG_SPEC
// with dotted-key nested get/set; for codex/gemini/github it falls back to raw text editing.

import { useState } from 'react';
import ConfigItem from './ConfigItem';
import { CLAUDE_CONFIG_SPEC, EXCLUDED_KEYS, ENV_SPEC } from './config-spec';
import { OMP_CONFIG_SPEC, getNested, setNested } from './agent-specs';
import type { AgentKind } from '../../lib/tauri-api';
import type { ClaudeSettings } from '../../types/api';

interface AgentGlobalConfigTabProps {
  kind: AgentKind;
  settings: ClaudeSettings;
  update: (key: string, value: unknown) => void;
  updateEnv?: (key: string, value: string) => void;
}

export default function AgentGlobalConfigTab({ kind, settings, update, updateEnv }: AgentGlobalConfigTabProps) {
  const [newKey, setNewKey] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [showAddSelect, setShowAddSelect] = useState(false);
  const [addFilter, setAddFilter] = useState('');

  // For Claude, the flat key model applies directly. For omp, keys are dotted
  // (modelRoles.default); we flatten for display and use getNested/setNested.
  const spec = kind === 'omp' ? OMP_CONFIG_SPEC : CLAUDE_CONFIG_SPEC;
  const flatKeys: string[] =
    kind === 'omp'
      ? Object.keys(OMP_CONFIG_SPEC).filter(k => getNested(settings as unknown as Record<string, unknown>, k) !== undefined)
      : Object.keys(settings).filter(k => !EXCLUDED_KEYS.has(k));

  const coreKeys = flatKeys.filter(k => spec[k]?.group === 'core' && spec[k]?.type !== 'json');
  const displayKeys = flatKeys.filter(k => spec[k]?.group === 'display' && spec[k]?.type !== 'json');
  const jsonKeys = flatKeys.filter(k => spec[k]?.type === 'json');
  const unknownKeys = flatKeys.filter(k => !spec[k]);

  const getValue = (key: string): unknown =>
    kind === 'omp'
      ? getNested(settings as unknown as Record<string, unknown>, key)
      : (settings as Record<string, unknown>)[key];

  const setValue = (key: string, value: unknown) => {
    if (kind === 'omp') {
      const nested = setNested(settings as unknown as Record<string, unknown>, key, value);
      update('__replace_all__', nested);
    } else {
      update(key, value);
    }
  };

  const removeKey = (key: string) => {
    if (kind === 'omp') {
      // set to undefined, then the writer drops it.
      const nested = setNested(settings as unknown as Record<string, unknown>, key, undefined);
      update('__replace_all__', nested);
    } else {
      update(key, undefined);
    }
  };

  const availableToAdd = Object.keys(spec)
    .filter(k => kind !== 'omp' || !EXCLUDED_KEYS.has(k))
    .filter(k => !flatKeys.includes(k))
    .filter(k => !addFilter || spec[k].label.includes(addFilter) || spec[k].desc.includes(addFilter) || k.includes(addFilter));

  const handleAddConfig = (key: string) => {
    const s = spec[key];
    if (!s) return;
    let defaultVal: unknown = '';
    if (s.type === 'boolean') defaultVal = false;
    else if (s.type === 'number') defaultVal = 0;
    else if (s.type === 'json') defaultVal = {};
    setValue(key, defaultVal);
    setShowAddSelect(false);
  };

  const envEntries = Object.entries(settings.env || {});

  if (kind === 'omp') {
    return (
      <div className="settings-section">
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>~/.omp/agent/config.yml</p>
        {coreKeys.length > 0 && (
          <>
            <h3 className="title-sm">核心</h3>
            {coreKeys.map(k => (
              <ConfigItem key={k} keyName={k} value={getValue(k)} spec={spec[k]}
                onChange={v => setValue(k, v)} onRemove={() => removeKey(k)} />
            ))}
          </>
        )}
        {displayKeys.length > 0 && (
          <>
            <div className="separator" />
            <h3 className="title-sm">显示</h3>
            {displayKeys.map(k => (
              <ConfigItem key={k} keyName={k} value={getValue(k)} spec={spec[k]}
                onChange={v => setValue(k, v)} onRemove={() => removeKey(k)} />
            ))}
          </>
        )}
        <div className="separator" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-sm" onClick={() => setShowAddSelect(s => !s)}>+ 添加配置</button>
        </div>
        {showAddSelect && (
          <div className="add-config-panel">
            <input value={addFilter} onChange={e => setAddFilter(e.target.value)} placeholder="过滤..." autoFocus />
            <div className="add-config-list">
              {availableToAdd.map(k => (
                <div key={k} className="add-config-row" onClick={() => handleAddConfig(k)}>
                  <span>{spec[k].label}</span>
                  <span className="text-sm text-muted">{k}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (kind === 'codex' || kind === 'gemini' || kind === 'github') {
    // Raw-file editing fallback for unverified formats.
    const label =
      kind === 'codex' ? '~/.codex/config.toml' :
      kind === 'gemini' ? '~/.gemini/settings.json' :
      '~/.copilot/copilot-instructions.md';
    return (
      <div className="settings-section">
        <p className="text-sm text-muted" style={{ marginBottom: 12 }}>{label}</p>
        <textarea
          className="claude-md-editor"
          value={typeof settings === 'string' ? settings : JSON.stringify(settings, null, 2)}
          onChange={e => {
            if (kind === 'github') update('__raw__', e.target.value);
            else { try { update('__replace_all__', JSON.parse(e.target.value)); } catch { /* ignore */ } }
          }}
          rows={16}
          spellCheck={false}
        />
      </div>
    );
  }

  // Claude structured editing (original behaviour).
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>~/.claude/settings.json</p>
      {coreKeys.length > 0 && (
        <>
          <h3 className="title-sm">核心</h3>
          {coreKeys.map(k => (
            <ConfigItem key={k} keyName={k} value={getValue(k)} spec={spec[k]}
              onChange={v => setValue(k, v)} onRemove={() => removeKey(k)} />
          ))}
        </>
      )}
      {displayKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">显示</h3>
          {displayKeys.map(k => (
            <ConfigItem key={k} keyName={k} value={getValue(k)} spec={spec[k]}
              onChange={v => setValue(k, v)} onRemove={() => removeKey(k)} />
          ))}
        </>
      )}
      {unknownKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">其他</h3>
          {unknownKeys.map(k => (
            <ConfigItem key={k} keyName={k} value={getValue(k)}
              onChange={v => setValue(k, v)} onRemove={() => removeKey(k)} />
          ))}
        </>
      )}
      {jsonKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">高级 (JSON)</h3>
          {jsonKeys.map(k => (
            <ConfigItem key={k} keyName={k} value={getValue(k)} spec={spec[k]}
              onChange={v => setValue(k, v)} onRemove={() => removeKey(k)} />
          ))}
        </>
      )}
      <div className="separator" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-sm" onClick={() => setShowAddSelect(s => !s)}>+ 添加配置</button>
      </div>
      {showAddSelect && (
        <div className="add-config-panel">
          <input value={addFilter} onChange={e => setAddFilter(e.target.value)} placeholder="过滤..." autoFocus />
          <div className="add-config-list">
            {availableToAdd.map(k => (
              <div key={k} className="add-config-row" onClick={() => handleAddConfig(k)}>
                <span>{spec[k].label}</span>
                <span className="text-sm text-muted">{k}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {updateEnv && (
        <>
          <div className="separator" />
          <h3 className="title-sm">环境变量（{envEntries.length} 个）</h3>
          {envEntries.map(([key, value]) => (
            <div key={key} className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code className="env-key">{key}</code>
              <input value={value} style={{ flex: 1 }} onChange={e => updateEnv(key, e.target.value)} />
              <button className="btn-sm btn-danger" onClick={() => updateEnv(key, '')}>删除</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={newEnvKey} placeholder="新变量名" onChange={e => setNewEnvKey(e.target.value)} />
            <button onClick={() => { if (newEnvKey.trim()) { updateEnv(newEnvKey.trim(), ''); setNewEnvKey(''); } }}>添加</button>
          </div>
        </>
      )}
    </div>
  );
}
