export interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  tags: string[];
  lastOpenedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppConfig {
  theme: 'light' | 'dark';
  claudeCliPath: string;
  dataDir?: string;
  windowWidth: number;
  windowHeight: number;
  windowX: number;
  windowY: number;
  lastPage?: string;
  closeAction?: 'ask' | 'minimize' | 'quit';
  uiFontSize: number;
  editorFontSize: number;
  terminalFontSize: number;
  treeFontSize: number;
  rightPanelOpen?: boolean;
  beautifyTerminal?: boolean;
}

export interface ClaudeSession {
  sessionId: string;
  title: string;
  messageCount: number;
  startTime: string;
  lastModified: string;
  size: number;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: string;
}

export interface ScannedProject {
  dirName: string;
  path: string;
  name: string;
  sessionCount: number;
  lastModified: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  mtime: string;
  kind?: 'app-settings' | 'claude-global' | 'chat' | 'terminal';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: number;
  tools?: { name: string; input: string; output?: string }[];
  loading?: boolean;
}

export interface FileContent {
  content: string;
  size: number;
  error?: string;
}

export interface ClaudeSettings {
  model?: string;
  agent?: string;
  env?: Record<string, string>;
  permissions?: { allow?: string[]; deny?: string[] };
  hooks?: Record<string, unknown>;
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

interface ElectronAPI {
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<void>;
  getProjects: () => Promise<Project[]>;
  saveProjects: (projects: Project[]) => Promise<void>;
  openDirectory: (path: string) => Promise<void>;
  openNativeTerminal: (cwd: string) => Promise<void>;
  openDirectoryPicker: () => Promise<string | null>;
  openFilePicker: () => Promise<string | null>;
  detectClaudeCli: () => Promise<string | null>;
  exportBackup: () => Promise<boolean>;
  importBackup: () => Promise<boolean>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  openProjectSelector: () => Promise<void>;
  openClaudeSettings: () => Promise<void>;
  selectProject: (projectId: string) => void;
  closePopup: () => void;
  onProjectSelected: (callback: (id: string) => void) => () => void;
  onPtyData: (callback: (sessionId: string, data: string) => void) => () => void;
  onPtyExit: (callback: (sessionId: string, exitCode: number) => void) => () => void;
  createTerminal: (sessionId: string, cwd: string, cols: number, rows: number) => Promise<boolean>;
  writeTerminal: (sessionId: string, data: string) => void;
  resizeTerminal: (sessionId: string, cols: number, rows: number) => void;
  killTerminal: (sessionId: string) => Promise<boolean>;
  getClaudeSettings: () => Promise<ClaudeSettings>;
  saveClaudeSettings: (data: ClaudeSettings) => Promise<boolean>;
  getClaudeLocalSettings: () => Promise<ClaudeSettings>;
  saveClaudeLocalSettings: (data: ClaudeSettings) => Promise<boolean>;
  getClaudeMd: () => Promise<string>;
  saveClaudeMd: (content: string) => Promise<boolean>;
  getClaudeDir: () => Promise<string>;
  scanClaudeProjects: () => Promise<ScannedProject[]>;
  getSessions: (projectPath: string) => Promise<ClaudeSession[]>;
  getSessionMessages: (projectPath: string, sessionId: string) => Promise<SessionMessage[]>;
  deleteSession: (projectPath: string, sessionId: string) => Promise<boolean>;
  getProjectSettings: (projectPath: string) => Promise<ClaudeSettings>;
  saveProjectSettings: (projectPath: string, data: ClaudeSettings) => Promise<boolean>;
  getProjectClaudeMd: (projectPath: string) => Promise<string>;
  saveProjectClaudeMd: (projectPath: string, content: string) => Promise<boolean>;
  getProjectRules: (projectPath: string) => Promise<{ name: string; content: string }[]>;
  saveProjectRule: (projectPath: string, name: string, content: string) => Promise<boolean>;
  deleteProjectRule: (projectPath: string, name: string) => Promise<boolean>;
  getLastSessionTime: (projectPath: string) => Promise<string | null>;
  getGlobalRules: () => Promise<{ name: string; content: string }[]>;
  saveGlobalRule: (name: string, content: string) => Promise<boolean>;
  deleteGlobalRule: (name: string) => Promise<boolean>;
  readDir: (dirPath: string) => Promise<FileEntry[]>;
  readFile: (filePath: string) => Promise<FileContent>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  createFile: (filePath: string) => Promise<boolean>;
  createDir: (dirPath: string) => Promise<boolean>;
  renamePath: (oldPath: string, newPath: string) => Promise<boolean>;
  deletePath: (path: string) => Promise<boolean>;
  watchDir: (dirPath: string) => Promise<boolean | void>;
  unwatchDir: (dirPath: string) => Promise<void>;
  onFsChange: (callback: (event: { type: string; filename: string; dir: string }) => void) => () => void;
  reportError: (message: string, source: string, line: number, col: number, error: string | undefined) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
