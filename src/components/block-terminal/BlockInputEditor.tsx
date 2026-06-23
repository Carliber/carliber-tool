// Bottom input editor for the block terminal. Uses CodeMirror 6 for multi-line editing.
// Enter submits (writes command + \r\n to PTY and opens a new block); Shift+Enter is a
// newline. Up/Down navigate shell history. Ctrl-C / Tab / Ctrl-D pass through as raw
// control bytes to the PTY (not into the editor buffer). Ctrl-R opens history search.

import { useRef, useEffect } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';

interface BlockInputEditorProps {
  onSubmit: (command: string) => void;
  onRaw: (data: string) => void;
  onHistorySearch: () => void;
  onAiSearch: () => void;
  history: string[];
  fontSize: number;
}

export default function BlockInputEditor({ onSubmit, onRaw, onHistorySearch, onAiSearch, history, fontSize }: BlockInputEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onRawRef = useRef(onRaw);
  onRawRef.current = onRaw;
  const onHistorySearchRef = useRef(onHistorySearch);
  onHistorySearchRef.current = onHistorySearch;
  const onAiSearchRef = useRef(onAiSearch);
  onAiSearchRef.current = onAiSearch;
  const historyRef = useRef(history);
  historyRef.current = history;
  const histPosRef = useRef<number>(-1);

  useEffect(() => {
    if (!hostRef.current) return;

    const submit = () => {
      const text = viewRef.current?.state.doc.toString() ?? '';
      if (!text.trim()) {
        // Empty submit still sends a newline so the prompt advances.
        onRawRef.current('\r\n');
        return text;
      }
      onSubmitRef.current(text);
      histPosRef.current = -1;
      return text;
    };

    const historyPrev = () => {
      const hist = historyRef.current;
      if (hist.length === 0) return false;
      if (histPosRef.current === -1) histPosRef.current = hist.length;
      histPosRef.current = Math.max(0, histPosRef.current - 1);
      const v = hist[histPosRef.current];
      if (v !== undefined && viewRef.current) {
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: v },
        });
      }
      return true;
    };

    const historyNext = () => {
      const hist = historyRef.current;
      if (hist.length === 0) return false;
      if (histPosRef.current === -1) return false;
      histPosRef.current = Math.min(hist.length, histPosRef.current + 1);
      const v = histPosRef.current >= hist.length ? '' : hist[histPosRef.current];
      if (viewRef.current) {
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: v },
        });
      }
      return true;
    };

    const customKeymap = keymap.of([
      { key: 'Enter', run: () => { submit(); if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' } }); return true; } },
      { key: 'Shift-Enter', run: () => false },
      { key: 'ArrowUp', run: () => historyPrev() },
      { key: 'ArrowDown', run: () => historyNext() },
      { key: 'Ctrl-r', run: () => { onHistorySearchRef.current(); return true; } },
      { key: 'Ctrl-R', run: () => { onHistorySearchRef.current(); return true; } },
      { key: 'Ctrl-i', run: () => { onAiSearchRef.current(); return true; } }, // AI command search
      { key: 'Ctrl-I', run: () => { onAiSearchRef.current(); return true; } },
      // Control-character passthrough to the PTY (not into the editor buffer).
      { key: 'Ctrl-c', run: () => { onRawRef.current('\x03'); if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' } }); return true; } },
      { key: 'Ctrl-d', run: () => { onRawRef.current('\x04'); return true; } },
      { key: 'Tab', run: () => { onRawRef.current('\t'); return true; } },
      { key: 'Ctrl-l', run: () => { onRawRef.current('\x0c'); return true; } },
      { key: 'Ctrl-u', run: () => { if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' } }); return true; } },
    ]);

    const state = EditorState.create({
      doc: '',
      extensions: [
        bracketMatching(),
        highlightActiveLine(),
        customKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { fontSize: `${fontSize}px`, height: 'auto' },
          '.cm-scroller': { fontFamily: '"Cascadia Mono", Consolas, Menlo, monospace', lineHeight: '1.3' },
          '.cm-content': { padding: '4px 8px' },
          '&.cm-focused': { outline: 'none' },
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    view.focus();
    return () => { view.destroy(); viewRef.current = null; };
  }, [fontSize]);

  return <div ref={hostRef} className="bt-input-editor" />;
}

