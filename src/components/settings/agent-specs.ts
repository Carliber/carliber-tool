// Per-agent structured config specs. Used by ConfigItem to render the right control.
// omp spec is derived from the omp settings catalog (tools.approvalMode, compaction.strategy,
// theme.dark/light, modelRoles.*, thinkingBudgets.*). Claude reuses CLAUDE_CONFIG_SPEC.
// codex/gemini/github get a minimal spec (raw-file editing) per the plan's contingency.

import type { ConfigSpec } from './types';
import type { AgentKind } from '../../lib/tauri-api';

// omp config keys (dotted, matching ~/.omp/agent/config.yml).
export const OMP_CONFIG_SPEC: Record<string, ConfigSpec> = {
  // modelRoles
  'modelRoles.default': { label: '默认模型', type: 'string', group: 'core', desc: '默认使用的模型（如 zhipu-coding-plan/glm-5.2）' },
  'modelRoles.smol': { label: '快速模型', type: 'string', group: 'core', desc: 'smol 角色使用的模型' },
  'modelRoles.slow': { label: '强力模型', type: 'string', group: 'core', desc: 'slow 角色使用的模型' },
  'modelRoles.plan': { label: '规划模型', type: 'string', group: 'core', desc: 'plan 角色使用的模型' },

  // tools
  'tools.approvalMode': { label: '工具审批模式', type: 'string', group: 'core', desc: '工具调用的审批策略', options: [
    { value: 'always-ask', label: '总是询问' },
    { value: 'write', label: '写入时询问' },
    { value: 'yolo', label: '全自动 (YOLO)' },
  ]},
  'tools.approval': { label: '审批规则', type: 'json', group: 'advanced', desc: '细粒度工具审批配置' },

  // compaction
  'compaction.strategy': { label: '压缩策略', type: 'string', group: 'core', desc: '上下文压缩策略', options: [
    { value: '', label: '默认' },
    { value: 'context-full', label: 'context-full' },
    { value: 'handoff', label: 'handoff' },
    { value: 'shake', label: 'shake' },
    { value: 'snapcompact', label: 'snapcompact' },
    { value: 'off', label: '关闭' },
  ]},

  // theme
  'theme.dark': { label: '暗色主题', type: 'string', group: 'display', desc: 'omp 暗色主题名' },
  'theme.light': { label: '亮色主题', type: 'string', group: 'display', desc: 'omp 亮色主题名' },

  // thinkingBudgets
  'thinkingBudgets.high': { label: '高强度思考预算', type: 'number', group: 'core', desc: '高强度思考的 token 预算' },

  // shell
  'shellPath': { label: 'Shell 路径', type: 'string', group: 'core', desc: 'omp 使用的 shell 可执行文件路径' },
  'symbolPreset': { label: '符号集', type: 'string', group: 'display', desc: 'UI 符号预设', options: [
    { value: '', label: '默认' },
    { value: 'ascii', label: 'ASCII' },
    { value: 'nerdfont', label: 'Nerd Font' },
  ]},
};

export const AGENT_CONFIG_SPECS: Partial<Record<AgentKind, Record<string, ConfigSpec>>> = {
  omp: OMP_CONFIG_SPEC,
  // claude uses CLAUDE_CONFIG_SPEC (imported by ClaudeGlobalConfigTab directly).
  // codex / gemini / github: no structured spec — raw file editing only.
};

export const AGENT_LABELS: Record<AgentKind, string> = {
  omp: 'omp',
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  github: 'GitHub Copilot',
};

export const AGENT_ORDER: AgentKind[] = ['omp', 'claude', 'codex', 'gemini', 'github'];

/// Map a dotted omp key (e.g. "modelRoles.default") onto a nested object path for reading/writing.
export function getNested(obj: Record<string, unknown>, dottedKey: string): unknown {
  const parts = dottedKey.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && cur !== null) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function setNested(obj: Record<string, unknown>, dottedKey: string, value: unknown): Record<string, unknown> {
  const parts = dottedKey.split('.');
  const root = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}
