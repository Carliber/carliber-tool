import { createProject } from './storage';
import * as api from '../lib/tauri-api';
import type { ScannedProject, Project } from '../types/api';

export async function scanNewOmpProjects(): Promise<ScannedProject[]> {
  const scanned = await api.scanOmpProjects();
  const existing = await api.getProjects();
  const existingPaths = new Set(existing.map(p => p.path));
  return scanned.filter(p => !existingPaths.has(p.path));
}

export async function scanAndMergeProjects(): Promise<{ newCount: number; updatedCount: number }> {
  const scanned = await api.scanOmpProjects();
  const existing = await api.getProjects();
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
  await api.saveProjects(updated);
  return { newCount, updatedCount };
}

export async function importScannedProjects(projects: ScannedProject[]): Promise<void> {
  const all = await api.getProjects();
  for (const cp of projects) {
    all.push(createProject({ name: cp.name, path: cp.path, status: 'active' }));
  }
  await api.saveProjects(all);
}

// Keep old name as a thin alias for any lingering call sites.
export const scanNewClaudeProjects = scanNewOmpProjects;
