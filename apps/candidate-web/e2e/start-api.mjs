// E2E API launcher: fresh database + seed, MediaPipe assets, fake-camera clip, then starts the API.
// (Playwright starts webServers before globalSetup, so preparation happens here.)
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const api = path.join(root, 'apps/api');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, env: process.env, stdio: 'inherit' });
const fixtures = path.join(here, 'fixtures');
if (!existsSync(path.join(fixtures, 'face.y4m'))) run(`python3 scripts/make_face_video.py ${fixtures}/astronaut-nasa-public-domain.png ${fixtures}/face.y4m`);
run('node scripts/fetch-mediapipe.mjs');
run('npx tsc -p tsconfig.build.json', api);
// Create the E2E database if missing, apply migrations; the seed truncates all tables itself.
const dbUrl = new URL(process.env.DATABASE_URL);
const dbName = dbUrl.pathname.slice(1);
const adminUrl = new URL(dbUrl); adminUrl.pathname = '/postgres';
const apiRequire = createRequire(path.join(api, 'package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const pg = new PrismaClient({ datasourceUrl: adminUrl.toString() });
const exists = await pg.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/[^\w]/g, '')}'`);
if (!exists.length) await pg.$executeRawUnsafe(`CREATE DATABASE "${dbName.replace(/[^\w]/g, '')}"`);
await pg.$disconnect();
run('npx prisma migrate deploy', api);
run('node dist/prisma/seed/index.js', api);
// The synthetic clip can perform a head turn but not a blink.
const db = new PrismaClient();
await db.systemSetting.upsert({ where: { key: 'livenessMethods' }, create: { key: 'livenessMethods', value: ['HEAD_TURN'] }, update: { value: ['HEAD_TURN'] } });
await db.$disconnect();
const Redis = apiRequire('ioredis');
const r = new Redis(process.env.REDIS_URL);
await r.flushdb();
await r.quit();
const child = spawn('node', ['dist/src/main.js'], { cwd: api, env: process.env, stdio: 'inherit' });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
child.on('exit', (c) => process.exit(c ?? 0));
