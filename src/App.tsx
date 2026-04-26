import { useState, useCallback, useRef, useEffect, useMemo, type MouseEvent, type ReactNode } from 'react';
import './styles/global.css';
import { AppProvider, useApp } from './context/AppContext';
import ProjectSelector from './components/ProjectSelector';
import ClaudeSettings from './components/ClaudeSettings';
import Sidebar from './components/Sidebar';
import Titlebar from './components/Titlebar';
import ProjectInfo from './components/ProjectInfo';
import TerminalPanel from './components/TerminalPanel';
import { SessionList, SessionDetail } from './components/SessionsView';
import Settings from './components/Settings';
import ClaudeChat from './components/ClaudeChat';
import type { ClaudeChatHandle } from './components/ClaudeChat';
import StatusBar from './components/StatusBar';
import FileEditor from './components/FileEditor';
import { createRoot } from 'react-dom/client';
import { createProject, openDirectoryPicker } from './utils/storage';
import type { FileEntry } from './types/electron';

const hash = window.location.hash;

// Global error reporting to main process
window.onerror = (message, source, line, col, error) => {
  window.electronAPI?.reportError?.(String(message), source || '', line || 0, col || 0, error);
};
window.addEventListener('unhandledrejection', (e) => {
  window.electronAPI?.reportError?.(`Unhandled rejection: ${e.reason}`, '', 0, 0, undefined);
});

if (hash === '#project-selector') {
  createRoot(document.getElementById('root')!).render(<ProjectSelector />);
} else if (hash === '#claude-settings') {
  createRoot(document.getElementById('root')!).render(<ClaudeSettings />);
} else if (hash.startsWith('#workspace/')) {
  const projectId = hash.replace('#workspace/', '');
  createRoot(document.getElementById('root')!).render(
    <AppProvider initialProjectId={projectId}>
      <Workspace />
    </AppProvider>
  );
} else {
  createRoot(document.getElementById('root')!).render(
    <AppProvider>
      <Hub />
    </AppProvider>
  );
}

function Hub() {
  return (
    <div className="app-root">
      <Titlebar title="Claude Tool" />
      <div className="app-body">
        <div className="empty-workspace">
          <h2>Claude Tool</h2>
          <p className="text-muted">选择或创建项目开始</p>
          <button className="primary"
            onClick={() => window.electronAPI.openProjectSelector()}>
            打开项目
          </button>
        </div>
      </div>
    </div>
  );
}

