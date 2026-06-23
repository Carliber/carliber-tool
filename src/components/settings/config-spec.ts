import type { ConfigSpec } from './types';

export const CLAUDE_CONFIG_SPEC: Record<string, ConfigSpec> = {
  // Core
  model: { label: '模型', type: 'string', group: 'core', desc: '默认使用的模型', options: [
    { value: '', label: '默认' },
    { value: 'sonnet', label: 'Sonnet' }, { value: 'sonnet[1m]', label: 'Sonnet 1M' },
    { value: 'opus', label: 'Opus' }, { value: 'opus[1m]', label: 'Opus 1M' },
    { value: 'haiku', label: 'Haiku' },
    { value: 'opusplan', label: 'Opus 规划 + Sonnet 执行' },
  ]},
  agent: { label: '默认代理', type: 'string', group: 'core', desc: '默认使用的代理（.claude/agents/ 中的名称）' },
  alwaysThinkingEnabled: { label: '扩展思考', type: 'boolean', group: 'core', desc: '启用扩展思考，保留推理 token' },
  showThinkingSummaries: { label: '思考摘要', type: 'boolean', group: 'core', desc: '交互会话中显示扩展思考摘要' },
  effortLevel: { label: '投入等级', type: 'string', group: 'core', desc: '跨会话持久化的推理力度', options: [
    { value: '', label: '默认' }, { value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }, { value: 'xhigh', label: '极高 (仅 Opus 4.7)' },
  ]},
  fastMode: { label: '快速模式', type: 'boolean', group: 'core', desc: '使用快速输出模式' },
  fastModePerSessionOptIn: { label: '每次会话确认快速模式', type: 'boolean', group: 'core', desc: '每次会话都需要手动选择启用快速模式' },
  language: { label: '语言', type: 'string', group: 'core', desc: 'Claude 的首选响应语言' },
  defaultMode: { label: '默认模式', type: 'string', group: 'core', desc: '启动时的权限模式', options: [
    { value: '', label: '默认' }, { value: 'auto', label: '自动' }, { value: 'plan', label: '规划' },
  ]},
  defaultShell: { label: '默认 Shell', type: 'string', group: 'core', desc: '! 命令的默认 Shell', options: [
    { value: '', label: '默认 (bash)' }, { value: 'bash', label: 'Bash' }, { value: 'powershell', label: 'PowerShell' },
  ]},
  cleanupPeriodDays: { label: '会话保留天数', type: 'number', group: 'core', desc: '不活跃会话的清理周期（天）' },
  includeGitInstructions: { label: '包含 Git 指令', type: 'boolean', group: 'core', desc: '系统提示中包含 Git 工作流指令' },
  skipAutoPermissionPrompt: { label: '跳过权限提示', type: 'boolean', group: 'core', desc: '自动跳过权限确认' },

  // Display
  viewMode: { label: '视图模式', type: 'string', group: 'display', desc: '启动时的默认视图模式', options: [
    { value: '', label: '默认' }, { value: 'default', label: '标准' }, { value: 'verbose', label: '详细' }, { value: 'focus', label: '专注' },
  ]},
  tui: { label: '渲染模式', type: 'string', group: 'display', desc: 'TUI 渲染模式', options: [
    { value: '', label: '默认' }, { value: 'default', label: '标准' }, { value: 'fullscreen', label: '全屏' },
  ]},
  outputStyle: { label: '输出风格', type: 'string', group: 'display', desc: 'Claude 输出的风格' },
  spinnerTipsEnabled: { label: '等待提示', type: 'boolean', group: 'display', desc: '等待时显示 spinner 提示' },
  prefersReducedMotion: { label: '减少动画', type: 'boolean', group: 'display', desc: '减少 UI 中的动画效果' },
  awaySummaryEnabled: { label: '离开摘要', type: 'boolean', group: 'display', desc: '用户返回时生成离开摘要' },
  voiceEnabled: { label: '语音听写', type: 'boolean', group: 'display', desc: '启用按键说话语音听写' },

  // Advanced
  statusLine: { label: '状态栏', type: 'json', group: 'advanced', desc: '终端底部状态栏配置' },
  hooks: { label: '钩子', type: 'json', group: 'advanced', desc: '工具使用前后执行的命令 (PreToolUse/PostToolUse/Stop/SessionEnd)' },
  enabledPlugins: { label: '已启用插件', type: 'json', group: 'advanced', desc: '各插件的开关状态' },
  extraKnownMarketplaces: { label: '插件市场源', type: 'json', group: 'advanced', desc: '额外的插件市场配置' },
  availableModels: { label: '可选模型', type: 'json', group: 'advanced', desc: '限制 /model 可切换的模型列表' },
  modelOverrides: { label: '模型覆盖', type: 'json', group: 'advanced', desc: '将模型选择器映射到特定模型 ID' },
  sandbox: { label: '沙盒配置', type: 'json', group: 'advanced', desc: 'Bash 沙盒相关配置' },
  permissions: { label: '权限', type: 'json', group: 'advanced', desc: '工具使用权限规则' },
  autoUpdatesChannel: { label: '更新通道', type: 'string', group: 'advanced', desc: '自动更新发布通道', options: [
    { value: '', label: '默认' }, { value: 'stable', label: '稳定版' }, { value: 'latest', label: '最新版' },
  ]},
};

