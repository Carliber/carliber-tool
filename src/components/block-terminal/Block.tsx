// A single Warp-style block: command header + ANSI-rendered output.
// Output uses ANSI-to-HTML span conversion (ansi-regex based) rendered in a <pre>,
// which is simpler and more reliable than a canvas grid. Per the plan's performance
// contingency, canvas can be added later if throughput demands it.

import { useState, useMemo } from 'react';
import { stripAnsi } from '../../utils/ansi';
import type { Block as BlockModel } from './BlockModel';

interface BlockProps {
  block: BlockModel;
  onCopy?: (text: string) => void;
  onSaveAsWorkflow?: (command: string) => void;
}

// Minimal ANSI SGR → inline-style span converter. Handles the common 8/16 colors
// used by omp / claude / git-bash. Non-SGR sequences are stripped by stripAnsi.
const ANSI_COLOR: Record<number, string> = {
  30: '#0c0c0c', 31: '#c50f1f', 32: '#13a10e', 33: '#c19c00',
  34: '#0037da', 35: '#881798', 36: '#3a96dd', 37: '#cccccc',
  90: '#767676', 91: '#e74856', 92: '#16c60c', 93: '#f9f1a5',
  94: '#3b78ff', 95: '#b4009e', 96: '#61d6d6', 97: '#f2f2f2',
};

function ansiToHtml(raw: string): string {
  // Escape HTML first.
  let out = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Replace \r\n / \n — kept as-is for <pre>.
  const parts: string[] = [];
  let color: string | null = null;
  let bold = false;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    let style = '';
    if (color) style += `color:${color};`;
    if (bold) style += 'font-weight:bold;';
    if (style) parts.push(`<span style="${style}">${buf}</span>`);
    else parts.push(buf);
    buf = '';
  };
  const esc = out.replace(/\x1b\[([\d;]*)m/g, (_m, p1: string) => `\x1b[${p1}m`);
  let i = 0;
  while (i < esc.length) {
    if (esc[i] === '\x1b' && esc[i + 1] === '[') {
      const end = esc.indexOf('m', i + 2);
      if (end !== -1) {
        flush();
        const codes = esc.slice(i + 2, end).split(';').filter(Boolean).map(Number);
        for (const c of codes) {
          if (c === 0) { color = null; bold = false; }
          else if (c === 1) bold = true;
          else if (c === 22) bold = false;
          else if (ANSI_COLOR[c]) color = ANSI_COLOR[c];
          else if (c >= 40 && c <= 47 || c >= 100 && c <= 107) { /* bg ignored */ }
        }
        i = end + 1;
        continue;
      }
    }
    buf += esc[i];
    i++;
  }
  flush();
  return parts.join('');
}

export default function Block({ block, onCopy, onSaveAsWorkflow }: BlockProps) {
  const [folded, setFolded] = useState(false);
  const [copied, setCopied] = useState(false);

  const plainOutput = useMemo(() => stripAnsi(block.output), [block.output]);
  const htmlOutput = useMemo(() => ansiToHtml(block.output), [block.output]);

  const statusDot =
    block.status === 'running' ? 'block-dot-running' :
    block.status === 'error' ? 'block-dot-error' : 'block-dot-done';

  const time = new Date(block.startedAt).toLocaleTimeString('zh-CN', { hour12: false });

  const handleCopy = () => {
    const text = block.command ? `$ ${block.command}\n${plainOutput}` : plainOutput;
    navigator.clipboard.writeText(text);
    if (onCopy) onCopy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bt-block">
      <div className="bt-block-header">
        <span className={`bt-block-dot ${statusDot}`} />
        {block.command ? (
          <code className="bt-block-cmd">$ {block.command}</code>
        ) : (
          <span className="bt-block-cmd bt-block-cmd-muted">— startup —</span>
        )}
        <span className="bt-block-time">{time}</span>
        <div className="bt-block-actions">
          <button className="bt-block-action" onClick={() => setFolded(f => !f)} title={folded ? '展开' : '折叠'}>
            {folded ? '▾' : '▴'}
          </button>
          <button className="bt-block-action" onClick={handleCopy} title="复制">
            {copied ? '✓' : '⧉'}
          </button>
          {block.command && onSaveAsWorkflow && (
            <button className="bt-block-action" onClick={() => onSaveAsWorkflow(block.command)} title="保存为 Workflow">⚡</button>
          )}
        </div>
      </div>
      {!folded && (
        <pre className="bt-block-output" dangerouslySetInnerHTML={{ __html: htmlOutput }} />
      )}
    </div>
  );
}
