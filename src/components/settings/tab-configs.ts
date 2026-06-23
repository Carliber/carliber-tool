export const APP_TABS = [{ id: 'general', label: '通用' }];
// CLAUDE_GLOBAL_TABS / PROJECT_CLAUDE_TABS are now generated dynamically in Settings.tsx
// per the selected agent kind. These are kept for any lingering direct importers.
export const CLAUDE_GLOBAL_TABS = [
  { id: 'agent-global', label: '配置' },
  { id: 'permissions', label: '权限' },
  { id: 'global-rules', label: '规则' },
  { id: 'global-md', label: '指令' },
];
export const PROJECT_CLAUDE_TABS = [
  { id: 'project', label: '项目设置' },
  { id: 'rules', label: '规则' },
  { id: 'instructions', label: '指令' },
];
