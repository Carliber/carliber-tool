// Workflows panel: lists saved workflows, runs one (with {{param}} substitution)
// by writing the expanded command to the PTY. Saving creates a new workflow from
// the current block's command.

import { useState, useEffect, useMemo } from 'react';
import * as api from '../../lib/tauri-api';
import type { Workflow } from '../../lib/tauri-api';
import { generateId } from '../../utils/storage';

interface WorkflowsProps {
  onRun: (command: string) => void;
  onClose: () => void;
  seedCommand?: string; // when provided, the "new workflow" form is pre-filled
}

function expandTemplate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => params[key] ?? '');
}

function extractParams(template: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{(\w+)\}\}/g)) {
    const k = m[1];
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

export default function Workflows({ onRun, onClose, seedCommand }: WorkflowsProps) {
  const [list, setList] = useState<Workflow[]>([]);
  const [newName, setNewName] = useState('');
  const [newTemplate, setNewTemplate] = useState(seedCommand ?? '');
  const [params, setParams] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { api.getWorkflows().then(setList).catch(() => {}); }, []);
  useEffect(() => { if (seedCommand) setNewTemplate(seedCommand); }, [seedCommand]);

  const active = useMemo(() => list.find(w => w.id === activeId) ?? null, [list, activeId]);
  const activeParams = useMemo(() => active ? extractParams(active.commandTemplate) : [], [active]);

  const save = async () => {
    if (!newName.trim() || !newTemplate.trim()) return;
    const wf: Workflow = { id: generateId(), name: newName.trim(), commandTemplate: newTemplate.trim(), description: '' };
    await api.saveWorkflow(wf);
    setList(prev => [...prev, wf]);
    setNewName('');
    setNewTemplate('');
  };

  const run = async (wf: Workflow) => {
    const localParams: Record<string, string> = {};
    for (const p of extractParams(wf.commandTemplate)) {
      localParams[p] = params[`${wf.id}:${p}`] ?? '';
    }
    onRun(expandTemplate(wf.commandTemplate, localParams));
    setParams({});
    setActiveId(null);
    onClose();
  };

  const remove = async (id: string) => {
    await api.deleteWorkflow(id);
    setList(prev => prev.filter(w => w.id !== id));
  };

  return (
    <div className="bt-workflows">
      <div className="bt-workflows-header">
        <span className="bt-workflows-label">⚡ Workflows</span>
        <button className="bt-workflows-close" onClick={onClose}>✕</button>
      </div>
      <div className="bt-workflows-body">
        {list.length === 0 && <div className="text-muted text-sm bt-workflows-empty">暂无 workflow</div>}
        {list.map(w => (
          <div key={w.id} className="bt-workflow-item">
            <div className="bt-workflow-row" onClick={() => setActiveId(activeId === w.id ? null : w.id)}>
              <span className="bt-workflow-name">{w.name}</span>
              <button className="btn-sm btn-danger" onClick={e => { e.stopPropagation(); remove(w.id); }}>×</button>
            </div>
            {activeId === w.id && (
              <div className="bt-workflow-detail">
                {activeParams.map(p => (
                  <div key={p} className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code className="env-key">{`{{${p}}}`}</code>
                    <input value={params[`${w.id}:${p}`] ?? ''} placeholder={p}
                      onChange={e => setParams(prev => ({ ...prev, [`${w.id}:${p}`]: e.target.value }))} />
                  </div>
                ))}
                <button className="primary" onClick={() => run(w)}>运行</button>
              </div>
            )}
          </div>
        ))}
        <div className="separator" />
        <div className="bt-workflows-new">
          <h4 className="title-sm">保存为 Workflow</h4>
          <input value={newName} placeholder="名称" onChange={e => setNewName(e.target.value)} />
          <textarea value={newTemplate} placeholder="命令模板，支持 {{param}}" rows={2}
            onChange={e => setNewTemplate(e.target.value)} spellCheck={false} />
          <button className="primary" onClick={save} disabled={!newName.trim() || !newTemplate.trim()}>保存</button>
        </div>
      </div>
    </div>
  );
}
