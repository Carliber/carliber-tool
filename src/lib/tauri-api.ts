// Typed Tauri invoke/listen wrapper — 1:1 replacement for the old window.electronAPI.
// Front-end components import from here instead of touching the global.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import type {
  AppConfig,
  ClaudeSession,
  ClaudeSettings,
  FileContent,
  FileEntry,
  Project,
  ScannedProject,
  SessionMessage,
} from '../types/api';

// Re-export the unlisten type for components that need it.
export type { UnlistenFn };

// ---------------------------------------------------------------------------
// Agent kind shared between front-end and back-end.
// ---------------------------------------------------------------------------
export type AgentKind = 'omp' | 'claude' | 'codex' | 'gemini' | 'github';

// ---------------------------------------------------------------------------
// Config / projects
// ---------------------------------------------------------------------------
export const getConfig = (): Promise<AppConfig> => invoke('get_config');
export const saveConfig = (config: AppConfig): Promise<boolean> =>
  invoke('save_config', { config });
export const getProjects = (): Promise<Project[]> => invoke('get_projects');
export const saveProjects = (projects: Project[]): Promise<boolean> =>
  invoke('save_projects', { projects });

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------
export const openDirectory = (path: string): Promise<void> =>
  invoke('open_directory', { path });
export const openNativeTerminal = (cwd: string): Promise<boolean> =>
  invoke('open_native_terminal', { cwd });
export const openDirectoryPicker = (): Promise<string | null> =>
  invoke('open_directory_picker');
export const openFilePicker = (): Promise<string | null> => invoke('open_file_picker');
/** Replaces detectClaudeCli. */
export const detectOmpCli = (): Promise<string | null> => invoke('detect_omp_cli');
export const exportBackup = (): Promise<boolean> => invoke('export_backup');
export const importBackup = (): Promise<boolean> => invoke('import_backup');

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------
export const readDir = (dirPath: string): Promise<FileEntry[]> =>
  invoke('read_dir', { dirPath });
export const readFile = (filePath: string): Promise<FileContent> =>
  invoke('read_file', { filePath });
export const writeFile = (filePath: string, content: string): Promise<boolean> =>
  invoke('write_file', { filePath, content });
export const createFile = (filePath: string): Promise<boolean> =>
  invoke('create_file', { filePath });
export const createDir = (dirPath: string): Promise<boolean> =>
  invoke('create_dir', { dirPath });
export const renamePath = (oldPath: string, newPath: string): Promise<boolean> =>
  invoke('rename_path', { oldPath, newPath });
export const deletePath = (path: string): Promise<boolean> =>
  invoke('delete_path', { targetPath: path });
export const watchDir = (dirPath: string): Promise<boolean> =>
  invoke('watch_dir', { dirPath });
export const unwatchDir = (dirPath: string): Promise<void> =>
  invoke('unwatch_dir', { dirPath });

export const onFsChange = (
  cb: (event: { type: string; filename: string; dir: string }) => void,
): Promise<UnlistenFn> =>
  listen<{ type: string; filename: string; dir: string }>('fs-change', (e) => cb(e.payload));

// ---------------------------------------------------------------------------
// Window controls (Tauri native; toggleMaximize replaces the custom workArea-48 logic)
// ---------------------------------------------------------------------------
export const minimizeWindow = (): Promise<void> => getCurrentWindow().minimize();
export const maximizeWindow = (): Promise<void> => getCurrentWindow().toggleMaximize();
export const closeWindow = (): Promise<void> => getCurrentWindow().close();

// ---------------------------------------------------------------------------
// Popup windows / project selection — created via frontend WebviewWindow API
// (avoids blocking the Tauri IPC thread that Rust-side window creation caused)
// ---------------------------------------------------------------------------
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

async function openPopupWindow(label: string, url: string, title: string, width: number, height: number) {
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }
  new WebviewWindow(label, {
    url,
    title,
    width,
    height,
    minWidth: 480,
    minHeight: 400,
    decorations: false,
    resizable: true,
    center: true,
  });
}

export const openProjectSelector = async (): Promise<void> => {
  await openPopupWindow('project-selector', 'index.html#project-selector', '选择项目', 720, 560);
};
/** Replaces openClaudeSettings. */
export const openAgentSettings = async (): Promise<void> => {
  await openPopupWindow('agent-settings', 'index.html#agent-settings', '全局设置', 800, 640);
};
export const selectProject = async (projectId: string): Promise<void> => {
  await openPopupWindow(`workspace-${projectId}`, `index.html#workspace/${projectId}`, 'carliber-tool', 1280, 800);
};
export const closePopup = (): Promise<void> => getCurrentWindow().close();

