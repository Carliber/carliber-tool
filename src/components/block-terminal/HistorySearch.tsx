// Ctrl-R history search popover. Fuzzy-filter across all completed block commands +
// persisted shell history, insert the selected entry into the input editor.

import { useState, useMemo, useEffect, useRef } from 'react';

interface HistorySearchProps {
  history: string[];
  onPick: (command: string) => void;
  onClose: () => void;
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  // simple subsequence match
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i >= q.length) return true;
  }
  return i >= q.length;
}

export default function HistorySearch({ history, onPick, onClose }: HistorySearchProps) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const unique = [...new Set([...history].reverse())];
    if (!q.trim()) return unique.slice(0, 50);
    return unique.filter(c => fuzzyMatch(q, c)).slice(0, 50);
  }, [history, q]);

  useEffect(() => { setSel(0); }, [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'Enter') {
      const c = matches[sel];
      if (c !== undefined) onPick(c);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(matches.length - 1, s + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
  };

  return (
    <div className="bt-history-search" onKeyDown={onKey}>
      <div className="bt-history-header">
        <span className="bt-history-label">历史搜索 (Ctrl-R)</span>
        <input
          autoFocus
          className="bt-history-input"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="过滤历史命令..."
        />
        <button className="bt-history-close" onClick={onClose}>✕</button>
      </div>
      <div className="bt-history-list" ref={listRef}>
        {matches.length === 0 && <div className="bt-history-empty text-muted">无匹配</div>}
        {matches.map((c, i) => (
          <div
            key={`${c}-${i}`}
            className={`bt-history-item ${i === sel ? 'bt-history-item-sel' : ''}`}
            onMouseEnter={() => setSel(i)}
            onClick={() => onPick(c)}
          >
            <code>$ {c}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
