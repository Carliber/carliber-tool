import { useState, useEffect, useMemo } from 'react';
import { formatTime } from '../utils/format';
import type { Project, ScannedProject } from '../types/api';
import ProjectEditDialog from './ProjectEditDialog';
import Titlebar from './Titlebar';
import { scanNewOmpProjects, importScannedProjects } from '../utils/project-scan';
import * as api from '../lib/tauri-api';

export default function ProjectSelector() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [editProject, setEditProject] = useState<Partial<Project> | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [ompProjects, setOmpProjects] = useState<ScannedProject[]>([]);
  const [sessionTimes, setSessionTimes] = useState<Record<string, string | null>>({});

  const loadProjects = async () => {
    const ps = await api.getProjects();
    setProjects(ps);
    // Load session times in background — don't block rendering
    Promise.all(ps.map(async (p) => {
      const t = await api.getLastSessionTime(p.path);
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

  const handleScanOmp = async () => {
    const newOnes = await scanNewOmpProjects();
    setOmpProjects(newOnes);
    setShowImport(true);
  };

  const handleImportAll = async () => {
    await importScannedProjects(ompProjects);
    setShowImport(false);
    reload();
  };

  const handleImportOne = async (cp: ScannedProject) => {
    await importScannedProjects([cp]);
    setOmpProjects(prev => prev.filter(p => p.path !== cp.path));
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
    const all = await api.getProjects();
    all.push(project);
    await api.saveProjects(all);
    setEditProject(null);
    reload();
  };

  const handleDelete = async (id: string) => {
    const all = await api.getProjects();
    await api.saveProjects(all.filter(p => p.id !== id));
    reload();
  };

  return (
    <div className={window.location.hash === '#project-selector' ? 'popup-root' : 'project-selector-inline'}>
      {window.location.hash === '#project-selector' && (
        <Titlebar title="选择项目" showMaximize={false} />
      )}
      <div className="popup-body">
        <div className="selector-toolbar">
          <input className="selector-search" placeholder="搜索项目..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className="primary" onClick={() => setEditProject({})}>+ 新建项目</button>
          <button onClick={handleScanOmp}>扫描 omp 会话</button>
        </div>

        <div className="selector-grid">
          {filtered.length === 0 && (
            <div className="selector-empty">
              <p>{search ? '没有匹配的项目' : '暂无项目，点击 + 新建项目 添加'}</p>
            </div>
          )}
          {filtered.map(p => (
            <div key={p.id} className="card project-card" onClick={() => api.selectProject(p.id)}>
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

        {showImport && ompProjects.length > 0 && (
          <div className="import-panel">
            <div className="import-header">
              <span className="title-sm">发现 {ompProjects.length} 个未导入的 omp 项目</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" onClick={handleImportAll}>全部导入</button>
                <button onClick={() => setShowImport(false)}>关闭</button>
              </div>
            </div>
            <div className="import-list">
              {ompProjects.map(cp => (
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
        {showImport && ompProjects.length === 0 && (
          <div className="import-panel">
            <span className="text-muted">没有发现新的 omp 项目</span>
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