export const onProjectSelected = (cb: (id: string) => void): Promise<UnlistenFn> =>
  listen<string>('project-selected', (e) => cb(e.payload));

// ---------------------------------------------------------------------------
// PTY
// ---------------------------------------------------------------------------
export const onPtyData = (
  cb: (sessionId: string, data: string) => void,
): Promise<UnlistenFn> =>
  listen<[string, string]>('pty:data', (e) => {
    const [sid, data] = e.payload;
    cb(sid, data);
  });
export const onPtyExit = (
  cb: (sessionId: string, exitCode: number) => void,
): Promise<UnlistenFn> =>
  listen<[string, number]>('pty:exit', (e) => {
    const [sid, code] = e.payload;
    cb(sid, code);
  });
export const createTerminal = (
  sessionId: string,
  cwd: string,
  cols: number,
  rows: number,
): Promise<boolean> =>
  invoke('pty_create', {
    sessionId,
    cwd,
    cols,
    rows,
    ownerWindowLabel: getCurrentWindow().label,
  });
export const writeTerminal = (sessionId: string, data: string): Promise<void> =>
  invoke('pty_write', { sessionId, data });
export const resizeTerminal = (sessionId: string, cols: number, rows: number): Promise<void> =>
  invoke('pty_resize', { sessionId, cols, rows });
export const killTerminal = (sessionId: string): Promise<boolean> =>
  invoke('pty_kill', { sessionId });

// ---------------------------------------------------------------------------
// Sessions (omp JSONL)
// ---------------------------------------------------------------------------
export const getSessions = (projectPath: string): Promise<ClaudeSession[]> =>
  invoke('get_sessions', { projectPath });
export const getSessionMessages = (
  projectPath: string,
  sessionId: string,
): Promise<SessionMessage[]> =>
  invoke('get_session_messages', { projectPath, sessionId });
export const deleteSession = (projectPath: string, sessionId: string): Promise<boolean> =>
  invoke('delete_session', { projectPath, sessionId });
export const getLastSessionTime = (projectPath: string): Promise<string | null> =>
  invoke('get_last_session_time', { projectPath });

// omp-specific scan + dir lookup. Replaces scanClaudeProjects / getClaudeDir.
export const scanOmpProjects = (): Promise<ScannedProject[]> => invoke('scan_omp_projects');
export const getOmpDir = (): Promise<string> => invoke('get_omp_dir');

// ---------------------------------------------------------------------------
// Multi-agent config / rules / instructions / skills
// ---------------------------------------------------------------------------
export interface RuleEntry {
  name: string;
  content: string;
}
export interface SkillEntry {
  name: string;
  description: string;
}

export const getAgentGlobalConfig = (kind: AgentKind): Promise<ClaudeSettings | string> =>
  invoke('get_agent_global_config', { kind });
export const saveAgentGlobalConfig = (
  kind: AgentKind,
  data: ClaudeSettings | string,
): Promise<boolean> => invoke('save_agent_global_config', { kind, data });
export const getAgentProjectConfig = (
  kind: AgentKind,
  projectPath: string,
): Promise<ClaudeSettings | string> =>
  invoke('get_agent_project_config', { kind, projectPath });
export const saveAgentProjectConfig = (
  kind: AgentKind,
  projectPath: string,
  data: ClaudeSettings | string,
): Promise<boolean> =>
  invoke('save_agent_project_config', { kind, projectPath, data });

