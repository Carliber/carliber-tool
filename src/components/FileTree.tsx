import { useState, useEffect, useCallback, useRef, useMemo, memo, type MouseEvent } from 'react';
import type { FileEntry } from '../types/electron';

interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

interface FileTreeProps {
  projectPath: string;
  onFileSelect: (entry: FileEntry) => void;
  activeFilePath?: string;
}

const LANG_ICONS: Record<string, string> = {
  '.ts': 'TS', '.tsx': 'TX', '.js': 'JS', '.jsx': 'JX',
  '.json': '{}', '.md': 'M', '.css': '#', '.html': '<>',
  '.py': 'Py', '.rs': 'Rs', '.go': 'Go',
};

function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i) : '';
}

function pathSep(p: string): string {
  return p.includes('/') ? '/' : '\\';
}

function parentDir(p: string): string {
  const sep = pathSep(p);
  return p.substring(0, p.lastIndexOf(sep));
}

function FileIcon({ name, type }: { name: string; type: 'file' | 'dir' }) {
  if (type === 'dir') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4a1 1 0 011-1h3.5a1 1 0 01.8.4L8.5 5.1a1 1 0 00.8.4H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
      </svg>
    );
  }
  const badge = LANG_ICONS[getExt(name)];
  if (badge) return <span className="file-ext-icon">{badge}</span>;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 1.5h5.5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode | null;
  dirPath: string;
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const result: TreeNode[] = [];
  for (const n of nodes) {
    if (n.type === 'dir') {
      const filteredChildren = filterTree(n.children || [], q);
      if (filteredChildren.length > 0 || n.name.toLowerCase().includes(q)) {
        result.push({ ...n, children: filteredChildren.length > 0 ? filteredChildren : n.children });
      }
    } else if (n.name.toLowerCase().includes(q)) {
      result.push(n);
    }
  }
  return result;
}
function RootNewItemInput({ newItem, onCreate, onCancel }: { newItem: { dirPath: string; type: 'file' | 'dir' }; onCreate: (name: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="tree-node" style={{ paddingLeft: 4 }}>
      <span className="tree-arrow-space" />
      <span className="tree-icon">
        {newItem.type === 'dir' ? <FileIcon name="" type="dir" /> : <FileIcon name=".txt" type="file" />}
      </span>
      <input
        ref={ref}
        className="tree-rename-input"
        placeholder={newItem.type === 'file' ? '文件名' : '文件夹名'}
        onBlur={e => { if (e.target.value.trim()) onCreate(e.target.value); else onCancel(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (v.trim()) onCreate(v); else onCancel(); }
          if (e.key === 'Escape') onCancel();
        }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

export default function FileTree({ projectPath, onFileSelect, activeFilePath }: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const expandedRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);
  const onFileSelectRef = useRef(onFileSelect);
  onFileSelectRef.current = onFileSelect;
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [newItem, setNewItem] = useState<{ dirPath: string; type: 'file' | 'dir' } | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const loadChildren = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.electronAPI.readDir(dirPath);
      return entries.map(e => ({
        id: e.path,
        name: e.name,
        path: e.path,
        type: e.type,
        children: e.type === 'dir' ? [] : undefined,
      }));
    } catch { return []; }
  }, []);

  const loadRoot = useCallback(async () => {
    const children = await loadChildren(projectPath);
    setTree(children);
  }, [projectPath, loadChildren]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  useEffect(() => {
    window.electronAPI.watchDir(projectPath);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const remove = window.electronAPI.onFsChange(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        loadRoot();
        const expanded = expandedRef.current;
        const refreshExpanded = async (nodes: TreeNode[]) => {
          for (const n of nodes) {
            if (n.type === 'dir' && expanded.has(n.id)) {
              const children = await loadChildren(n.path);
              setTree(prev => updateChildren(prev, n.id, children));
              if (n.children) await refreshExpanded(n.children);
            }
          }
        };
        setTree(current => { refreshExpanded(current); return current; });
      }, 200);
    });
    return () => {
      if (timer) clearTimeout(timer);
      remove();
      window.electronAPI.unwatchDir(projectPath);
    };
  }, [projectPath, loadRoot, loadChildren]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const toggleDir = useCallback(async (node: TreeNode) => {
    const expanded = expandedRef.current;
    if (expanded.has(node.id)) {
      expanded.delete(node.id);
    } else {
      if (!node.children || node.children.length === 0) {
        const children = await loadChildren(node.path);
        setTree(prev => updateChildren(prev, node.id, children));
      }
      expanded.add(node.id);
    }
    forceUpdate(n => n + 1);
  }, [loadChildren]);

  const handleClick = useCallback((node: TreeNode) => {
    if (renaming || newItem) return;
    if (node.type === 'dir') {
      toggleDir(node);
    } else {
      onFileSelectRef.current({ name: node.name, path: node.path, type: 'file', size: 0, mtime: '' });
    }
  }, [toggleDir, renaming, newItem]);

  const handleContextMenu = useCallback((e: MouseEvent, node: TreeNode | null) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = treeRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dirPath = node
      ? (node.type === 'dir' ? node.path : parentDir(node.path))
      : projectPath;
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, node, dirPath });
  }, [projectPath]);

  const handleCreateFile = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !newItem) return;
    const fullPath = newItem.dirPath + pathSep(newItem.dirPath) + trimmed;
    try {
      await (newItem.type === 'file'
        ? window.electronAPI.createFile(fullPath)
        : window.electronAPI.createDir(fullPath));
    } catch (e) {
      alert(`创建失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    setNewItem(null);
  }, [newItem]);

  const handleRename = useCallback(async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) { setRenaming(null); return; }
    const newPath = parentDir(id) + pathSep(id) + trimmed;
    if (newPath !== id) {
      try {
        await window.electronAPI.renamePath(id, newPath);
      } catch (e) {
        alert(`重命名失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setRenaming(null);
  }, []);

  const handleDelete = useCallback(async (node: TreeNode) => {
    const msg = node.type === 'dir' ? `删除文件夹 "${node.name}" 及其所有内容？` : `删除文件 "${node.name}"？`;
    if (!confirm(msg)) return;
    try {
      await window.electronAPI.deletePath(node.path);
    } catch (e) {
      alert(`删除失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    setContextMenu(null);
  }, []);

  const refreshDir = useCallback(async (dirPath: string) => {
    const children = await loadChildren(dirPath);
    if (dirPath === projectPath) {
      setTree(children);
    } else {
      setTree(prev => updateChildren(prev, dirPath, children));
    }
  }, [projectPath, loadChildren]);

  const expanded = expandedRef.current;

  const visibleTree = useMemo(() => {
    let nodes = tree;
    if (!showHidden) {
      nodes = filterHidden(nodes);
    }
    if (search) {
      nodes = filterTree(nodes, search.toLowerCase());
    }
    return nodes;
  }, [tree, showHidden, search]);

  return (
    <div className="file-tree-container" ref={treeRef}>
      <div className="sidebar-toolbar">
        <input
          className="sidebar-search"
          type="text"
          placeholder="搜索文件..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className={`toolbar-btn ${showHidden ? 'active' : ''}`} onClick={() => setShowHidden(p => !p)} title="显示隐藏文件">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
            <circle cx="8" cy="8" r="2" />
          </svg>
        </button>
        <button className="toolbar-btn" onClick={() => { setNewItem({ dirPath: projectPath, type: 'file' }); }} title="新建文件">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M4 1.5h5.5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z" />
            <path d="M9.5 1.5V5H13" />
            <path d="M6 9h4M8 7v4" />
          </svg>
        </button>
        <button className="toolbar-btn" onClick={() => { setNewItem({ dirPath: projectPath, type: 'dir' }); }} title="新建文件夹">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 4a1 1 0 011-1h3.5a1 1 0 01.8.4L8.5 5.1a1 1 0 00.8.4H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
            <path d="M7 8.5h4M9 7v3" />
          </svg>
        </button>
      </div>
      <div className="file-tree" onContextMenu={e => handleContextMenu(e, null)}>
        {newItem?.dirPath === projectPath && (
          <RootNewItemInput newItem={newItem} onCreate={handleCreateFile} onCancel={() => setNewItem(null)} />
        )}
        {visibleTree.map(node => (
          <TreeNodeView
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onClick={handleClick}
            activeFilePath={activeFilePath}
            onContextMenu={handleContextMenu}
            renaming={renaming}
            onRename={handleRename}
            onStartRename={setRenaming}
            newItem={newItem}
            onCreate={handleCreateFile}
            onCancelCreate={() => setNewItem(null)}
          />
        ))}
      </div>
      {contextMenu && (
        <div className="tree-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.node ? (
            <>
              <div className="tree-context-item" onClick={() => { setRenaming({ id: contextMenu.node!.id, name: contextMenu.node!.name }); setContextMenu(null); }}>
                重命名
              </div>
              <div className="tree-context-item danger" onClick={() => { if (contextMenu.node) handleDelete(contextMenu.node); }}>
                删除
              </div>
              {contextMenu.node.type === 'dir' && (
                <>
                  <div className="tree-context-separator" />
                  <div className="tree-context-item" onClick={() => { setNewItem({ dirPath: contextMenu.node!.path, type: 'file' }); setContextMenu(null); }}>
                    新建文件
                  </div>
                  <div className="tree-context-item" onClick={() => { setNewItem({ dirPath: contextMenu.node!.path, type: 'dir' }); setContextMenu(null); }}>
                    新建文件夹
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="tree-context-item" onClick={() => { refreshDir(projectPath); setContextMenu(null); }}>
                刷新
              </div>
              <div className="tree-context-separator" />
              <div className="tree-context-item" onClick={() => { setNewItem({ dirPath: projectPath, type: 'file' }); setContextMenu(null); }}>
                新建文件
              </div>
              <div className="tree-context-item" onClick={() => { setNewItem({ dirPath: projectPath, type: 'dir' }); setContextMenu(null); }}>
                新建文件夹
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function filterHidden(nodes: TreeNode[]): TreeNode[] {
  return nodes.filter(n => !n.name.startsWith('.')).map(n =>
    n.children ? { ...n, children: filterHidden(n.children) } : n
  );
}

interface TreeNodeViewProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onClick: (node: TreeNode) => void;
  activeFilePath?: string;
  onContextMenu: (e: MouseEvent, node: TreeNode | null) => void;
  renaming: { id: string; name: string } | null;
  onRename: (id: string, newName: string) => void;
  onStartRename: (v: { id: string; name: string } | null) => void;
  newItem: { dirPath: string; type: 'file' | 'dir' } | null;
  onCreate: (name: string) => void;
  onCancelCreate: () => void;
}

const TreeNodeView = memo(function TreeNodeView({
  node, depth, expanded, onClick, activeFilePath,
  onContextMenu, renaming, onRename, onStartRename,
  newItem, onCreate, onCancelCreate,
}: TreeNodeViewProps) {
  const isExpanded = expanded.has(node.id);
  const isActive = activeFilePath === node.path;
  const isDir = node.type === 'dir';
  const isRenaming = renaming?.id === node.id;
  const renameRef = useRef<HTMLInputElement>(null);
  const newItemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (newItem?.dirPath === node.path && isDir && isExpanded && newItemRef.current) {
      newItemRef.current.focus();
    }
  }, [newItem, node.path, isDir, isExpanded]);

  return (
    <div>
      <div
        className={`tree-node ${isActive ? 'tree-node-active' : ''}`}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={() => onClick(node)}
        onContextMenu={e => { e.stopPropagation(); onContextMenu(e, node); }}
        onDoubleClick={() => { if (!isDir) onStartRename({ id: node.id, name: node.name }); }}
      >
        {isDir && (
          <span className={`tree-arrow ${isExpanded ? 'tree-arrow-open' : ''}`}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </span>
        )}
        {!isDir && <span className="tree-arrow-space" />}
        <span className="tree-icon"><FileIcon name={node.name} type={node.type} /></span>
        {isRenaming ? (
          <input
            ref={renameRef}
            className="tree-rename-input"
            defaultValue={node.name}
            onBlur={e => onRename(node.id, e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onRename(node.id, (e.target as HTMLInputElement).value);
              if (e.key === 'Escape') onStartRename(null);
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="tree-label">{node.name}</span>
        )}
      </div>
      {isDir && isExpanded && node.children && (
        <>
          {newItem?.dirPath === node.path && (
            <div className="tree-node" style={{ paddingLeft: (depth + 1) * 12 + 4 }}>
              <span className="tree-arrow-space" />
              <span className="tree-icon">
                {newItem.type === 'dir' ? <FileIcon name="" type="dir" /> : <FileIcon name=".txt" type="file" />}
              </span>
              <input
                ref={newItemRef}
                className="tree-rename-input"
                placeholder={newItem.type === 'file' ? '文件名' : '文件夹名'}
                onBlur={e => { if (e.target.value.trim()) onCreate(e.target.value); else onCancelCreate(); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (v.trim()) onCreate(v); else onCancelCreate(); }
                  if (e.key === 'Escape') onCancelCreate();
                }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
          {node.children.map(child => (
            <TreeNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onClick={onClick}
              activeFilePath={activeFilePath}
              onContextMenu={onContextMenu}
              renaming={renaming}
              onRename={onRename}
              onStartRename={onStartRename}
              newItem={newItem}
              onCreate={onCreate}
              onCancelCreate={onCancelCreate}
            />
          ))}
        </>
      )}
    </div>
  );
});

function updateChildren(nodes: TreeNode[], targetId: string, children: TreeNode[]): TreeNode[] {
  return nodes.map(n => {
    if (n.id === targetId) return { ...n, children };
    if (n.children) {
      const updated = updateChildren(n.children, targetId, children);
      if (updated !== n.children) return { ...n, children: updated };
    }
    return n;
  });
}
