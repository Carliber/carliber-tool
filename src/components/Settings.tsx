import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import type { ClaudeSettings, AppConfig } from '../types/api';
import * as api from '../lib/tauri-api';
import type { AgentKind } from '../lib/tauri-api';
import { APP_TABS } from './settings/tab-configs';
import GeneralTab from './settings/GeneralTab';
import AgentGlobalConfigTab from './settings/AgentGlobalConfigTab';
import PermissionsTab from './settings/PermissionsTab';
import RulesEditor from './settings/RulesEditor';
import { GlobalMdTab, default as InstructionsTab } from './settings/InstructionsTab';
import ProjectTab from './settings/ProjectTab';
import AgentSelector from './settings/AgentSelector';
import { AGENT_LABELS } from './settings/agent-specs';

// Settings modes:
//   'app'            — application preferences (GeneralTab only)
//   'agent-global'   — global agent config (the menu-bar "设置" popup and the tab)
//   'agent-project'  — project-scoped agent config (right-panel "项目配置")
export default function Settings({ mode }: { mode: 'app' | 'agent-global' | 'agent-project' }) {
  const { state, updateSettings } = useApp();
  const [agentKind, setAgentKind] = useState<AgentKind>('omp');
  const [tab, setTab] = useState(mode === 'app' ? 'general' : mode === 'agent-project' ? 'project' : 'agent-global');
  const [settings, setSettings] = useState<AppConfig>(state.settings as AppConfig);
  const [cliStatus, setCliStatus] = useState('');
  const [saved, setSaved] = useState(false);

  // Global agent config + instructions + rules.
  const [globalConfig, setGlobalConfig] = useState<ClaudeSettings | null>(null);
  const [globalMd, setGlobalMd] = useState('');
  const [globalRules, setGlobalRules] = useState<{ name: string; content: string }[]>([]);
  const [editGlobalRule, setEditGlobalRule] = useState<{ name: string; content: string } | null>(null);
  const [newGlobalRuleName, setNewGlobalRuleName] = useState('');

  // Project agent config + instructions + rules.
  const [projectConfig, setProjectConfig] = useState<ClaudeSettings | null>(null);
  const [projectMd, setProjectMd] = useState('');
  const [rules, setRules] = useState<{ name: string; content: string }[]>([]);
  const [editRule, setEditRule] = useState<{ name: string; content: string } | null>(null);
  const [newRuleName, setNewRuleName] = useState('');

  const project = state.projects.find(p => p.id === state.currentProjectId);

  useEffect(() => { setSettings(state.settings); }, [state.settings]);

  // Load global agent config whenever the agent kind changes.
  useEffect(() => {
    if (mode === 'app') return;
    (async () => {
      const [cfg, md, gr] = await Promise.all([
        api.getAgentGlobalConfig(agentKind),
        api.getAgentInstructions(agentKind, 'global'),
        api.getAgentRules(agentKind, 'global'),
      ]);
      setGlobalConfig((cfg as ClaudeSettings) || {});
      setGlobalMd(md || '');
      setGlobalRules(gr);
    })();
  }, [mode, agentKind]);

  // Load project agent config when project or agent kind changes.
  useEffect(() => {
    if (mode !== 'agent-project' || !project) return;
    (async () => {
      const [cfg, md, r] = await Promise.all([
        api.getAgentProjectConfig(agentKind, project.path),
        api.getAgentInstructions(agentKind, 'project', project.path),
        api.getAgentRules(agentKind, 'project', project.path),
      ]);
      setProjectConfig((cfg as ClaudeSettings) || {});
      setProjectMd(md || '');
      setRules(r);
    })();
  }, [mode, agentKind, project?.id]);

  const handleAppChange = useCallback((key: string, value: string | number) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      updateSettings(updated);
      return updated;
    });
  }, [updateSettings]);

  const handleDetectCli = useCallback(async () => {
    setCliStatus('检测中...');
    const p = await api.detectOmpCli();
    if (p) { handleAppChange('ompCliPath', p); setCliStatus(`已检测到: ${p}`); }
    else setCliStatus('未找到');
  }, [handleAppChange]);

  // Global config update (handles omp nested replace and raw text).
  const updateGlobal = useCallback((key: string, value: unknown) => {
    setGlobalConfig(prev => {
      if (!prev) return prev;
      if (key === '__replace_all__' && value && typeof value === 'object') return value as ClaudeSettings;
      if (key === '__raw__' && typeof value === 'string') return value as unknown as ClaudeSettings;
      if (value === undefined) {
        const { [key]: _removed, ...rest } = prev;
        return rest as ClaudeSettings;
      }
      return { ...prev, [key]: value };
    });
    setSaved(false);
  }, []);

  const updateGlobalEnv = useCallback((key: string, value: string) => {
    setGlobalConfig(prev => {
      if (!prev) return prev;
      const env: Record<string, string> = { ...(prev.env || {}) };
      if (value === '') delete env[key]; else env[key] = value;
      return { ...prev, env };
    });
    setSaved(false);
  }, []);

  const updateProjectConfig = useCallback((key: string, value: unknown) => {
    setProjectConfig(prev => {
      if (!prev) return prev;
      if (key === '__replace_all__' && value && typeof value === 'object') return value as ClaudeSettings;
      if (key === '__raw__' && typeof value === 'string') return value as unknown as ClaudeSettings;
      return { ...prev, [key]: value };
    });
    setSaved(false);
  }, []);

  const saveAll = async () => {
    if (mode === 'agent-global' && globalConfig) {
      await api.saveAgentGlobalConfig(agentKind, globalConfig);
      await api.saveAgentInstructions(agentKind, 'global', globalMd);
    }
    if (mode === 'agent-project' && project) {
      if (projectConfig) await api.saveAgentProjectConfig(agentKind, project.path, projectConfig);
      await api.saveAgentInstructions(agentKind, 'project', projectMd, project.path);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = mode === 'app' ? APP_TABS : mode === 'agent-global'
    ? [{ id: 'agent-global', label: `${AGENT_LABELS[agentKind]} 配置` }, { id: 'permissions', label: '权限' }, { id: 'global-rules', label: '规则' }, { id: 'global-md', label: '指令' }]
    : [{ id: 'project', label: '项目设置' }, { id: 'rules', label: '规则' }, { id: 'instructions', label: '指令' }];

  if (mode !== 'app' && !globalConfig) return <div className="text-muted">加载中...</div>;

  const headerTitle = mode === 'app'
    ? '首选项'
    : mode === 'agent-global'
      ? `${AGENT_LABELS[agentKind]} 全局配置`
      : `${AGENT_LABELS[agentKind]} 项目配置`;

  return (
    <div className="settings-container">
      <div className="claude-settings-header">
        <h2 className="title-lg">{headerTitle}</h2>
        {mode !== 'app' && (
          <div style={{ marginLeft: 8 }}>
            <AgentSelector value={agentKind} onChange={setAgentKind} />
          </div>
        )}
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
        {tab === 'agent-global' && globalConfig && (
          <AgentGlobalConfigTab kind={agentKind} settings={globalConfig} update={updateGlobal} updateEnv={updateGlobalEnv} />
        )}
        {tab === 'permissions' && globalConfig && <PermissionsTab settings={globalConfig} update={updateGlobal} />}
        {tab === 'global-rules' && (
          <RulesEditor
            location={`~/.${agentKind === 'omp' ? 'omp/agent' : 'claude'}/rules/`}
            rules={globalRules} setRules={setGlobalRules}
            editRule={editGlobalRule} setEditRule={setEditGlobalRule}
            newRuleName={newGlobalRuleName} setNewRuleName={setNewGlobalRuleName}
            onSave={async (n, c) => { await api.saveAgentRule(agentKind, 'global', n, c); }}
            onDelete={async n => { await api.deleteAgentRule(agentKind, 'global', n); }}
            onRefresh={async () => api.getAgentRules(agentKind, 'global')}
          />
        )}
        {tab === 'global-md' && <GlobalMdTab md={globalMd} setMd={setGlobalMd} kind={agentKind} />}
        {tab === 'project' && project && projectConfig && (
          <ProjectTab settings={projectConfig} update={updateProjectConfig} projectPath={project.path} kind={agentKind} />
        )}
        {tab === 'rules' && project && (
          <RulesEditor
            location={`${project.path}/.${agentKind === 'omp' ? 'omp' : 'claude'}/rules/`}
            rules={rules} setRules={setRules}
            editRule={editRule} setEditRule={setEditRule}
            newRuleName={newRuleName} setNewRuleName={setNewRuleName}
            onSave={async (n, c) => { await api.saveAgentRule(agentKind, 'project', n, c, project.path); }}
            onDelete={async n => { await api.deleteAgentRule(agentKind, 'project', n, project.path); }}
            onRefresh={async () => api.getAgentRules(agentKind, 'project', project.path)}
          />
        )}
        {tab === 'instructions' && (
          <InstructionsTab globalMd={globalMd} setGlobalMd={setGlobalMd}
            projectMd={projectMd} setProjectMd={setProjectMd} hasProject={!!project} kind={agentKind} />
        )}
      </div>
    </div>
  );
}
