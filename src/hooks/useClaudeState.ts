import { stripAnsi } from '../utils/ansi';
import * as api from '../lib/tauri-api';

export const BUSY_TIMEOUT = 4000;

export const CLAUDE_ACTIVE_PATTERN = /Claude.*Code|claude.*v\d|omp/i;
export const CLAUDE_PROMPT_PATTERN = /❯/;
export const SHELL_PROMPT_PATTERN = /(?:\$\s|[#$>]\s*$)/;
export const BUSY_PATTERN = /Processing|Thinking|Reading|Generating|analyzing|tool use/i;

let claudeActive = false;
let lastBusySignal = 0;

export function isClaudeActive(): boolean {
  return claudeActive;
}

export function isClaudeBusy(): boolean {
  return claudeActive && (Date.now() - lastBusySignal < BUSY_TIMEOUT);
}

/// Resume an omp session inside the block terminal by writing to the PTY.
/// omp uses the same `--resume <id>` flag as Claude Code.
export function switchToSession(projectId: string, sessionId: string, cliPath: string) {
  if (claudeActive) {
    void api.writeTerminal(projectId, '\x1b');
    void api.writeTerminal(projectId, `/resume ${sessionId}\r\n`);
  } else {
    void api.writeTerminal(projectId, `${cliPath} --resume ${sessionId}\r\n`);
  }
}

export function detectClaudeState(data: string) {
  const stripped = stripAnsi(data);
  if (CLAUDE_ACTIVE_PATTERN.test(stripped) || CLAUDE_PROMPT_PATTERN.test(data)) {
    claudeActive = true;
  }
  if (BUSY_PATTERN.test(stripped)) {
    lastBusySignal = Date.now();
  }
  if (SHELL_PROMPT_PATTERN.test(stripped) && !CLAUDE_PROMPT_PATTERN.test(data) && !CLAUDE_ACTIVE_PATTERN.test(stripped)) {
    claudeActive = false;
    lastBusySignal = 0;
  }
}
