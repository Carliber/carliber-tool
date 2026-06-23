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
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
});