export const getAgentRules = (
  kind: AgentKind,
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<RuleEntry[]> =>
  invoke('get_agent_rules', { kind, scope, projectPath: projectPath ?? null });
export const saveAgentRule = (
  kind: AgentKind,
  scope: 'global' | 'project',
  name: string,
  content: string,
  projectPath?: string,
): Promise<boolean> =>
  invoke('save_agent_rule', {
    kind,
    scope,
    name,
    content,
    projectPath: projectPath ?? null,
  });
export const deleteAgentRule = (
  kind: AgentKind,
  scope: 'global' | 'project',
  name: string,
  projectPath?: string,
): Promise<boolean> =>
  invoke('delete_agent_rule', { kind, scope, name, projectPath: projectPath ?? null });
export const getAgentInstructions = (
  kind: AgentKind,
  scope: 'global' | 'project',
  projectPath?: string,
): Promise<string> =>
  invoke('get_agent_instructions', { kind, scope, projectPath: projectPath ?? null });
export const saveAgentInstructions = (
  kind: AgentKind,
  scope: 'global' | 'project',
  content: string,
  projectPath?: string,
): Promise<boolean> =>
  invoke('save_agent_instructions', {
    kind,
    scope,
    content,
    projectPath: projectPath ?? null,
  });
export const listAgentSkills = (
  kind: AgentKind,
  projectPath?: string,
): Promise<SkillEntry[]> =>
  invoke('list_agent_skills', { kind, projectPath: projectPath ?? null });
export const agentInstructionsFilename = (kind: AgentKind): Promise<string> =>
  invoke('agent_instructions_filename', { kind });

// ---------------------------------------------------------------------------
// Workflows + AI command search + shell history
// ---------------------------------------------------------------------------
export interface Workflow {
  id: string;
  name: string;
  commandTemplate: string;
  description?: string;
}
export const getWorkflows = (): Promise<Workflow[]> => invoke('get_workflows');
export const saveWorkflow = (workflow: Workflow): Promise<boolean> =>
  invoke('save_workflow', { workflow });
export const deleteWorkflow = (id: string): Promise<boolean> =>
  invoke('delete_workflow', { id });
export const aiCommandSearch = (query: string, cwd: string): Promise<string | null> =>
  invoke('ai_command_search', { query, cwd });
export const getHistory = (): Promise<string[]> => invoke('get_history');
export const saveHistory = (history: string[]): Promise<boolean> =>
  invoke('save_history', { history });

// ---------------------------------------------------------------------------
// Version control (Git + SVN)
// ---------------------------------------------------------------------------
export type VcsKind = 'git' | 'svn' | 'none';

export interface VcsFile {
  path: string;
  status: string;
  staged: boolean;
}
export interface VcsStatus {
  kind: string;
  branch: string;
  remote: string;
  ahead: number;
  behind: number;
  clean: boolean;
  staged: VcsFile[];
  unstaged: VcsFile[];
  untracked: string[];
}
export interface VcsLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}
export interface VcsDiff {
  path: string;
  staged: boolean;
  diff: string;
}

export const vcsDetect = (projectPath: string): Promise<VcsKind> =>
  invoke('vcs_detect', { projectPath });
export const vcsStatus = (projectPath: string): Promise<VcsStatus> =>
  invoke('vcs_status', { projectPath });
export const vcsStage = (projectPath: string, paths: string[]): Promise<boolean> =>
  invoke('vcs_stage', { projectPath, paths });
export const vcsUnstage = (projectPath: string, paths: string[]): Promise<boolean> =>
  invoke('vcs_unstage', { projectPath, paths });
export const vcsCommit = (projectPath: string, message: string): Promise<boolean> =>
  invoke('vcs_commit', { projectPath, message });
export const vcsPull = (projectPath: string): Promise<boolean> =>
  invoke('vcs_pull', { projectPath });
export const vcsPush = (projectPath: string): Promise<boolean> =>
  invoke('vcs_push', { projectPath });
export const vcsFetch = (projectPath: string): Promise<boolean> =>
  invoke('vcs_fetch', { projectPath });
export const vcsLog = (projectPath: string, limit?: number): Promise<VcsLogEntry[]> =>
  invoke('vcs_log', { projectPath, limit: limit ?? null });
export const vcsDiff = (projectPath: string, path: string, staged: boolean): Promise<VcsDiff> =>
  invoke('vcs_diff', { projectPath, path, staged });
export const vcsBranches = (projectPath: string): Promise<string[]> =>
  invoke('vcs_branches', { projectPath });
export const vcsCheckout = (projectPath: string, branch: string): Promise<boolean> =>
  invoke('vcs_checkout', { projectPath, branch });
export const vcsDiscard = (projectPath: string, path: string): Promise<boolean> =>
  invoke('vcs_discard', { projectPath, path });

// ---------------------------------------------------------------------------
// Renderer error reporting
// ---------------------------------------------------------------------------
export const reportError = (
  message: string,
  source: string,
  line: number,
  col: number,
  error: string | undefined,
): Promise<void> =>
  invoke('renderer_error', { message, source, line, col, error: error ?? '' });
