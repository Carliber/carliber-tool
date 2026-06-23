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
  ompCliPath: string;
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
  kind?: 'app-settings' | 'agent-global' | 'chat' | 'terminal';
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

export {};
