// In-block text search. Activated by Cmd-F / Ctrl-F when the block terminal has focus.
// Highlights matches within the current blocks' stripped output and steps through them.

import { useState, useMemo, type KeyboardEvent } from 'react';
import { stripAnsi } from '../../utils/ansi';

interface BlockSearchProps {
  blocks: { id: string; command: string; output: string }[];
  onClose: () => void;
}

export default function BlockSearch({ blocks, onClose }: BlockSearchProps) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    const out: { blockId: string; count: number }[] = [];
    for (const b of blocks) {
      const hay = stripAnsi(b.output).toLowerCase() + ' ' + b.command.toLowerCase();
      let count = 0;
      let pos = hay.indexOf(needle);
      while (pos !== -1 && count < 999) { count++; pos = hay.indexOf(needle, pos + 1); }
      if (count > 0) out.push({ blockId: b.id, count });
    }
    return out;
  }, [q, blocks]);

  const total = matches.reduce((n, m) => n + m.count, 0);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') setIdx(i => (total > 0 ? (i + 1) % total : 0));
  };

  return (
    <div className="bt-search" onKeyDown={onKey}>
      <input
        autoFocus
        className="bt-search-input"
        value={q}
        onChange={e => { setQ(e.target.value); setIdx(0); }}
        placeholder="在块中搜索..."
      />
      <span className="bt-search-count text-muted text-sm">
        {total > 0 ? `${Math.min(idx + 1, total)}/${total}` : '无匹配'}
      </span>
      <button className="bt-search-close" onClick={onClose}>✕</button>
    </div>
  );
}
