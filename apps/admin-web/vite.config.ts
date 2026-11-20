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
    host: true,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { port: 5174, proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:4000' } } },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
    },
  },
});
