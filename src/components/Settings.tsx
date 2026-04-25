import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import type { ClaudeSettings, AppConfig } from '../types/electron';
import { APP_TABS, CLAUDE_GLOBAL_TABS, PROJECT_CLAUDE_TABS } from './settings/tab-configs';
import GeneralTab from './settings/GeneralTab';
import ClaudeGlobalConfigTab from './settings/ClaudeGlobalConfigTab';
import PermissionsTab from './settings/PermissionsTab';
import RulesEditor from './settings/RulesEditor';
import { GlobalMdTab } from './settings/InstructionsTab';
import ProjectTab from './settings/ProjectTab';
import InstructionsTab from './settings/InstructionsTab';

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
      const [s, md, gr] = await Promise.all([
        window.electronAPI.getClaudeSettings(),
        window.electronAPI.getClaudeMd(),
        window.electronAPI.getGlobalRules(),
      ]);
      setClaudeSettings(s || {});
      setClaudeMd(md || '');
      setGlobalRules(gr);
    })();
  }, []);

  useEffect(() => {
    if (!project) return;
    (async () => {
      const [ps, pmd, r] = await Promise.all([
        window.electronAPI.getProjectSettings(project.path),
        window.electronAPI.getProjectClaudeMd(project.path),
        window.electronAPI.getProjectRules(project.path),
      ]);
      setProjectSettings(ps || {});
      setProjectMd(pmd || '');
      setRules(r);
    })();
  }, [project?.id]);

  // App settings handlers
  const handleAppChange = useCallback((key: string, value: string | number) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      updateSettings(updated);
      return updated;
    });
  }, [updateSettings]);

  const handleDetectCli = useCallback(async () => {
    setCliStatus('检测中...');
    const p = await window.electronAPI.detectClaudeCli();
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
        {tab === 'global-rules' && <RulesEditor
          location="~/.claude/rules/"
          rules={globalRules} setRules={setGlobalRules}
          editRule={editGlobalRule} setEditRule={setEditGlobalRule}
          newRuleName={newGlobalRuleName} setNewRuleName={setNewGlobalRuleName}
          onSave={async (n, c) => window.electronAPI.saveGlobalRule(n, c)}
          onDelete={async n => window.electronAPI.deleteGlobalRule(n)}
          onRefresh={async () => window.electronAPI.getGlobalRules()}
        />}
        {tab === 'global-md' && <GlobalMdTab md={claudeMd} setMd={setClaudeMd} />}
        {tab === 'project' && project && projectSettings && <ProjectTab settings={projectSettings} update={updateProjectSettings}
          projectPath={project.path} />}
        {tab === 'rules' && project && <RulesEditor
          location={`${project.path}/.claude/rules/`}
          rules={rules} setRules={setRules}
          editRule={editRule} setEditRule={setEditRule}
          newRuleName={newRuleName} setNewRuleName={setNewRuleName}
          onSave={async (n, c) => window.electronAPI.saveProjectRule(project.path, n, c)}
          onDelete={async n => window.electronAPI.deleteProjectRule(project.path, n)}
          onRefresh={async () => window.electronAPI.getProjectRules(project.path)}
        />}
        {tab === 'instructions' && <InstructionsTab globalMd={claudeMd} setGlobalMd={setClaudeMd}
          projectMd={projectMd} setProjectMd={setProjectMd} hasProject={!!project} />}
      </div>
    </div>
  );
}
