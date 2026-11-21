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
  server: {
    port: 5174,
    host: '0.0.0.0',
    allowedHosts: ['localhost', '.app.github.dev'],
    proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:4000', changeOrigin: false } },
  },
  preview: { host: '0.0.0.0', allowedHosts: ['localhost', '.app.github.dev'], port: 5174, proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:4000' } } },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
    },
  },
});