function Workspace() {
  const { state, updateSettings, addProject } = useApp();
  const [openFiles, setOpenFiles] = useState<FileEntry[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(-1);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const draggingRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['info']));
  const workspaceMainRef = useRef<HTMLDivElement>(null);
  const rightPanelInitialized = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const addProjectRef = useRef(addProject);
  addProjectRef.current = addProject;
  const openSectionsRef = useRef(openSections);
  openSectionsRef.current = openSections;
  const chatRef = useRef<ClaudeChatHandle>(null);

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] ?? null : null;

  const handleFileSelect = useCallback((entry: FileEntry) => {
    setActiveSessionId(null);
    const existing = openFiles.findIndex(f => f.path === entry.path);
    if (existing >= 0) {
      setActiveFileIndex(existing);
      return;
    }
    setActiveFileIndex(openFiles.length);
    setOpenFiles([...openFiles, entry]);
  }, [openFiles]);

  const handleCloseFile = useCallback((index: number) => {
    const next = openFiles.filter((_, i) => i !== index);
    setOpenFiles(next);
    setActiveFileIndex(i => {
      if (i >= next.length) return next.length - 1;
      if (i > index) return i - 1;
      return i;
    });
  }, [openFiles]);

  const openSettingsTab = useCallback((kind: 'app-settings' | 'claude-global') => {
    const virtualPath = `__virtual__::${kind}`;
    const name = kind === 'app-settings' ? '选项' : '设置';
    const existing = openFiles.findIndex(f => f.path === virtualPath);
    if (existing >= 0) {
      setActiveFileIndex(existing);
      return;
    }
    setActiveFileIndex(openFiles.length);
    setOpenFiles([...openFiles, { name, path: virtualPath, type: 'file', size: 0, mtime: '', kind }]);
  }, [openFiles]);

  const recentProjects = useMemo(() => {
    return [...state.projects].sort((a, b) =>
      (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || '')
    ).slice(0, 10);
  }, [state.projects]);

  const handleOpenFolder = useCallback(async () => {
    setShowFileMenu(false);
    const dir = await openDirectoryPicker();
    if (!dir) return;
    const existing = stateRef.current.projects.find(p => p.path === dir);
    if (existing) {
      window.electronAPI.selectProject(existing.id);
    } else {
      const clean = dir.replace(/[/\\]+$/, '');
      const name = clean.split(/[/\\]/).pop() || clean;
      const proj = createProject({ name, path: dir });
      await addProjectRef.current(proj);
      window.electronAPI.selectProject(proj.id);
    }
  }, []);

  const handleOpenRecent = useCallback((id: string) => {
    setShowFileMenu(false);
    window.electronAPI.selectProject(id);
  }, []);

  useEffect(() => {
    if (!showFileMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-trigger')) setShowFileMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFileMenu]);

  const toggleRightPanel = useCallback(() => {
    setShowRightPanel(prev => {
      updateSettings({ ...stateRef.current.settings, rightPanelOpen: !prev });
      return !prev;
    });
  }, [updateSettings]);

  const toggleSection = useCallback((tab: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab); else next.add(tab);
      return next;
    });
  }, []);

  const handleResizeStart = useCallback((side: 'left' | 'right', e: MouseEvent) => {
    e.preventDefault();
    draggingRef.current = { side, startX: e.clientX, startWidth: side === 'left' ? sidebarWidth : rightPanelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const { side: s, startX: sx, startWidth: sw } = draggingRef.current;
      const delta = ev.clientX - sx;
      const next = s === 'left' ? Math.max(160, Math.min(600, sw + delta)) : Math.max(200, Math.min(600, sw - delta));
      if (s === 'left') setSidebarWidth(next); else setRightPanelWidth(next);
    };
    const onUp = () => {
      draggingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth, rightPanelWidth]);

  useEffect(() => {
    const s = state.settings;
    const root = document.documentElement;
    root.style.setProperty('--ui-font-size', `${s.uiFontSize || 14}px`);
    root.style.setProperty('--editor-font-size', `${s.editorFontSize || 13}px`);
    root.style.setProperty('--terminal-font-size', `${s.terminalFontSize || 14}px`);
    root.style.setProperty('--tree-font-size', `${s.treeFontSize || 13}px`);
  }, [state.settings.uiFontSize, state.settings.editorFontSize, state.settings.terminalFontSize, state.settings.treeFontSize]);

  useEffect(() => {
    if (!rightPanelInitialized.current && state.loaded) {
      rightPanelInitialized.current = true;
      if (state.settings.rightPanelOpen) setShowRightPanel(true);
    }
  }, [state.loaded, state.settings.rightPanelOpen]);

  if (!state.loaded) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-muted">加载中...</span>
      </div>
    );
  }

  const project = state.projects.find(p => p.id === state.currentProjectId);
  const theme = state.settings?.theme || 'light';

  if (!project) {
    return (
      <div className="app-root">
        <div className="app-body">
          <div className="empty-workspace">
            <p className="text-muted">项目不存在</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="menubar">
        <div className="menubar-left">
          <div className={`menubar-item menubar-icon-btn ${showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(prev => !prev)} title="资源面板">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 2v12" stroke="currentColor" stroke-width="1.3"/></svg>
          </div>
          <div className="menubar-item dropdown-trigger" onClick={() => setShowFileMenu(prev => !prev)}>
            文件
            {showFileMenu && (
              <div className="dropdown-menu" onClick={e => e.stopPropagation()}>
                <div className="dropdown-item" onClick={handleOpenFolder}>打开新文件夹</div>
                {recentProjects.length > 0 && (
                  <>
                    <div className="dropdown-separator" />
                    <div className="dropdown-label">最近打开</div>
                    {recentProjects.map(p => (
                      <div key={p.id} className="dropdown-item" onClick={() => handleOpenRecent(p.id)}>
                        <span>{p.name}</span>
                        <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{p.path}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <div className={`menubar-item ${activeFile?.kind === 'app-settings' ? 'active' : ''}`} onClick={() => openSettingsTab('app-settings')}>
            选项
          </div>
          <div className={`menubar-item ${activeFile?.kind === 'claude-global' ? 'active' : ''}`} onClick={() => openSettingsTab('claude-global')}>
            设置
          </div>
        </div>
        <div className="menubar-right">
          <div className={`menubar-item menubar-project ${showRightPanel ? 'active' : ''}`}
            onClick={() => toggleRightPanel()}>
            {project.name}
          </div>
          <div className="titlebar-controls">
            <button className="titlebar-btn" onClick={() => window.electronAPI.minimizeWindow()} title="最小化">&#x2500;</button>
            <button className="titlebar-btn" onClick={() => window.electronAPI.maximizeWindow()} title="最大化">&#x25A1;</button>
            <button className="titlebar-btn titlebar-btn-close" onClick={() => window.electronAPI.closeWindow()} title="关闭">&#x2715;</button>
          </div>
        </div>
      </div>
      <div className="app-body">
        {showSidebar ? (
          <>
            <div className="sidebar" style={{ width: sidebarWidth }}>
              <Sidebar
                onFileSelect={handleFileSelect}
                activeFilePath={activeFile?.path}
              />
            </div>
            <div className="resize-bar" onMouseDown={e => handleResizeStart('left', e)} />
          </>
        ) : null}
        <div className="workspace-main" ref={workspaceMainRef}>
          <div className="editor-tabs">
            {openFiles.map((f, i) => (
              <div
                key={f.path}
                className={`editor-tab ${i === activeFileIndex ? 'editor-tab-active' : ''}`}
                onClick={() => setActiveFileIndex(i)}
              >
                <span className="editor-tab-name">{f.name}</span>
                <button className="editor-tab-close" onClick={e => { e.stopPropagation(); handleCloseFile(i); }}>✕</button>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4 }}>
              <button className={`editor-tab-toggle ${state.settings.beautifyTerminal !== false ? 'active' : ''}`}
                onClick={() => updateSettings({ ...state.settings, beautifyTerminal: state.settings.beautifyTerminal === false })}
                title={state.settings.beautifyTerminal !== false ? '切换原始终端' : '切换对话界面'}>
                {state.settings.beautifyTerminal !== false ? '💬' : '⌨'}
              </button>
            </div>
          </div>
          <div className="workspace-content">
            <div className="workspace-terminal" style={{ display: (openFiles.length > 0 || activeSessionId) ? 'none' : 'flex' }}>
              {state.settings.beautifyTerminal !== false ? <ClaudeChat ref={chatRef} /> : <TerminalPanel />}
            </div>
            {openFiles.length > 0 && !activeSessionId && (
              <div className="workspace-editor">
                <div className="editor-tab-panels">
                  {openFiles.map((f, i) => (
                    <div key={f.path} style={{ display: i === activeFileIndex ? 'contents' : 'none' }}>
                      {f.kind === 'app-settings' || f.kind === 'claude-global' ? (
                        <Settings key={f.path} mode={f.kind === 'app-settings' ? 'app' : 'claude-global'} />
                      ) : (
                        <FileEditor
                          file={f}
                          onClose={() => handleCloseFile(i)}
                          theme={theme}
                          fontSize={state.settings.editorFontSize || 13}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeSessionId && (
              <div className="workspace-editor">
                <SessionDetail sessionId={activeSessionId} onClose={() => setActiveSessionId(null)} />
              </div>
            )}
          </div>
        </div>
        {showRightPanel && (
          <>
            <div className="resize-bar" onMouseDown={e => handleResizeStart('right', e)} />
            <div className="right-panel" style={{ width: rightPanelWidth }}>
            <AccordionSection title="项目信息" id="info" open={openSections.has('info')} onToggle={toggleSection}>
              <ProjectInfo />
            </AccordionSection>
            <AccordionSection title="会话记录" id="sessions" open={openSections.has('sessions')} onToggle={toggleSection}>
              <SessionList onOpenSession={(id) => { setActiveSessionId(id); chatRef.current?.loadSession(id); }} />
            </AccordionSection>
            <AccordionSection title="项目配置" id="config" open={openSections.has('config')} onToggle={toggleSection}>
              <Settings mode="claude-project" />
            </AccordionSection>
            </div>
          </>
        )}
      </div>
      <StatusBar />
    </div>
  );
}

const sectionIcons: Record<string, ReactNode> = {
  info: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 7v4M8 5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  sessions: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 6h6M5 8.5h4M5 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  config: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
};

function AccordionSection({ title, id, open, onToggle, children }: {
  title: string; id: string; open: boolean;
  onToggle: (id?: string) => void; children: ReactNode;
}) {
  return (
    <div className={`accordion-section accordion-${id}`}>
      <div className="accordion-header" onClick={() => onToggle(id)}>
        <span className={`accordion-arrow ${open ? 'accordion-arrow-open' : ''}`}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </span>
        <span className="accordion-icon">{sectionIcons[id]}</span>
        <span className="accordion-title">{title}</span>
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}