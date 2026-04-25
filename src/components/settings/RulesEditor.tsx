export default function RulesEditor({ location, rules, setRules, editRule, setEditRule, newRuleName, setNewRuleName, onSave, onDelete, onRefresh }: {
  location: string;
  rules: { name: string; content: string }[];
  setRules: (r: { name: string; content: string }[]) => void;
  editRule: { name: string; content: string } | null; setEditRule: (r: { name: string; content: string } | null) => void;
  newRuleName: string; setNewRuleName: (v: string) => void;
  onSave: (name: string, content: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onRefresh: () => Promise<{ name: string; content: string }[]>;
}) {
  const refresh = async () => setRules(await onRefresh());

  const saveRule = async () => {
    if (!editRule || !editRule.name.trim()) return;
    await onSave(editRule.name, editRule.content);
    await refresh();
    setEditRule(null);
  };

  const deleteRule = async (name: string) => {
    if (!confirm(`删除规则 ${name}？`)) return;
    await onDelete(name);
    await refresh();
  };

  if (editRule) {
    return (
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="title-sm">{editRule.name}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditRule(null)}>取消</button>
            <button className="primary" onClick={saveRule}>保存</button>
          </div>
        </div>
        <textarea className="claude-md-editor" value={editRule.content}
          onChange={e => setEditRule({ ...editRule, content: e.target.value })}
          placeholder="规则内容..." spellCheck={false} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        {location} · {rules.length} 条规则
      </p>
      {rules.map(r => (
        <div key={r.name} className="permission-row" style={{ padding: '8px 0' }}>
          <span className="text-sm" style={{ flex: 1 }}>{r.name}</span>
          <button className="btn-sm" onClick={() => setEditRule({ ...r })}>编辑</button>
          <button className="btn-sm btn-danger" onClick={() => deleteRule(r.name)}>删除</button>
        </div>
      ))}
      <div className="separator" />
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={newRuleName} placeholder="新规则名称" style={{ flex: 1 }}
          onChange={e => setNewRuleName(e.target.value)} />
        <button className="primary" onClick={() => {
          if (!newRuleName.trim()) return;
          const name = newRuleName.endsWith('.md') ? newRuleName : newRuleName + '.md';
          setEditRule({ name, content: `---\n---\n# ${name.replace('.md', '')}\n\n` });
          setNewRuleName('');
        }}>新建</button>
      </div>
    </div>
  );
}
