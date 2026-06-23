// Block model + boundary detection for the Warp-style block terminal.
// Blocks group a command with its output. A new block opens when:
//   - the user submits a command (input-driven, primary mechanism), or
//   - the very first prompt appears after omp startup (the banner block).

import { stripAnsi } from '../../utils/ansi';

export type BlockStatus = 'running' | 'done' | 'error';

export interface Block {
  id: string;
  command: string;
  output: string; // raw bytes incl. ANSI, appended as PTY data arrives
  status: BlockStatus;
  startedAt: number;
  endedAt: number | null;
}

let blockIdCounter = 0;

export function newBlockId(): string {
  blockIdCounter += 1;
  return `block-${blockIdCounter}-${Date.now()}`;
}

/// Create a fresh block for the given command.
export function makeBlock(command: string, status: BlockStatus = 'running'): Block {
  return {
    id: newBlockId(),
    command,
    output: '',
    status,
    startedAt: Date.now(),
    endedAt: null,
  };
}

/// Patterns used to detect omp/shell prompts for best-effort block closing.
export const OMP_PROMPT_PATTERN = /❯/;
export const SHELL_PROMPT_PATTERN = /(?:\$\s|[#$>]\s*$)/;

/// Check whether a stripped-output chunk contains a prompt boundary.
export function hasPrompt(raw: string): boolean {
  const stripped = stripAnsi(raw);
  return OMP_PROMPT_PATTERN.test(raw) || SHELL_PROMPT_PATTERN.test(stripped);
}
