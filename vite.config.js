import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Remove crossorigin attribute for Electron file:// compatibility
function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '');
    },
  };
}

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react(), removeCrossorigin()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
