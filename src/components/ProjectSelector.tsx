import { useState, useEffect, useMemo } from 'react';
import { createProject } from '../utils/storage';
import { formatTime } from '../utils/format';
import type { Project, ScannedProject } from '../types/electron';
import ProjectEditDialog from './ProjectEditDialog';

export default function ProjectSelector() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [editProject, setEditProject] = useState<Partial<Project> | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [claudeProjects, setClaudeProjects] = useState<ScannedProject[]>([]);
  const [sessionTimes, setSessionTimes] = useState<Record<string, string | null>>({});

  const loadProjects = async () => {
    const ps = await window.electronAPI.getProjects();
    setProjects(ps);
    // Load session times in background — don't block rendering
    Promise.all(ps.map(async (p) => {
      const t = await window.electronAPI.getLastSessionTime(p.path);
      return [p.id, t] as const;
    })).then(entries => {
      const times: Record<string, string | null> = {};
      entries.forEach(([id, t]) => { times[id] = t; });
      setSessionTimes(times);
    });
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const reload = () => loadProjects();

  const handleScanClaude = async () => {
    const scanned = await window.electronAPI.scanClaudeProjects();
    const existing = await window.electronAPI.getProjects();
    const existingPaths = new Set(existing.map(p => p.path));
    const newOnes = scanned.filter(p => !existingPaths.has(p.path));
    setClaudeProjects(newOnes);
    setShowImport(true);
  };

  const handleImportAll = async () => {
    const all = await window.electronAPI.getProjects();
    for (const cp of claudeProjects) {
      all.push(createProject({ name: cp.name, path: cp.path, status: 'active' }));
    }
    await window.electronAPI.saveProjects(all);
    setShowImport(false);
    reload();
  };

  const handleImportOne = async (cp: ScannedProject) => {
    const all = await window.electronAPI.getProjects();
    all.push(createProject({ name: cp.name, path: cp.path, status: 'active' }));
    await window.electronAPI.saveProjects(all);
    setClaudeProjects(prev => prev.filter(p => p.path !== cp.path));
    reload();
  };

  const filtered = useMemo(() => {
    let list = [...projects];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => ((sessionTimes[b.id] || '')).localeCompare(sessionTimes[a.id] || ''));
    return list;
  }, [projects, search]);

  const handleSave = async (project: Project) => {
    const all = await window.electronAPI.getProjects();
    all.push(project);
    await window.electronAPI.saveProjects(all);
    setEditProject(null);
    reload();
  };

  const handleDelete = async (id: string) => {
    const all = await window.electronAPI.getProjects();
    await window.electronAPI.saveProjects(all.filter(p => p.id !== id));
    reload();
  };

  return (
    <div className={window.location.hash === '#project-selector' ? 'popup-root' : 'project-selector-inline'}>
      <div className="popup-body">
        <div className="selector-toolbar">
          <input className="selector-search" placeholder="搜索项目..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className="primary" onClick={() => setEditProject({})}>+ 新建项目</button>
          <button onClick={handleScanClaude}>扫描 Claude 会话</button>
        </div>

        <div className="selector-grid">
          {filtered.length === 0 && (
            <div className="selector-empty">
              <p>{search ? '没有匹配的项目' : '暂无项目，点击 + 新建项目 添加'}</p>
            </div>
          )}
          {filtered.map(p => (
            <div key={p.id} className="card project-card" onClick={() => window.electronAPI.selectProject(p.id)}>
              <div className="project-card-header">
                <span className="project-card-name">{p.name}</span>
              </div>
              <div className="project-card-path text-sm text-muted">{p.path}</div>
              {p.tags && p.tags.length > 0 && (
                <div className="project-card-tags">{p.tags.map(t => (
                  <span key={t} className="tag">{t}</span>
                ))}</div>
              )}
              <div className="project-card-footer">
                <span className="text-sm text-muted">{sessionTimes[p.id] ? formatTime(sessionTimes[p.id]!) : ''}</span>
                <div className="project-card-actions">
                  <button className="btn-sm" onClick={e => { e.stopPropagation(); setEditProject(p); }}>编辑</button>
                  <button className="btn-sm btn-danger" onClick={e => {
                    e.stopPropagation();
                    if (confirm(`删除项目 "${p.name}"？`)) handleDelete(p.id);
                  }}>删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {showImport && claudeProjects.length > 0 && (
          <div className="import-panel">
            <div className="import-header">
              <span className="title-sm">发现 {claudeProjects.length} 个未导入的 Claude 项目</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" onClick={handleImportAll}>全部导入</button>
                <button onClick={() => setShowImport(false)}>关闭</button>
              </div>
            </div>
            <div className="import-list">
              {claudeProjects.map(cp => (
                <div key={cp.path} className="import-row">
                  <div>
                    <span className="text-bold">{cp.name}</span>
                    <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{cp.path}</span>
                  </div>
                  <span className="text-sm text-muted">{cp.sessionCount} 个会话</span>
                  <button className="btn-sm" onClick={() => handleImportOne(cp)}>导入</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {showImport && claudeProjects.length === 0 && (
          <div className="import-panel">
            <span className="text-muted">没有发现新的 Claude 项目</span>
            <button className="btn-sm" onClick={() => setShowImport(false)} style={{ marginLeft: 8 }}>关闭</button>
          </div>
        )}

        {editProject !== null && (
          <ProjectEditDialog
            project={editProject}
            onSave={handleSave}
            onClose={() => setEditProject(null)}
          />
        )}
      </div>
    </div>
  );
}
