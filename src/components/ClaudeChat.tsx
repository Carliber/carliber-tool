import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useApp } from '../context/AppContext';
import type { ChatMessage } from '../types/electron';
import { stripAnsi } from '../utils/ansi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

let msgIdCounter = 0;
function nextId() { return `msg-${++msgIdCounter}-${Date.now()}`; }

export interface ClaudeChatHandle {
  loadSession: (sessionId: string) => void;
}

const ClaudeChat = forwardRef<ClaudeChatHandle>(function ClaudeChat(_props, ref) {
  const { state } = useApp();
  const project = state.projects.find(p => p.id === state.currentProjectId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const assistantBufferRef = useRef('');
  const rafRef = useRef(0);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // RAF-based flush: only update DOM once per frame
  const scheduleFlush = useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      dirtyRef.current = false;
      const text = assistantBufferRef.current.trim();
      if (!text) return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.loading) {
          return [...prev.slice(0, -1), { ...last, text, loading: busyRef.current }];
        }
        return [...prev, { id: nextId(), role: 'assistant', text, ts: Date.now(), loading: true }];
      });
    });
  }, []);

  // Expose loadSession to parent
  useImperativeHandle(ref, () => ({
    loadSession: (sessionId: string) => {
      if (!project) return;
      assistantBufferRef.current = '';
      busyRef.current = false;
      setBusy(false);
      window.electronAPI.getSessionMessages(project.path, sessionId).then(msgs => {
        if (!msgs) return;
        setMessages(msgs.map(m => ({
          id: nextId(), role: m.role, text: m.text, ts: new Date(m.ts).getTime(),
        })));
      }).catch(() => {
        setMessages(prev => [...prev, { id: nextId(), role: 'system', text: '会话加载失败', ts: Date.now() }]);
      });
    },
  }), [project?.id]);

  // Finalize: flush remaining buffer as complete message
  const finalizeBuffer = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; dirtyRef.current = false; }
    const buf = assistantBufferRef.current.trim();
    assistantBufferRef.current = '';
    if (!buf) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.loading) return [...prev.slice(0, -1), { ...last, text: buf, loading: false }];
      return [...prev, { id: nextId(), role: 'assistant', text: buf, ts: Date.now() }];
    });
  }, []);

  useEffect(() => {
    if (!project) return;
    let loaded = false;
    window.electronAPI.getSessions(project.path).then(sessions => {
      if (loaded || sessions.length === 0) return;
      const latest = sessions[0];
      return window.electronAPI.getSessionMessages(project.path, latest.sessionId);
    }).then(msgs => {
      if (loaded || !msgs) return;
      setMessages(msgs.map(m => ({
        id: nextId(), role: m.role, text: m.text, ts: new Date(m.ts).getTime(),
      })));
    });
    return () => { loaded = true; };
  }, [project?.id]);

  useEffect(() => {
    if (!project) return;

    const unsubData = window.electronAPI.onPtyData((sessionId, data) => {
      if (sessionId !== project?.id) return;
      const clean = stripAnsi(data);
      if (!clean) return;

      // Banner
      if (/^[\s▐▛▜▝█▘]*Claude.*Code.*v\d/i.test(clean) && !assistantBufferRef.current) return;

      // Prompt — finalize response
      if (/^❯\s*$/m.test(clean) || /^(?:\$\s*|[#$>]\s*)$/m.test(clean)) {
        busyRef.current = false;
        setBusy(false);
        finalizeBuffer();
        return;
      }

      // Tool use indicators
      if (/^[⏺●◉▪▸▶]\s*(Reading|Editing|Writing|Creating|Searching|Deleting|Running|Executing|Analyzing|Browsing|Listing|Moving|Copying|Fetch)/im.test(clean)) return;
      if (/^[⏺●◉▪▸▶]\s*(Read|Edit|Write|Create|Search|Delete|Run|Execute|Analyze|Browse|List|Move|Copy|Fetch)\s/im.test(clean)) return;

      // File tree / diff markers
      if (/^  [↑↳├└│─]/m.test(clean)) return;

      // Tool result blocks
      if (/^\s*\d+\s*[│|]/m.test(clean) && !assistantBufferRef.current.trim()) return;

      // Progress/spinner
      if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(clean)) return;
      if (/^\s*\[.*\]\s*\.\.\./m.test(clean)) return;

      // Permission prompts
      if (/^\s*(Allow|Deny|Approve|Reject)\s*\(/m.test(clean)) return;

      // Cost/token summary lines
      if (/^\s*(Cost|Tokens|Duration|API)/im.test(clean) && clean.trim().length < 100) return;

      if (/Processing|Thinking|Reading|Generating|analyzing|tool use/i.test(clean)) {
        busyRef.current = true;
        setBusy(true);
      }

      assistantBufferRef.current += clean;
      scheduleFlush();
    });

    const unsubExit = window.electronAPI.onPtyExit((sessionId) => {
      if (sessionId !== project?.id) return;
      busyRef.current = false;
      setBusy(false);
      finalizeBuffer();
    });

    return () => { unsubData(); unsubExit(); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [project?.id, scheduleFlush, finalizeBuffer]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !project) return;
    finalizeBuffer();
    assistantBufferRef.current = '';
    setMessages(prev => [...prev, { id: nextId(), role: 'user', text, ts: Date.now() }]);
    window.electronAPI.writeTerminal(project.id, text + '\r\n');
    setInput('');
    setBusy(true);
    busyRef.current = true;
    inputRef.current?.focus();
  }, [input, project, finalizeBuffer]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as InputEvent).isComposing) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="claude-chat">
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p>在下方输入框中输入消息开始对话</p>
            <p className="text-sm text-muted">消息将通过 Claude CLI 发送</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`chat-message chat-message-${m.role}`}>
            <div className="chat-message-avatar">
              {m.role === 'user' ? '你' : m.role === 'assistant' ? 'C' : 'i'}
            </div>
            <div className="chat-message-body">
              <div className="chat-message-header">
                <span className="chat-message-sender">{m.role === 'user' ? '你' : m.role === 'assistant' ? 'Claude' : '系统'}</span>
                <span className="chat-message-time">{formatTime(m.ts)}</span>
                {m.role === 'assistant' && !m.loading && (
                  <button className="chat-copy-btn" onClick={() => handleCopy(m.id, m.text)} title="复制">
                    {copiedId === m.id ? '✓' : '⧉'}
                  </button>
                )}
              </div>
              <div className="chat-message-text">
                {m.loading && <span className="chat-cursor" />}
                {m.role === 'assistant' && !m.loading ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{m.text}</ReactMarkdown>
                ) : m.text}
              </div>
            </div>
          </div>
        ))}
        {busy && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-avatar">C</div>
            <div className="chat-message-body">
              <div className="chat-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        {showScrollBottom && (
          <button className="chat-scroll-bottom-btn" onClick={scrollToBottom}>↓</button>
        )}
      </div>
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          disabled={!project}
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim() || !project || busy}>
          ➤
        </button>
      </div>
    </div>
  );
});

export default ClaudeChat;
