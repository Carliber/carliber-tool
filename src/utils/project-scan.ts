import { createProject } from './storage';
import type { ScannedProject, Project } from '../types/electron';

export async function scanNewClaudeProjects(): Promise<ScannedProject[]> {
  const scanned = await window.electronAPI.scanClaudeProjects();
  const existing = await window.electronAPI.getProjects();
  const existingPaths = new Set(existing.map(p => p.path));
  return scanned.filter(p => !existingPaths.has(p.path));
}

export async function scanAndMergeProjects(): Promise<{ newCount: number; updatedCount: number }> {
  const scanned = await window.electronAPI.scanClaudeProjects();
  const existing = await window.electronAPI.getProjects();
  const existingPaths = new Map(existing.map(p => [p.path, p] as const));
  const updated = [...existing];
  let newCount = 0;
  let updatedCount = 0;
  for (const sp of scanned) {
    if (existingPaths.has(sp.path)) {
      if (sp.lastModified) {
        const p = existingPaths.get(sp.path)!;
        const idx = updated.findIndex(u => u.id === p.id);
        updated[idx] = { ...p, updatedAt: sp.lastModified };
        updatedCount++;
      }
    } else {
      updated.push(createProject({ name: sp.name, path: sp.path, status: 'active' }));
      newCount++;
    }
  }
  await window.electronAPI.saveProjects(updated);
  return { newCount, updatedCount };
}

export async function importScannedProjects(projects: ScannedProject[]): Promise<void> {
  const all = await window.electronAPI.getProjects();
  for (const cp of projects) {
    all.push(createProject({ name: cp.name, path: cp.path, status: 'active' }));
  }
  await window.electronAPI.saveProjects(all);
}
