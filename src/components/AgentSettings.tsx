// Global agent settings popup (the menubar "设置" window, hash #agent-settings).
// Renders an agent selector and structured config editing for the selected agent,
// plus global rules and instructions. A lighter-weight version of Settings mode='agent-global'.

import { useState, useEffect } from 'react';
import type { ClaudeSettings } from '../types/api';
import * as api from '../lib/tauri-api';
import type { AgentKind } from '../lib/tauri-api';
import Titlebar from './Titlebar';
import AgentSelector from './settings/AgentSelector';
import AgentGlobalConfigTab from './settings/AgentGlobalConfigTab';
import { AGENT_LABELS } from './settings/agent-specs';

export default function AgentSettings() {
  const [agentKind, setAgentKind] = useState<AgentKind>('omp');
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [md, setMd] = useState('');
  const [tab, setTab] = useState('config');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await api.getAgentGlobalConfig(agentKind);
      const instructions = await api.getAgentInstructions(agentKind, 'global');
      const config = await api.getConfig();
      document.body.className = config.theme === 'dark' ? 'theme-dark' : '';
      setSettings((s as ClaudeSettings) || {});
      setMd(instructions || '');
    })();
  }, [agentKind]);

  if (!settings) return <div className="text-muted">加载中...</div>;

  const update = (key: string, value: unknown) => {
    setSettings(prev => {
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
  };

  const updateEnv = (key: string, value: string) => {
    setSettings(prev => {
      if (!prev) return prev;
      const env: Record<string, string> = { ...(prev.env || {}) };
      if (value === '') delete env[key]; else env[key] = value;
      return { ...prev, env };
    });
    setSaved(false);
  };

  const save = async () => {
    await api.saveAgentGlobalConfig(agentKind, settings);
    await api.saveAgentInstructions(agentKind, 'global', md);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="popup-root">
      <Titlebar title={`${AGENT_LABELS[agentKind]} 全局设置`} showMaximize={false} />
      <div className="popup-body">
        <div className="claude-settings-header">
          <h2 className="title-lg">{AGENT_LABELS[agentKind]} 全局设置</h2>
          <div style={{ marginLeft: 8 }}>
            <AgentSelector value={agentKind} onChange={setAgentKind} />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && <span className="text-sm" style={{ color: 'var(--success)' }}>已保存</span>}
            <button className="primary" onClick={save}>保存</button>
          </div>
        </div>

        <div className="claude-settings-tabs">
          {[
            { id: 'config', label: '配置' },
            { id: 'instructions', label: '指令' },
          ].map(t => (
            <div key={t.id} className={`claude-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </div>

        <div className="claude-settings-body">
          {tab === 'config' && <AgentGlobalConfigTab kind={agentKind} settings={settings} update={update} updateEnv={updateEnv} />}
          {tab === 'instructions' && (
            <div className="settings-section">
              <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
                {agentKind === 'omp' ? '~/.omp/agent/AGENTS.md' : `~/.${agentKind}/`} — 全局指令
              </p>
              <textarea
                className="claude-md-editor"
                value={md}
                onChange={e => setMd(e.target.value)}
                placeholder="全局指令..."
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
