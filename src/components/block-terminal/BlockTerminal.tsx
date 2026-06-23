// Warp-style block terminal. Replaces ClaudeChat + TerminalPanel.
// Renders PTY output as a vertical stack of command/output blocks, with a
// CodeMirror input bar at the bottom, AI command search, history search, and
// a workflows panel.

import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { stripAnsi } from '../../utils/ansi';
import { useBlockTerminal } from './useBlockTerminal';
import Block from './Block';
import BlockInputEditor from './BlockInputEditor';
import HistorySearch from './HistorySearch';
import AiCommandSearch from './AiCommandSearch';
import Workflows from './Workflows';

export default function BlockTerminal() {
  const { state } = useApp();
  const project = state.projects.find(p => p.id === state.currentProjectId);
  const { blocks, ready, send, sendRaw, resize } = useBlockTerminal();
  const [showHistory, setShowHistory] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Track whether the user is near the bottom to decide auto-scroll behaviour.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(nearBottom);
  }, []);

  useEffect(() => {
    if (autoScroll) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [blocks, autoScroll]);

  // Cmd-F / Ctrl-F in-block search (simple browser find via focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        // Let the browser native find work on the <pre> output.
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleResize = useCallback(() => {
    // Estimate cols/rows from the container width; rows are approximate.
    const el = scrollRef.current;
    if (!el) return;
    const charWidth = (state.settings.terminalFontSize || 14) * 0.6;
    const cols = Math.max(20, Math.floor((el.clientWidth - 24) / charWidth));
    const rows = 30;
    resize(cols, rows);
  }, [resize, state.settings.terminalFontSize]);

  useEffect(() => {
    handleResize();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => handleResize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [handleResize]);

  if (!project) return <div className="bt-root text-muted">未选择项目</div>;

  return (
    <div className="bt-root">
      <div className="bt-toolbar">
        <button className="bt-tool-btn" onClick={() => setShowWorkflows(s => !s)} title="Workflows">⚡</button>
        <button className="bt-tool-btn" onClick={() => setShowAi(s => !s)} title="AI 命令搜索 (Ctrl-I)">✨</button>
        <span className="bt-status">
          {ready ? <span className="bt-status-dot bt-status-on" /> : <span className="bt-status-dot bt-status-off" />}
          <span className="text-muted text-sm">{ready ? 'omp 就绪' : '启动中...'}</span>
        </span>
      </div>

      <div className="bt-scroll" ref={scrollRef} onScroll={onScroll}>
        {blocks.length === 0 && (
          <div className="bt-empty text-muted">等待 omp 启动... 在下方输入命令开始。</div>
        )}
        {blocks.map(b => (
          <Block key={b.id} block={b} onSaveAsWorkflow={(cmd) => { setPendingCommand(cmd); setShowWorkflows(true); }} />
        ))}
      </div>

      <div className="bt-input-area">
        {showAi && (
          <AiCommandSearch cwd={project.path} onPick={(cmd) => { sendRaw(cmd + '\r\n'); setShowAi(false); }} onClose={() => setShowAi(false)} />
        )}
        {showHistory && (
          <HistorySearch
            history={blocks.map(b => b.command).filter(Boolean)}
            onPick={(cmd) => { sendRaw(cmd + '\r\n'); setShowHistory(false); }}
            onClose={() => setShowHistory(false)}
          />
        )}
        {showWorkflows && (
          <Workflows
            onRun={(cmd) => send(cmd)}
            onClose={() => { setShowWorkflows(false); setPendingCommand(undefined); }}
            seedCommand={pendingCommand}
          />
        )}
        <BlockInputEditor
          onSubmit={send}
          onRaw={sendRaw}
          onHistorySearch={() => setShowHistory(s => !s)}
          onAiSearch={() => setShowAi(s => !s)}
          history={blocks.map(b => b.command).filter(Boolean)}
          fontSize={state.settings.terminalFontSize || 14}
        />
      </div>
    </div>
  );
}
