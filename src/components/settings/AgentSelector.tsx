// Agent selector dropdown used by the Settings panels to switch which agent's
// config is being edited (omp / Claude / Codex / Gemini / GitHub Copilot).

import { AGENT_LABELS, AGENT_ORDER } from './agent-specs';
import type { AgentKind } from '../../lib/tauri-api';

interface AgentSelectorProps {
  value: AgentKind;
  onChange: (kind: AgentKind) => void;
}

export default function AgentSelector({ value, onChange }: AgentSelectorProps) {
  return (
    <div className="form-group agent-selector">
      <label>Agent</label>
      <select value={value} onChange={e => onChange(e.target.value as AgentKind)}>
        {AGENT_ORDER.map(k => (
          <option key={k} value={k}>{AGENT_LABELS[k]}</option>
        ))}
      </select>
    </div>
  );
}
