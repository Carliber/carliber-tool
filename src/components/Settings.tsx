import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { detectClaudeCli, openFilePicker, exportBackup, importBackup, createProject } from '../utils/storage';
import type { ClaudeSettings, AppConfig } from '../types/electron';

type ConfigType = 'string' | 'boolean' | 'number' | 'json';

interface ConfigSpec {
  label: string;
  type: ConfigType;
  desc: string;
  options?: { value: string; label: string }[];
  group: 'core' | 'display' | 'advanced';
}

const CLAUDE_CONFIG_SPEC: Record<string, ConfigSpec> = {
  // ── Core ──
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
  defaultMode: { label: '默认模式', type: 'string', group: 'core', desc: 'Claude Code 启动时的权限模式', options: [
    { value: '', label: '默认' }, { value: 'auto', label: '自动' }, { value: 'plan', label: '规划' },
  ]},
  defaultShell: { label: '默认 Shell', type: 'string', group: 'core', desc: '! 命令的默认 Shell', options: [
    { value: '', label: '默认 (bash)' }, { value: 'bash', label: 'Bash' }, { value: 'powershell', label: 'PowerShell' },
  ]},
  cleanupPeriodDays: { label: '会话保留天数', type: 'number', group: 'core', desc: '不活跃会话的清理周期（天）' },
  includeGitInstructions: { label: '包含 Git 指令', type: 'boolean', group: 'core', desc: '系统提示中包含 Git 工作流指令' },

  // ── Display ──
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

  // ── Advanced (JSON) ──
  skipAutoPermissionPrompt: { label: '跳过权限提示', type: 'boolean', group: 'core', desc: '自动跳过权限确认' },
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

// Keys managed by dedicated tabs — don't show in config tab
const EXCLUDED_KEYS = new Set(['permissions', 'env']);

const ENV_SPEC: Record<string, { label: string; desc: string }> = {
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

const APP_TABS = [
  { id: 'general', label: '通用' },
];

const CLAUDE_GLOBAL_TABS = [
  { id: 'claude-global', label: '配置' },
  { id: 'permissions', label: '权限' },
  { id: 'global-rules', label: '规则' },
  { id: 'global-md', label: 'CLAUDE.md' },
];

const PROJECT_CLAUDE_TABS = [
  { id: 'project', label: '项目设置' },
  { id: 'rules', label: '规则' },
  { id: 'instructions', label: 'CLAUDE.md' },
];

export default function Settings({ mode }: { mode: 'app' | 'claude-global' | 'claude-project' }) {
  const { state, updateSettings } = useApp();
  const [tab, setTab] = useState(mode === 'app' ? 'general' : mode === 'claude-project' ? 'project' : 'claude-global');
  const tabs = mode === 'claude-project' ? PROJECT_CLAUDE_TABS : mode === 'claude-global' ? CLAUDE_GLOBAL_TABS : APP_TABS;
  const [settings, setSettings] = useState<AppConfig>(state.settings as AppConfig);
  const [cliStatus, setCliStatus] = useState('');
  const [saved, setSaved] = useState(false);

  // Claude global settings
  const [claudeSettings, setClaudeSettings] = useState<ClaudeSettings | null>(null);
  const [claudeMd, setClaudeMd] = useState('');
  const [globalRules, setGlobalRules] = useState<{ name: string; content: string }[]>([]);
  const [editGlobalRule, setEditGlobalRule] = useState<{ name: string; content: string } | null>(null);
  const [newGlobalRuleName, setNewGlobalRuleName] = useState('');

  // Project settings
  const [projectSettings, setProjectSettings] = useState<ClaudeSettings | null>(null);
  const [projectMd, setProjectMd] = useState('');
  const [rules, setRules] = useState<{ name: string; content: string }[]>([]);
  const [editRule, setEditRule] = useState<{ name: string; content: string } | null>(null);
  const [newRuleName, setNewRuleName] = useState('');

  const project = state.projects.find(p => p.id === state.currentProjectId);

  useEffect(() => { setSettings(state.settings); }, [state.settings]);

  useEffect(() => {
    (async () => {
      const s = await window.electronAPI.getClaudeSettings();
      const md = await window.electronAPI.getClaudeMd();
      const gr = await window.electronAPI.getGlobalRules();
      setClaudeSettings(s || {});
      setClaudeMd(md || '');
      setGlobalRules(gr);
    })();
  }, []);

  useEffect(() => {
    if (!project) return;
    (async () => {
      const ps = await window.electronAPI.getProjectSettings(project.path);
      const pmd = await window.electronAPI.getProjectClaudeMd(project.path);
      const r = await window.electronAPI.getProjectRules(project.path);
      setProjectSettings(ps || {});
      setProjectMd(pmd || '');
      setRules(r);
    })();
  }, [project?.id]);

  // App settings handlers
  const handleAppChange = useCallback((key: string, value: string | number) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    updateSettings(updated);
  }, [settings, updateSettings]);

  const handleDetectCli = useCallback(async () => {
    setCliStatus('检测中...');
    const p = await detectClaudeCli();
    if (p) { handleAppChange('claudeCliPath', p); setCliStatus(`已检测到: ${p}`); }
    else setCliStatus('未找到');
  }, [handleAppChange]);

  // Claude settings handlers
  const updateClaude = (key: string, value: unknown) => {
    if (!claudeSettings) return;
    if (value === undefined) {
      const { [key]: _, ...rest } = claudeSettings;
      setClaudeSettings(rest as ClaudeSettings);
    } else {
      setClaudeSettings({ ...claudeSettings, [key]: value });
    }
    setSaved(false);
  };

  const updateClaudeEnv = (key: string, value: string) => {
    if (!claudeSettings) return;
    const env: Record<string, string> = { ...(claudeSettings.env || {}) };
    if (value === '') delete env[key]; else env[key] = value;
    updateClaude('env', env);
  };

  // Project settings handlers
  const updateProjectSettings = (key: string, value: unknown) => {
    if (!projectSettings) return;
    setProjectSettings({ ...projectSettings, [key]: value });
    setSaved(false);
  };

  const saveAll = async () => {
    await Promise.all([
      claudeSettings && window.electronAPI.saveClaudeSettings(claudeSettings),
      window.electronAPI.saveClaudeMd(claudeMd),
      project && projectSettings && window.electronAPI.saveProjectSettings(project.path, projectSettings),
      project && window.electronAPI.saveProjectClaudeMd(project.path, projectMd),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (mode !== 'app' && !claudeSettings) return <div className="text-muted">加载中...</div>;

  return (
    <div className="settings-container">
      <div className="claude-settings-header">
        <h2 className="title-lg">{mode === 'app' ? '首选项' : mode === 'claude-global' ? 'Claude 配置' : '项目配置'}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span className="text-sm" style={{ color: 'var(--success)' }}>已保存</span>}
          <button className="primary" onClick={saveAll}>保存全部</button>
        </div>
      </div>

      <div className="claude-settings-tabs">
        {tabs.map(t => (
          <div key={t.id} className={`claude-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      <div className="claude-settings-body">
        {tab === 'general' && <GeneralTab settings={settings} handleChange={handleAppChange}
          cliStatus={cliStatus} onDetect={handleDetectCli} />}
        {tab === 'claude-global' && claudeSettings && <ClaudeGlobalConfigTab settings={claudeSettings} update={updateClaude}
          updateEnv={updateClaudeEnv} />}
        {tab === 'permissions' && claudeSettings && <PermissionsTab settings={claudeSettings} update={updateClaude} />}
        {tab === 'global-rules' && <GlobalRulesTab rules={globalRules} setRules={setGlobalRules}
          editRule={editGlobalRule} setEditRule={setEditGlobalRule} newRuleName={newGlobalRuleName} setNewRuleName={setNewGlobalRuleName} />}
        {tab === 'global-md' && <GlobalMdTab md={claudeMd} setMd={setClaudeMd} />}
        {tab === 'project' && project && projectSettings && <ProjectTab settings={projectSettings} update={updateProjectSettings}
          projectPath={project.path} />}
        {tab === 'rules' && project && <RulesTab projectPath={project.path} rules={rules} setRules={setRules}
          editRule={editRule} setEditRule={setEditRule} newRuleName={newRuleName} setNewRuleName={setNewRuleName} />}
        {tab === 'instructions' && <InstructionsTab globalMd={claudeMd} setGlobalMd={setClaudeMd}
          projectMd={projectMd} setProjectMd={setProjectMd} hasProject={!!project} />}
      </div>
    </div>
  );
}

// ── General Tab ──
function GeneralTab({ settings, handleChange, cliStatus, onDetect }: {
  settings: AppConfig; handleChange: (k: string, v: string | number) => void;
  cliStatus: string; onDetect: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');

  const handleScanClaudeSessions = useCallback(async () => {
    setScanning(true);
    setScanResult('');
    try {
      const scanned = await window.electronAPI.scanClaudeProjects();
      const existing = await window.electronAPI.getProjects();
      const existingPaths = new Map(existing.map(p => [p.path, p]));
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
      setScanResult(`新增 ${newCount} 个，更新 ${updatedCount} 个`);
    } catch (e) {
      setScanResult(`扫描失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    setScanning(false);
  }, []);

  return (
    <div className="settings-section">
      <div className="form-group">
        <label>主题</label>
        <select value={settings.theme} onChange={e => handleChange('theme', e.target.value)}>
          <option value="light">亮色</option>
          <option value="dark">暗色</option>
        </select>
      </div>
      <div className="form-group">
        <label>CLI 路径</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={settings.claudeCliPath || ''} onChange={e => handleChange('claudeCliPath', e.target.value)}
            placeholder="claude" style={{ flex: 1 }} />
          <button className="primary" onClick={onDetect}>自动检测</button>
        </div>
        {cliStatus && <div className="form-hint">{cliStatus}</div>}
      </div>
      <div className="separator" />
      <h3 className="title-sm">字号设置</h3>
      <div className="form-group">
        <label>界面字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={11} max={20} value={settings.uiFontSize || 14}
            onChange={e => handleChange('uiFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.uiFontSize || 14}px</span>
        </div>
      </div>
      <div className="form-group">
        <label>编辑器字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={10} max={24} value={settings.editorFontSize || 13}
            onChange={e => handleChange('editorFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.editorFontSize || 13}px</span>
        </div>
      </div>
      <div className="form-group">
        <label>终端字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={10} max={24} value={settings.terminalFontSize || 14}
            onChange={e => handleChange('terminalFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.terminalFontSize || 14}px</span>
        </div>
      </div>
      <div className="form-group">
        <label>文件树字号</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="range" min={10} max={18} value={settings.treeFontSize || 13}
            onChange={e => handleChange('treeFontSize', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span className="text-sm" style={{ minWidth: 36 }}>{settings.treeFontSize || 13}px</span>
        </div>
      </div>
      <div className="separator" />
      <h3 className="title-sm">项目管理</h3>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button className="primary" onClick={handleScanClaudeSessions} disabled={scanning}>
          {scanning ? '扫描中...' : '扫描 Claude Code 会话'}
        </button>
        {scanResult && <span className="text-sm text-muted">{scanResult}</span>}
      </div>
      <div className="separator" />
      <h3 className="title-sm">数据备份</h3>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={async () => { const ok = await exportBackup(); alert(ok ? '已导出' : '取消'); }}>导出备份</button>
        <button onClick={async () => { if (!confirm('覆盖当前数据？')) return; const ok = await importBackup(); alert(ok ? '已恢复' : '取消'); }}>导入恢复</button>
      </div>
      <div className="separator" />
      <p className="text-muted text-sm">Claude Tool v2.0.0</p>
    </div>
  );
}

// ── Claude Global Config Tab ──
function ClaudeGlobalConfigTab({ settings, update, updateEnv }: {
  settings: ClaudeSettings; update: (k: string, v: unknown) => void;
  updateEnv: (k: string, v: string) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [showAddSelect, setShowAddSelect] = useState(false);
  const [addFilter, setAddFilter] = useState('');
  const envEntries = Object.entries(settings.env || {});

  const existingKeys = Object.keys(settings).filter(k => !EXCLUDED_KEYS.has(k));
  const coreKeys = existingKeys.filter(k => CLAUDE_CONFIG_SPEC[k]?.group === 'core' && CLAUDE_CONFIG_SPEC[k]?.type !== 'json');
  const displayKeys = existingKeys.filter(k => CLAUDE_CONFIG_SPEC[k]?.group === 'display' && CLAUDE_CONFIG_SPEC[k]?.type !== 'json');
  const jsonKeys = existingKeys.filter(k => CLAUDE_CONFIG_SPEC[k]?.type === 'json');
  const unknownKeys = existingKeys.filter(k => !CLAUDE_CONFIG_SPEC[k]);

  const availableToAdd = Object.keys(CLAUDE_CONFIG_SPEC)
    .filter(k => !EXCLUDED_KEYS.has(k) && !existingKeys.includes(k))
    .filter(k => !addFilter || CLAUDE_CONFIG_SPEC[k].label.includes(addFilter) || CLAUDE_CONFIG_SPEC[k].desc.includes(addFilter) || k.includes(addFilter));

  const handleAddConfig = (key: string) => {
    const spec = CLAUDE_CONFIG_SPEC[key];
    if (!spec) return;
    let defaultVal: unknown = '';
    if (spec.type === 'boolean') defaultVal = false;
    else if (spec.type === 'number') defaultVal = 0;
    else if (spec.type === 'json') defaultVal = {};
    update(key, defaultVal);
    setShowAddSelect(false);
  };

  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>~/.claude/settings.json</p>

      {/* Core config */}
      {coreKeys.length > 0 && (
        <>
          <h3 className="title-sm">核心配置</h3>
          {coreKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={CLAUDE_CONFIG_SPEC[key]}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* Display config */}
      {displayKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">显示配置</h3>
          {displayKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={CLAUDE_CONFIG_SPEC[key]}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* Unknown keys */}
      {unknownKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">其他配置</h3>
          {unknownKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={undefined}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* JSON config items */}
      {jsonKeys.length > 0 && (
        <>
          <div className="separator" />
          <h3 className="title-sm">高级配置 (JSON)</h3>
          {jsonKeys.map(key => (
            <ConfigItem key={key} keyName={key} value={settings[key]} spec={CLAUDE_CONFIG_SPEC[key]}
              onChange={v => update(key, v)} onRemove={() => update(key, undefined)} />
          ))}
        </>
      )}

      {/* Add config dropdown */}
      <div className="separator" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {showAddSelect ? (
          <div style={{ flex: 1 }}>
            <input value={addFilter} placeholder="搜索配置项..." style={{ width: '100%', marginBottom: 6 }}
              onChange={e => setAddFilter(e.target.value)} autoFocus />
            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {availableToAdd.length === 0 && <div className="text-sm text-muted" style={{ padding: 12 }}>没有匹配的配置项</div>}
              {availableToAdd.map(k => (
                <div key={k} className="add-config-item" style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onClick={() => handleAddConfig(k)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div className="text-sm" style={{ fontWeight: 500 }}>{CLAUDE_CONFIG_SPEC[k].label} <code className="text-sm text-muted">{k}</code></div>
                  <div className="text-sm text-muted">{CLAUDE_CONFIG_SPEC[k].desc}</div>
                </div>
              ))}
            </div>
            <button style={{ marginTop: 6 }} onClick={() => { setShowAddSelect(false); setAddFilter(''); }}>取消</button>
          </div>
        ) : (
          <>
            <button className="primary" onClick={() => setShowAddSelect(true)}>添加配置</button>
            <span className="text-sm text-muted">或手动输入：</span>
            <input value={newKey} placeholder="自定义键名" style={{ flex: 1 }}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newKey.trim()) { update(newKey.trim(), ''); setNewKey(''); } }} />
            <button onClick={() => { if (newKey.trim()) { update(newKey.trim(), ''); setNewKey(''); } }}>添加</button>
          </>
        )}
      </div>

      {/* Environment variables */}
      <div className="separator" />
      <h3 className="title-sm">环境变量（{envEntries.length} 个）</h3>
      {envEntries.map(([key, value]) => {
        const spec = ENV_SPEC[key];
        return (
          <div key={key} className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>{spec ? `${spec.label} (${key})` : key}</label>
              <button className="btn-sm btn-danger" onClick={() => updateEnv(key, '')}>×</button>
            </div>
            {spec && <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{spec.desc}</div>}
            <input value={String(value)} style={{ width: '100%' }} onChange={e => updateEnv(key, e.target.value)} />
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={newEnvKey} placeholder="新变量名" style={{ flex: 1 }} onChange={e => setNewEnvKey(e.target.value)} />
        <button onClick={() => { if (newEnvKey.trim()) { updateEnv(newEnvKey.trim(), ''); setNewEnvKey(''); } }}>添加</button>
      </div>
    </div>
  );
}

// ── Permissions Tab ──
function PermissionsTab({ settings, update }: {
  settings: ClaudeSettings; update: (k: string, v: unknown) => void;
}) {
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>~/.claude/settings.json · permissions</p>
      <PermissionsEditor permissions={settings.permissions || {}} update={update} />
    </div>
  );
}

// ── Global Rules Tab ──
function GlobalRulesTab({ rules, setRules, editRule, setEditRule, newRuleName, setNewRuleName }: {
  rules: { name: string; content: string }[];
  setRules: (r: { name: string; content: string }[]) => void;
  editRule: { name: string; content: string } | null; setEditRule: (r: { name: string; content: string } | null) => void;
  newRuleName: string; setNewRuleName: (v: string) => void;
}) {
  const saveRule = async () => {
    if (!editRule || !editRule.name.trim()) return;
    await window.electronAPI.saveGlobalRule(editRule.name, editRule.content);
    const updated = await window.electronAPI.getGlobalRules();
    setRules(updated);
    setEditRule(null);
  };

  const deleteRule = async (name: string) => {
    if (!confirm(`删除规则 ${name}？`)) return;
    await window.electronAPI.deleteGlobalRule(name);
    setRules(await window.electronAPI.getGlobalRules());
  };

  if (editRule) {
    return (
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="title-sm">{editRule.name}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditRule(null)}>取消</button>
            <button className="primary" onClick={saveRule}>保存</button>
          </div>
        </div>
        <textarea className="claude-md-editor" value={editRule.content}
          onChange={e => setEditRule({ ...editRule, content: e.target.value })}
          placeholder="规则内容..." spellCheck={false} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        ~/.claude/rules/ · {rules.length} 条规则
      </p>
      {rules.map(r => (
        <div key={r.name} className="permission-row" style={{ padding: '8px 0' }}>
          <span className="text-sm" style={{ flex: 1 }}>{r.name}</span>
          <button className="btn-sm" onClick={() => setEditRule({ ...r })}>编辑</button>
          <button className="btn-sm btn-danger" onClick={() => deleteRule(r.name)}>删除</button>
        </div>
      ))}
      <div className="separator" />
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={newRuleName} placeholder="新规则名称" style={{ flex: 1 }}
          onChange={e => setNewRuleName(e.target.value)} />
        <button className="primary" onClick={() => {
          if (!newRuleName.trim()) return;
          const name = newRuleName.endsWith('.md') ? newRuleName : newRuleName + '.md';
          setEditRule({ name, content: `---\n---\n# ${name.replace('.md', '')}\n\n` });
          setNewRuleName('');
        }}>新建</button>
      </div>
    </div>
  );
}

// ── Global CLAUDE.md Tab ──
function GlobalMdTab({ md, setMd }: { md: string; setMd: (v: string) => void }) {
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 8 }}>~/.claude/CLAUDE.md</p>
      <textarea className="claude-md-editor"
        value={md}
        onChange={e => setMd(e.target.value)}
        placeholder="全局指令，对所有会话生效..."
        spellCheck={false} />
    </div>
  );
}

function PermissionsEditor({ permissions, update }: { permissions: { allow?: string[]; deny?: string[] }; update: (k: string, v: unknown) => void }) {
  const allowList: string[] = permissions.allow || [];
  const [newRule, setNewRule] = useState('');

  const grouped: Record<string, { rule: string; index: number }[]> = {};
  allowList.forEach((r: string, i: number) => {
    const tool = r.match(/^(\w+)\(/)?.[1] || 'other';
    if (!grouped[tool]) grouped[tool] = [];
    grouped[tool].push({ rule: r, index: i });
  });

  return (
    <div style={{ marginTop: 8 }}>
      {Object.entries(grouped).map(([tool, rules]) => (
        <div key={tool} style={{ marginBottom: 8 }}>
          <div className="text-sm text-bold" style={{ marginBottom: 4 }}>{tool}</div>
          {rules.map(({ rule, index }) => (
            <div key={index} className="permission-row">
              <code className="text-sm">{rule}</code>
              <button className="btn-sm btn-danger" onClick={() => {
                const list = [...allowList]; list.splice(index, 1);
                update('permissions', { ...permissions, allow: list });
              }}>×</button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={newRule} placeholder='如 Bash(git push*)' style={{ flex: 1 }}
          onChange={e => setNewRule(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newRule.trim()) {
            update('permissions', { ...permissions, allow: [...allowList, newRule.trim()] }); setNewRule('');
          }}} />
        <button className="primary" onClick={() => {
          if (newRule.trim()) { update('permissions', { ...permissions, allow: [...allowList, newRule.trim()] }); setNewRule(''); }
        }}>添加</button>
      </div>
    </div>
  );
}

// ── Project Tab ──
function ProjectTab({ settings, update, projectPath }: {
  settings: ClaudeSettings; update: (k: string, v: unknown) => void; projectPath: string;
}) {
  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        项目级设置 · {projectPath}/.claude/settings.local.json
      </p>
      <div className="form-group">
        <label>项目允许的命令（每行一个）</label>
        <textarea value={(settings.allowedCommands || []).join('\n')} rows={6}
          onChange={e => update('allowedCommands', e.target.value.split('\n').filter(Boolean))}
          placeholder="Bash(git status)&#10;Bash(npm test)" />
      </div>
      <div className="form-group">
        <label>项目 MCP 服务器（JSON）</label>
        <textarea value={JSON.stringify(settings.mcpServers || {}, null, 2)} rows={6}
          onChange={e => { try { update('mcpServers', JSON.parse(e.target.value)); } catch {} }}
          placeholder='{"server-name": { "command": "npx", "args": [...] }}' />
      </div>
    </div>
  );
}

// ── Rules Tab ──
function RulesTab({ projectPath, rules, setRules, editRule, setEditRule, newRuleName, setNewRuleName }: {
  projectPath: string; rules: { name: string; content: string }[];
  setRules: (r: { name: string; content: string }[]) => void;
  editRule: { name: string; content: string } | null; setEditRule: (r: { name: string; content: string } | null) => void;
  newRuleName: string; setNewRuleName: (v: string) => void;
}) {
  const saveRule = async () => {
    if (!editRule || !editRule.name.trim()) return;
    await window.electronAPI.saveProjectRule(projectPath, editRule.name, editRule.content);
    const updated = await window.electronAPI.getProjectRules(projectPath);
    setRules(updated);
    setEditRule(null);
  };

  const deleteRule = async (name: string) => {
    if (!confirm(`删除规则 ${name}？`)) return;
    await window.electronAPI.deleteProjectRule(projectPath, name);
    setRules(await window.electronAPI.getProjectRules(projectPath));
  };

  if (editRule) {
    return (
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="title-sm">{editRule.name}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEditRule(null)}>取消</button>
            <button className="primary" onClick={saveRule}>保存</button>
          </div>
        </div>
        <textarea className="claude-md-editor" value={editRule.content}
          onChange={e => setEditRule({ ...editRule, content: e.target.value })}
          placeholder="规则内容..." spellCheck={false} />
      </div>
    );
  }

  return (
    <div className="settings-section">
      <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
        {projectPath}/.claude/rules/ · {rules.length} 条规则
      </p>
      {rules.map(r => (
        <div key={r.name} className="permission-row" style={{ padding: '8px 0' }}>
          <span className="text-sm" style={{ flex: 1 }}>{r.name}</span>
          <button className="btn-sm" onClick={() => setEditRule({ ...r })}>编辑</button>
          <button className="btn-sm btn-danger" onClick={() => deleteRule(r.name)}>删除</button>
        </div>
      ))}
      <div className="separator" />
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={newRuleName} placeholder="新规则名称" style={{ flex: 1 }}
          onChange={e => setNewRuleName(e.target.value)} />
        <button className="primary" onClick={async () => {
          if (!newRuleName.trim()) return;
          const name = newRuleName.endsWith('.md') ? newRuleName : newRuleName + '.md';
          setEditRule({ name, content: `---\n---\n# ${name.replace('.md', '')}\n\n` });
          setNewRuleName('');
        }}>新建</button>
      </div>
    </div>
  );
}

// ── Instructions Tab ──
function InstructionsTab({ globalMd, setGlobalMd, projectMd, setProjectMd, hasProject }: {
  globalMd: string; setGlobalMd: (v: string) => void;
  projectMd: string; setProjectMd: (v: string) => void; hasProject: boolean;
}) {
  const [scope, setScope] = useState('global');
  return (
    <div className="settings-section">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={scope === 'global' ? 'primary' : ''} onClick={() => setScope('global')}>全局 CLAUDE.md</button>
        {hasProject && <button className={scope === 'project' ? 'primary' : ''} onClick={() => setScope('project')}>项目 CLAUDE.md</button>}
      </div>
      <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
        {scope === 'global' ? '~/.claude/CLAUDE.md' : '项目根目录/CLAUDE.md'}
      </p>
      <textarea className="claude-md-editor"
        value={scope === 'global' ? globalMd : projectMd}
        onChange={e => scope === 'global' ? setGlobalMd(e.target.value) : setProjectMd(e.target.value)}
        placeholder={scope === 'global' ? '全局指令，对所有会话生效...' : '项目指令，对本项目会话生效...'}
        spellCheck={false} />
    </div>
  );
}

// ── Config Item (generic editor for a single config key) ──
function ConfigItem({ keyName, value, spec, onChange, onRemove }: {
  keyName: string; value: unknown; spec?: ConfigSpec;
  onChange: (v: unknown) => void; onRemove: () => void;
}) {
  const [jsonText, setJsonText] = useState('');
  const [jsonEdit, setJsonEdit] = useState(false);

  const label = spec?.label || keyName;
  const desc = spec?.desc || '';
  const type = spec?.type || guessType(value);

  // JSON editor init — re-sync when value changes externally
  useEffect(() => {
    if (type === 'json' && !jsonEdit) setJsonText(JSON.stringify(value, null, 2));
  }, [value]);

  return (
    <div className="form-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <label>{label}</label>
        <button className="btn-sm btn-danger" onClick={onRemove} title="删除此配置">×</button>
      </div>
      {desc && <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{desc}</div>}
      {type === 'boolean' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
          <span className="text-sm">{value ? '已启用' : '未启用'}</span>
        </label>
      )}
      {type === 'string' && spec?.options && (
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          {spec.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {type === 'string' && !spec?.options && (
        <input value={String(value ?? '')} onChange={e => onChange(e.target.value)} />
      )}
      {type === 'number' && (
        <input type="number" value={String(value ?? 0)} onChange={e => onChange(Number(e.target.value))} />
      )}
      {type === 'json' && !jsonEdit && (
        <div className="config-json-preview" onClick={() => setJsonEdit(true)} title="点击编辑">
          <pre className="text-sm" style={{ margin: 0, maxHeight: 120, overflow: 'auto', cursor: 'pointer' }}>
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      )}
      {type === 'json' && jsonEdit && (
        <>
          <textarea className="claude-md-editor" value={jsonText} rows={8}
            onChange={e => setJsonText(e.target.value)} spellCheck={false} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn-sm primary" onClick={() => {
              try { onChange(JSON.parse(jsonText)); setJsonEdit(false); } catch { alert('JSON 格式错误'); }
            }}>保存</button>
            <button className="btn-sm" onClick={() => { setJsonEdit(false); setJsonText(JSON.stringify(value, null, 2)); }}>取消</button>
          </div>
        </>
      )}
    </div>
  );
}

function guessType(value: unknown): ConfigType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}
