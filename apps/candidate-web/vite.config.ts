import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@vtl\/shared$/, replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
      { find: /^@vtl\/ui$/, replacement: path.resolve(__dirname, '../../packages/ui/src/index.ts') },
    ],
  },
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['localhost', '.app.github.dev'],
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { host: true, allowedHosts: ['localhost', '.app.github.dev'], port: 5173, proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000' } } },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], query: ['@tanstack/react-query', 'react-hook-form', 'zod'], i18n: ['i18next', 'react-i18next'] } },
    },
  },
});
