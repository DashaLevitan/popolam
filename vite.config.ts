import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Фронт (Mini App) живёт в web/. В dev запросы /api проксируются на сервер (8787).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: { outDir: '../dist-web', emptyOutDir: true },
});
