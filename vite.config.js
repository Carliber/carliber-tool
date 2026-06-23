import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react()],
  // Tauri injects its own IPC; we don't need the Electron crossorigin-stripping hack.
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    // Split heavy vendor libs into separate chunks. Tauri loads these via
    // relative file:// paths so code-splitting is cache/parsing friendly.
    rollupOptions: {
      output: {
        manualChunks: {
          // CodeMirror core + language packages (~heaviest dependency)
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/autocomplete',
            '@codemirror/search',
            '@codemirror/theme-one-dark',
          ],
          'codemirror-lang': [
            '@codemirror/lang-javascript',
            '@codemirror/lang-css',
            '@codemirror/lang-html',
            '@codemirror/lang-json',
            '@codemirror/lang-markdown',
            '@codemirror/lang-python',
          ],
          // Markdown rendering pipeline
          markdown: ['react-markdown', 'remark-gfm', 'rehype-sanitize'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
});
