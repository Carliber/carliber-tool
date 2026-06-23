// Core hook for the Warp-style block terminal.
// Owns the PTY lifecycle for the current project: creates the pty, subscribes to
// data/exit, drives the block state machine (input-driven grouping as the primary
// mechanism), persists shell history, and exposes a `send` function.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import * as api from '../../lib/tauri-api';
import { stripAnsi } from '../../utils/ansi';
import { type Block, makeBlock, hasPrompt } from './BlockModel';

export interface BlockTerminalState {
  blocks: Block[];
  ready: boolean;
  send: (command: string) => void;
  sendRaw: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

const MAX_BLOCKS = 200;

export function useBlockTerminal(): BlockTerminalState {
  const { state } = useApp();
  const project = state.projects.find(p => p.id === state.currentProjectId);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const historyRef = useRef<string[]>([]);

  // Keep the latest blocks in a ref so the PTY data callback can append without
  // re-subscribing on every render.
  const blocksRef = useRef<Block[]>([]);
  blocksRef.current = blocks;
  const projectIdRef = useRef<string | null>(null);
  projectIdRef.current = project?.id ?? null;
  // Track whether this hook instance created the PTY so cleanup can kill it.
  const createdRef = useRef(false);

  const appendOutput = useCallback((sessionId: string, chunk: string) => {
    if (sessionId !== projectIdRef.current) return;
    setBlocks(prev => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.status === 'running') {
        next[next.length - 1] = { ...last, output: last.output + chunk };
      } else if (next.length === 0) {
        // Banner/startup output before any command — capture in an uncommanded block.
        next.push({ ...makeBlock('', 'done'), output: chunk });
      }
      // Trim very old blocks to bound memory.
      return next.length > MAX_BLOCKS ? next.slice(next.length - MAX_BLOCKS) : next;
    });
  }, []);

  const markExit = useCallback((sessionId: string) => {
    if (sessionId !== projectIdRef.current) return;
    setBlocks(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next[next.length - 1];
      if (last.status === 'running') {
        next[next.length - 1] = { ...last, status: 'done', endedAt: Date.now() };
      }
      return next;
    });
    readyRef.current = false;
    setReady(false);
  }, []);

  // Create the PTY once per project.
  useEffect(() => {
    if (!project) return;
    const projectId = project.id;
    let cancelled = false;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;

    (async () => {
      // Subscribe before creating so we don't miss early bytes.
      const ud = await api.onPtyData((sid, data) => appendOutput(sid, data));
      if (cancelled) { ud(); return; }
      unsubData = ud;
      const ue = await api.onPtyExit((sid) => markExit(sid));
      if (cancelled) { ue(); return; }
      unsubExit = ue;

      // If a session already exists (e.g. hot reload), just attach.
      try {
        created = await api.createTerminal(projectId, project.path, 100, 30);
      } catch {
        created = false;
      }
      if (cancelled) return;
      createdRef.current = created;

      // Inject omp startup command (mirrors the legacy TerminalPanel behaviour).
      const cliPath = state.settings.ompCliPath || 'omp';
      if (cliPath && created) {
        void api.writeTerminal(projectId, `${cliPath}\r\n`);
      }
      readyRef.current = true;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      unsubData?.();
      unsubExit?.();
      // Kill the PTY this hook created to avoid leaking shell processes when
      // switching projects within the same window (close-window cleanup is
      // handled separately by the backend's kill_by_owner).
      const sid = projectIdRef.current;
      if (createdRef.current && sid) {
        void api.killTerminal(sid);
        createdRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Load persisted shell history on mount.
  useEffect(() => {
    api.getHistory().then(h => {
      historyRef.current = Array.isArray(h) ? h : [];
    }).catch(() => {});
  }, []);

  const persistHistory = useCallback((list: string[]) => {
    void api.saveHistory(list.slice(-500));
  }, []);

  const send = useCallback((command: string) => {
    const projectId = projectIdRef.current;
    if (!projectId) return;
    // Open a new block for this command (input-driven grouping — primary mechanism).
    setBlocks(prev => {
      const next = [...prev];
      // Close any still-running block (e.g. a bare banner block) before opening the new one.
      if (next.length > 0) {
        const last = next[next.length - 1];
        if (last.status === 'running') {
          next[next.length - 1] = { ...last, status: 'done', endedAt: Date.now() };
        }
      }
      next.push(makeBlock(command, 'running'));
      return next.length > MAX_BLOCKS ? next.slice(next.length - MAX_BLOCKS) : next;
    });
    void api.writeTerminal(projectId, command + '\r\n');
    // Persist history.
    const hist = [...historyRef.current, command];
    historyRef.current = hist;
    persistHistory(hist);
  }, [persistHistory]);

  const sendRaw = useCallback((data: string) => {
    const projectId = projectIdRef.current;
    if (!projectId) return;
    void api.writeTerminal(projectId, data);
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    const projectId = projectIdRef.current;
    if (!projectId) return;
    void api.resizeTerminal(projectId, cols, rows);
  }, []);

  return { blocks, ready, send, sendRaw, resize };
}
