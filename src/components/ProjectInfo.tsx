import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { openDirectory, openNativeTerminal } from '../utils/storage';
import type { Project } from '../types/electron';
import ProjectEditDialog from './ProjectEditDialog';

export default function ProjectInfo() {
  const { state, updateProject: updateInContext } = useApp();
  const [editing, setEditing] = useState(false);
  const [lastSessionTime, setLastSessionTime] = useState<string | null>(null);
  const project = state.projects.find((p) => p.id === state.currentProjectId);

  useEffect(() => {
    if (project) {
      window.electronAPI.getLastSessionTime(project.path).then(setLastSessionTime);
    }
  }, [project?.path]);

  if (!project) return <div>项目不存在</div>;

  const handleSave = async (updated: Project) => {
    await updateInContext(updated);
    setEditing(false);
  };

  return (
    <div className="project-info">
      <div className="project-info-header">
        <h2 className="title-lg">{project.name}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="btn-sm" onClick={() => setEditing(true)} title="编辑">✎</button>
          <button className="btn-sm" onClick={() => openDirectory(project.path)} title="打开目录">📂</button>
          <button className="btn-sm" onClick={() => openNativeTerminal(project.path)} title="打开终端">⌨</button>
        </div>
      </div>
      <div className="separator" />
      <div className="info-grid">
        <InfoRow label="路径" value={project.path} />
        <InfoRow label="描述" value={project.description || '无'} />
        <InfoRow label="标签" value={project.tags.length ? project.tags.join(', ') : '无'} />
        <InfoRow label="创建时间" value={formatDate(project.createdAt)} />
        <InfoRow label="最近会话" value={lastSessionTime ? formatDate(lastSessionTime) : '无会话'} />
      </div>

      {editing && (
        <ProjectEditDialog
          project={project}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}:</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return iso; }
}
