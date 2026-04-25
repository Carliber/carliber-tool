const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProjects: (projects) => ipcRenderer.invoke('save-projects', projects),

  // System
  openDirectory: (path) => ipcRenderer.invoke('open-directory', path),
  openNativeTerminal: (cwd) => ipcRenderer.invoke('open-native-terminal', cwd),
  openDirectoryPicker: () => ipcRenderer.invoke('open-directory-picker'),
  openFilePicker: () => ipcRenderer.invoke('open-file-picker'),
  detectClaudeCli: () => ipcRenderer.invoke('detect-claude-cli'),
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),

  // File operations
  readDir: (path) => ipcRenderer.invoke('read-dir', path),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', path, content),
  createFile: (path) => ipcRenderer.invoke('create-file', path),
  createDir: (path) => ipcRenderer.invoke('create-dir', path),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('rename-path', oldPath, newPath),
  deletePath: (path) => ipcRenderer.invoke('delete-path', path),
  watchDir: (path) => ipcRenderer.invoke('watch-dir', path),
  unwatchDir: (path) => ipcRenderer.invoke('unwatch-dir', path),
  onFsChange: (callback) => {
    const handler = (_, evt) => callback(evt);
    ipcRenderer.on('fs-change', handler);
    return () => ipcRenderer.removeListener('fs-change', handler);
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Popup windows
  openProjectSelector: () => ipcRenderer.invoke('open-project-selector'),
  openClaudeSettings: () => ipcRenderer.invoke('open-claude-settings'),
  selectProject: (projectId) => ipcRenderer.send('select-project', projectId),
  closePopup: () => ipcRenderer.send('close-popup'),
  onProjectSelected: (callback) => {
    const handler = (_, id) => callback(id);
    ipcRenderer.on('project-selected', handler);
    return () => ipcRenderer.removeListener('project-selected', handler);
  },

  // PTY
  onPtyData: (callback) => {
    const handler = (_, sessionId, data) => callback(sessionId, data);
    ipcRenderer.on('pty:data', handler);
    return () => ipcRenderer.removeListener('pty:data', handler);
  },
  onPtyExit: (callback) => {
    const handler = (_, sessionId, exitCode) => callback(sessionId, exitCode);
    ipcRenderer.on('pty:exit', handler);
    return () => ipcRenderer.removeListener('pty:exit', handler);
  },
  createTerminal: (sessionId, cwd, cols, rows) => ipcRenderer.invoke('pty:create', sessionId, cwd, cols, rows),
  writeTerminal: (sessionId, data) => ipcRenderer.send('pty:write', sessionId, data),
  resizeTerminal: (sessionId, cols, rows) => ipcRenderer.send('pty:resize', sessionId, cols, rows),
  killTerminal: (sessionId) => ipcRenderer.invoke('pty:kill', sessionId),

  // Claude global settings
  getClaudeSettings: () => ipcRenderer.invoke('get-claude-settings'),
  saveClaudeSettings: (data) => ipcRenderer.invoke('save-claude-settings', data),
  getClaudeLocalSettings: () => ipcRenderer.invoke('get-claude-local-settings'),
  saveClaudeLocalSettings: (data) => ipcRenderer.invoke('save-claude-local-settings', data),
  getClaudeMd: () => ipcRenderer.invoke('get-claude-md'),
  saveClaudeMd: (content) => ipcRenderer.invoke('save-claude-md', content),
  getClaudeDir: () => ipcRenderer.invoke('get-claude-dir'),
  scanClaudeProjects: () => ipcRenderer.invoke('scan-claude-projects'),
  getSessions: (projectPath) => ipcRenderer.invoke('get-sessions', projectPath),
  getSessionMessages: (projectPath, sessionId) => ipcRenderer.invoke('get-session-messages', projectPath, sessionId),
  deleteSession: (projectPath, sessionId) => ipcRenderer.invoke('delete-session', projectPath, sessionId),
  getLastSessionTime: (projectPath) => ipcRenderer.invoke('get-last-session-time', projectPath),

  // Project-level Claude settings
  getProjectSettings: (projectPath) => ipcRenderer.invoke('get-project-settings', projectPath),
  saveProjectSettings: (projectPath, data) => ipcRenderer.invoke('save-project-settings', projectPath, data),
  getProjectClaudeMd: (projectPath) => ipcRenderer.invoke('get-project-claude-md', projectPath),
  saveProjectClaudeMd: (projectPath, content) => ipcRenderer.invoke('save-project-claude-md', projectPath, content),
  getProjectRules: (projectPath) => ipcRenderer.invoke('get-project-rules', projectPath),
  saveProjectRule: (projectPath, name, content) => ipcRenderer.invoke('save-project-rule', projectPath, name, content),
  deleteProjectRule: (projectPath, name) => ipcRenderer.invoke('delete-project-rule', projectPath, name),

  // Global Claude rules
  getGlobalRules: () => ipcRenderer.invoke('get-global-rules'),
  saveGlobalRule: (name, content) => ipcRenderer.invoke('save-global-rule', name, content),
  deleteGlobalRule: (name) => ipcRenderer.invoke('delete-global-rule', name),

  // Renderer error reporting
  reportError: (message, source, line, col, error) => ipcRenderer.send('renderer-error', { message, source, line, col, error: error?.stack || '' }),
});
