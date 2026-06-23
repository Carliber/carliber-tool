import type { Project, AppConfig } from '../types/api';
import * as api from '../lib/tauri-api';

export function generateId(): string {
  return crypto.randomUUID();
}

export async function loadProjects(): Promise<Project[]> {
  return api.getProjects();
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await api.saveProjects(projects);
}

export async function loadConfig(): Promise<AppConfig> {
  return api.getConfig();
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await api.saveConfig(config);
}

export function createProject({ name, path, description, tags, status }: {
  name?: string; path?: string; description?: string; tags?: string[]; status?: Project['status'];
}): Project {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: name || '',
    path: path || '',
    description: description || '',
    tags: tags || [],
    status: status || 'active',
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateProject(project: Project, changes: Partial<Project>): Project {
  return {
    ...project,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
}

export async function openDirectory(path: string): Promise<void> {
  return api.openDirectory(path);
}

export async function openNativeTerminal(cwd: string): Promise<void> {
  await api.openNativeTerminal(cwd);
}

export async function openDirectoryPicker(): Promise<string | null> {
  return api.openDirectoryPicker();
}

export async function openFilePicker(): Promise<string | null> {
  return api.openFilePicker();
}

export async function detectOmpCli(): Promise<string | null> {
  return api.detectOmpCli();
}

export async function exportBackup(): Promise<boolean> {
  return api.exportBackup();
}

export async function importBackup(): Promise<boolean> {
  return api.importBackup();
}
