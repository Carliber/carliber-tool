import { useState, useEffect } from 'react';
import type { ConfigType, ConfigSpec } from './types';

export default function ConfigItem({ keyName, value, spec, onChange, onRemove }: {
  keyName: string; value: unknown; spec?: ConfigSpec;
  onChange: (v: unknown) => void; onRemove: () => void;
}) {
  const [jsonText, setJsonText] = useState('');
  const [jsonEdit, setJsonEdit] = useState(false);

  const label = spec?.label || keyName;
  const desc = spec?.desc || '';
  const type = spec?.type || guessType(value);

  useEffect(() => {
    if (type === 'json' && !jsonEdit) setJsonText(JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <div className="form-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <label>{label}</label>
        <button className="btn-sm btn-danger" onClick={onRemove} title="删除此配置">×</button>
      </div>
      {desc && <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{desc}</div>}
      {type === 'boolean' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
          <span className="text-sm">{value ? '已启用' : '未启用'}</span>
        </label>
      )}
      {type === 'string' && spec?.options && (
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          {spec.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {type === 'string' && !spec?.options && (
        <input value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
      )}
      {type === 'number' && (
        <input type="number" value={String(value ?? 0)} onChange={e => onChange(Number(e.target.value))} />
      )}
      {type === 'json' && !jsonEdit && (
        <div className="config-json-preview" onClick={() => setJsonEdit(true)} title="点击编辑">
          <pre className="text-sm" style={{ margin: 0, maxHeight: 120, overflow: 'auto', cursor: 'pointer' }}>
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      )}
      {type === 'json' && jsonEdit && (
        <>
          <textarea className="claude-md-editor" value={jsonText} rows={8}
            onChange={e => setJsonText(e.target.value)} spellCheck={false} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn-sm primary" onClick={() => {
              try { onChange(JSON.parse(jsonText)); setJsonEdit(false); } catch { alert('JSON 格式错误'); }
            }}>保存</button>
            <button className="btn-sm" onClick={() => { setJsonEdit(false); setJsonText(JSON.stringify(value, null, 2)); }}>取消</button>
          </div>
        </>
      )}
    </div>
  );
}

function guessType(value: unknown): ConfigType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}