export const EXCLUDED_KEYS = new Set(['permissions', 'env']);

export const ENV_SPEC: Record<string, { label: string; desc: string }> = {
  ANTHROPIC_API_KEY: { label: 'API 密钥', desc: 'Anthropic API 密钥' },
  ANTHROPIC_AUTH_TOKEN: { label: '认证令牌', desc: 'OAuth 认证令牌' },
  ANTHROPIC_BASE_URL: { label: 'API 地址', desc: '自定义 API 端点 URL' },
  ANTHROPIC_MODEL: { label: '模型覆盖', desc: '覆盖 model 设置的模型名称' },
  ANTHROPIC_DEFAULT_HAIKU_MODEL: { label: 'Haiku 模型覆盖', desc: '覆盖 Haiku 别名对应的模型' },
  ANTHROPIC_DEFAULT_SONNET_MODEL: { label: 'Sonnet 模型覆盖', desc: '覆盖 Sonnet 别名对应的模型' },
  ANTHROPIC_DEFAULT_OPUS_MODEL: { label: 'Opus 模型覆盖', desc: '覆盖 Opus 别名对应的模型' },
  CLAUDE_CODE_SUBAGENT_MODEL: { label: '子代理模型', desc: '子代理使用的模型' },
  MAX_THINKING_TOKENS: { label: '最大思考 token', desc: '每次响应的最大思考 token 数' },
  BASH_DEFAULT_TIMEOUT_MS: { label: 'Bash 默认超时', desc: 'Bash 命令默认超时 (ms)' },
  BASH_MAX_TIMEOUT_MS: { label: 'Bash 最大超时', desc: 'Bash 命令最大超时 (ms)' },
  MCP_TIMEOUT: { label: 'MCP 超时', desc: 'MCP 服务器启动超时 (ms)' },
  MAX_MCP_OUTPUT_TOKENS: { label: 'MCP 最大输出', desc: 'MCP 工具输出最大 token 数' },
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: { label: '禁用非必要流量', desc: '禁用遥测等非必要网络请求' },
  DISABLE_TELEMETRY: { label: '禁用遥测', desc: '关闭遥测数据上报' },
  DISABLE_ERROR_REPORTING: { label: '禁用错误报告', desc: '关闭错误数据上报' },
  DISABLE_AUTOUPDATER: { label: '禁用自动更新', desc: '关闭自动更新检查' },
  API_TIMEOUT_MS: { label: 'API 超时', desc: 'API 请求超时时间 (ms)' },
  API_MAX_RETRIES: { label: 'API 重试次数', desc: 'API 请求最大重试次数' },
  COMPACT_THRESHOLD: { label: '压缩阈值', desc: '上下文压缩触发的消息数阈值' },
};
