import { stripAnsi } from '../utils/ansi';

export const BUSY_TIMEOUT = 4000;

export const CLAUDE_ACTIVE_PATTERN = /Claude.*Code|claude.*v\d/i;
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

export function switchToSession(projectId: string, sessionId: string, cliPath: string) {
  if (claudeActive) {
    window.electronAPI.writeTerminal(projectId, '\x1b');
    window.electronAPI.writeTerminal(projectId, `/resume ${sessionId}\r\n`);
  } else {
    window.electronAPI.writeTerminal(projectId, `${cliPath} --resume ${sessionId}\r\n`);
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
