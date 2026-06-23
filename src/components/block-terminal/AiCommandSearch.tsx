// AI command search: translate a natural-language query into a shell command via
// omp's print mode (backend ai_command_search). Failing silently degrades to a no-op.

import { useState } from 'react';
import * as api from '../../lib/tauri-api';

interface AiCommandSearchProps {
  cwd: string;
  onPick: (command: string) => void;
  onClose: () => void;
}

export default function AiCommandSearch({ cwd, onPick, onClose }: AiCommandSearchProps) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const cmd = await api.aiCommandSearch(q, cwd);
      if (cmd) setResult(cmd);
      else setError('omp 不可用或未返回结果');
    } catch {
      setError('请求失败');
    }
    setLoading(false);
  };

  return (
    <div className="bt-ai-search">
      <div className="bt-ai-header">
        <span className="bt-ai-label">⚡ AI 命令搜索</span>
        <button className="bt-ai-close" onClick={onClose}>✕</button>
      </div>
      <div className="bt-ai-body">
        <div className="bt-ai-row">
          <input
            autoFocus
            className="bt-ai-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') run(); if (e.key === 'Escape') onClose(); }}
            placeholder="用自然语言描述要执行的命令..."
          />
          <button className="primary bt-ai-run" onClick={run} disabled={loading}>
            {loading ? '生成中...' : '生成'}
          </button>
        </div>
        {error && <div className="bt-ai-error text-muted text-sm">{error}</div>}
        {result && (
          <div className="bt-ai-result" onClick={() => onPick(result)}>
            <code>$ {result}</code>
            <span className="bt-ai-hint text-muted text-sm">点击插入</span>
          </div>
        )}
      </div>
    </div>
  );
}
