import { useApp } from '../context/AppContext';
import FileTree from './FileTree';
import type { FileEntry } from '../types/electron';

interface SidebarProps {
  onFileSelect: (entry: FileEntry) => void;
  activeFilePath?: string;
}

export default function Sidebar({ onFileSelect, activeFilePath }: SidebarProps) {
  const { state } = useApp();
  const project = state.projects.find(p => p.id === state.currentProjectId);

  if (!project) return null;

  return (
    <div className="sidebar-inner">
      <div className="sidebar-tree">
        <FileTree
          projectPath={project.path}
          onFileSelect={onFileSelect}
          activeFilePath={activeFilePath}
        />
      </div>
    </div>
  );
}
