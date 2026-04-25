import { useState, type FormEvent } from 'react';
import { createProject, updateProject, openDirectoryPicker } from '../utils/storage';
import type { Project } from '../types/electron';

const STATUS_OPTIONS = [
  { value: 'active', label: '进行中' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
];

export default function ProjectEditDialog({ project, onSave, onClose }: {
  project: Partial<Project>;
  onSave: (project: Project) => void;
  onClose: () => void;
}) {
  const isNew = !project.id;
  const [name, setName] = useState(project.name || '');
  const [path, setPath] = useState(project.path || '');
  const [description, setDescription] = useState(project.description || '');
  const [tags, setTags] = useState((project.tags || []).join(', '));
  const [status, setStatus] = useState<Project['status']>(project.status || 'active');

  const handleBrowse = async () => {
    const dir = await openDirectoryPicker();
    if (dir) setPath(dir);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tagList = tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const result = isNew
      ? createProject({ name: name.trim(), path: path.trim(), description: description.trim(), tags: tagList, status })
      : updateProject(project as Project, { name: name.trim(), path: path.trim(), description: description.trim(), tags: tagList, status });

    onSave(result);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{isNew ? '新建项目' : '编辑项目'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>名称 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="项目名称" autoFocus />
          </div>
          <div className="form-group">
            <label>路径</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={path} onChange={e => setPath(e.target.value)} placeholder="项目路径" style={{ flex: 1 }} />
              <button type="button" onClick={handleBrowse}>浏览</button>
            </div>
          </div>
          <div className="form-group">
            <label>描述</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="描述" rows={3} />
          </div>
          <div className="form-group">
            <label>标签</label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="标签（逗号分隔）" />
          </div>
          <div className="form-group">
            <label>状态</label>
            <select value={status} onChange={e => setStatus(e.target.value as Project['status'])}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="submit" className="primary" disabled={!name.trim()}>保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}
