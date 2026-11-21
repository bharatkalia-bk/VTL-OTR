import path from 'node:path';
import { fileURLToPath as __f2p } from 'node:url';
const __dirname = path.dirname(__f2p(import.meta.url));
import { defineConfig, devices } from '@playwright/test';


const API_PORT = 4100;
const WEB_PORT = 5175;
const root = path.resolve(__dirname, '../..');
const fakeVideo = path.resolve(__dirname, 'e2e/fixtures/face.y4m');
export const E2E_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  PUBLIC_API_URL: `http://localhost:${WEB_PORT}`,
  CANDIDATE_WEB_URL: `http://localhost:${WEB_PORT}`,
  CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://vtl:vtl@localhost:5432/vtl_otr_e2e?schema=public',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/5',
  REDIS_PREFIX: 'vtle2e',
  JWT_ACCESS_SECRET: 'e2e-access-secret-e2e-access-secret-000001',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-e2e-refresh-secret-0001',
  PII_ENC_KEY: Buffer.alloc(32, 3).toString('base64'),
  PII_INDEX_KEY: Buffer.alloc(32, 5).toString('base64'),
  FILE_URL_SECRET: 'e2e-file-url-secret-e2e-file-url-secret-01',
  STORAGE_DRIVER: 'fs',
  STORAGE_FS_ROOT: '/tmp/vtl-otr-e2e-storage',
  DEV_EXPOSE_SECRETS: 'true',
  QUEUE_INLINE: 'true',
  SWAGGER_ENABLED: 'false',
  EMAIL_DRIVER: 'mock',
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'off',
    acceptDownloads: true,
    permissions: ['camera'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${fakeVideo}`] },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    { name: 'mobile-360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, isMobile: false }, testMatch: /mobile/ },
  ],
  webServer: [
    { command: 'node e2e/start-api.mjs', url: `http://localhost:${API_PORT}/api/v1/health/live`, env: E2E_ENV, reuseExistingServer: false, timeout: 240_000 },
    { command: `npx vite --port ${WEB_PORT} --strictPort`, url: `http://localhost:${WEB_PORT}`, env: { API_URL: `http://localhost:${API_PORT}` }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
