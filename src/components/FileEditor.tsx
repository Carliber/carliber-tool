import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import type { FileEntry } from '../types/api';
import * as api from '../lib/tauri-api';

interface FileEditorProps {
  file: FileEntry;
  onClose: () => void;
  theme?: 'light' | 'dark';
  fontSize?: number;
}

function getLangExtension(filename: string): Extension {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot) : '';
  const map: Record<string, () => Extension> = {
    '.js': javascript, '.jsx': javascript, '.mjs': javascript, '.cjs': javascript,
    '.ts': () => javascript({ typescript: true }),
    '.tsx': () => javascript({ typescript: true, jsx: true }),
    '.css': css, '.scss': css, '.less': css,
    '.html': html, '.htm': html, '.svg': html,
    '.json': json,
    '.md': markdown, '.mdx': markdown,
    '.py': python,
  };
  const fn = map[ext];
  return fn ? fn() : [];
}

function getThemeExtension(dark: boolean) {
  return dark ? oneDark : EditorView.theme({}, { dark: false });
}

export default function FileEditor({ file, onClose, theme = 'light', fontSize = 13 }: FileEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langRef = useRef(new Compartment());
  const themeRef = useRef(new Compartment());
  const fontSizeRef = useRef(new Compartment());
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const originalContent = useRef<string>('');
  const saveFileRef = useRef<() => void>(() => {});

  saveFileRef.current = async () => {
    if (!viewRef.current) return;
    setSaving(true);
    const text = viewRef.current.state.doc.toString();
    const ok = await api.writeFile(file.path, text);
    if (ok) {
      originalContent.current = text;
      setDirty(false);
    }
    setSaving(false);
  };

  useEffect(() => {
    let cancelled = false;
    api.readFile(file.path).then(result => {
      if (cancelled) return;
      if (result.error) { setError(result.error); return; }
      setContent(result.content);
      originalContent.current = result.content;
    });
    return () => { cancelled = true; };
  }, [file.path]);

  useEffect(() => {
    if (!editorRef.current || content === null) return;

    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        setDirty(update.state.doc.toString() !== originalContent.current);
      }
    });

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => { saveFileRef.current?.(); return true; },
    }]);

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        langRef.current.of(getLangExtension(file.name)),
        themeRef.current.of(getThemeExtension(theme === 'dark')),
        fontSizeRef.current.of(EditorView.theme({
          '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: `${fontSize}px`, lineHeight: '1.6' },
        })),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        saveKeymap,
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({ '&': { height: '100%' } }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, [content]); // Only recreate on content change (new file)

  // Reconfigure theme without destroying editor
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeRef.current.reconfigure(getThemeExtension(theme === 'dark')),
    });
  }, [theme]);

  // Reconfigure font size without destroying editor
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: fontSizeRef.current.reconfigure(EditorView.theme({
        '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: `${fontSize}px`, lineHeight: '1.6' },
      })),
    });
  }, [fontSize]);

  const handleSave = () => saveFileRef.current?.();
  const handleClose = () => {
    if (dirty && !confirm('文件已修改但未保存，确定关闭？')) return;
    onClose();
  };

  if (error) {
    return (
      <div className="file-editor">
        <div className="file-editor-error">{error}</div>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="file-editor">
        <div className="file-editor-loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="file-editor">
      {dirty && (
        <div className="file-editor-bar">
          <span className="file-editor-name">
            <span className="file-editor-dirty">●</span>
            未保存
          </span>
          <div className="file-editor-actions">
            <button className="btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
      <div className="file-editor-content" ref={editorRef} />
    </div>
  );
}
