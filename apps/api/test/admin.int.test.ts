import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_PW, adminLogin, bootstrap, Client, completeProfile, createExam, registerCandidate, resetDb, stepUp as stepUpAny, devOtp } from './helpers';

let app: NestExpressApplication;
let prisma: PrismaClient;
let redis: Redis;

beforeAll(async () => {
  ({ app, prisma, redis } = await bootstrap());
  await resetDb(prisma, redis);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

const stepUp = (c: Client, url: string, body: object = {}) => stepUpAny(c, 'post', url, body);

describe('admin auth', () => {
  it('requires the emailed code before any admin API; wrong codes are refused', async () => {
    const c = await new Client(app).init();
    const r = await c.post('/api/v1/admin/auth/login', { email: 'new@t.in', password: ADMIN_PW });
    expect(r.body).toMatchObject({ next: 'OTP_VERIFY', sentTo: expect.stringContaining('@') });
    expect((await c.get('/api/v1/admin/dashboard')).body.code).toBe('TOTP_REQUIRED');
    // challenge endpoint returns the same pending challenge instead of sending another code
    expect((await c.post('/api/v1/admin/auth/otp/challenge', {})).body.challengeId).toBe(r.body.challengeId);
    const code = await devOtp(c, 'new@t.in');
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await c.post('/api/v1/admin/auth/otp/verify', { challengeId: r.body.challengeId, code: wrong })).body.code).toBe('OTP_INVALID');
    expect((await c.post('/api/v1/admin/auth/otp/verify', { challengeId: r.body.challengeId, code })).body.totpVerified).toBe(true);
    expect((await c.get('/api/v1/admin/dashboard')).status).toBe(200);
    // refresh keeps the verified state; signing in again straight away works (no resend cooldown for staff)
    expect((await c.post('/api/v1/admin/auth/refresh')).body.totpVerified).toBe(true);
    const again = await new Client(app).init();
    expect((await again.post('/api/v1/admin/auth/login', { email: 'new@t.in', password: ADMIN_PW })).body.next).toBe('OTP_VERIFY');
  });

  it('candidate sessions cannot reach admin APIs', async () => {
    const { c } = await registerCandidate(app);
    expect((await c.get('/api/v1/admin/dashboard')).status).toBe(401);
  });
});

describe('RBAC matrix', () => {
  it.each([
    ['verifier@t.in', 'POST', '/api/v1/admin/exams', 403],
    ['helpdesk@t.in', 'GET', '/api/v1/admin/audit-logs', 403],
    ['auditor@t.in', 'GET', '/api/v1/admin/audit-logs', 200],
    ['auditor@t.in', 'POST', '/api/v1/admin/payments/reconcile', 403],
    ['exam@t.in', 'GET', '/api/v1/admin/corrections', 403],
    ['verifier@t.in', 'GET', '/api/v1/admin/corrections', 200],
    ['helpdesk@t.in', 'GET', '/api/v1/admin/tickets', 200],
    ['super@t.in', 'GET', '/api/v1/admin/audit-logs', 200],
  ])('%s %s %s -> %i', async (email, method, url, status) => {
    const c = await adminLogin(app, email);
    const r = method === 'GET' ? await c.get(url) : await c.post(url, {});
    if (status === 403) expect(r.status).toBe(403);
    else expect(r.status).toBeLessThan(400);
  });
});

describe('exam management → admit cards → candidate download → QR verify', () => {
  it('runs the full admin flow', async () => {
    const examAdmin = await adminLogin(app, 'exam@t.in');
    const created = await examAdmin.post('/api/v1/admin/exams', {
      code: 'ADM-TEST', titleEn: 'Admin Created Exam', titleHi: 'एडमिन परीक्षा', notificationNo: 'A/1', conductingBody: 'Board',
      dates: { notification: '2026-01-01', applyStart: '2026-01-01', applyEnd: '2099-01-01', feeLastDate: '2099-01-01', examDate: '2099-02-01' }, ageCutoffDate: '2027-01-01', rollNoPrefix: 'ADM',
    });
    expect(created.status).toBe(201);
    expect((await examAdmin.post(`/api/v1/admin/exams/${created.body.id}/status`, { status: 'PUBLISHED' })).body.code).toBe('INCOMPLETE_EXAM');

    // Use helper exam with capacity-1 centre in Lucknow to exercise overflow to second preference
    const exam = await createExam(prisma, { code: 'ADMIT-1' });
    const cands: Client[] = [];
    for (let i = 0; i < 2; i++) {
      const { c } = await registerCandidate(app, { gender: 'FEMALE' });
      await completeProfile(c, { gender: 'FEMALE' });
      await c.post('/api/v1/me/submit');
      const d = await c.post('/api/v1/applications', { examId: exam.id, postIds: [exam.posts.find((p) => p.code === 'GRAD')!.id], centreCityIds: [exam.centreCities[0]!.id, exam.centreCities[1]!.id], customFieldValues: { medium: 'EN' } });
      const s = await c.post(`/api/v1/applications/${d.body.id}/submit`);
      expect(s.body.status).toBe('FEE_EXEMPT');
      cands.push(c);
    }
    const alloc = await examAdmin.post(`/api/v1/admin/exams/${exam.id}/admit-cards/allocate`);
    expect(alloc.body).toMatchObject({ total: 2, placed: 2, unplaced: [] });
    const summary = await examAdmin.get(`/api/v1/admin/exams/${exam.id}/admit-cards/summary`);
    const byCode = Object.fromEntries(summary.body.centres.map((x: { code: string; allocated: number }) => [x.code, x.allocated]));
    expect(byCode).toEqual({ C1: 1, C2: 1 });
    // before release: candidate cannot download
    const appId = (await cands[0]!.get('/api/v1/applications')).body[0].id;
    expect((await cands[0]!.get(`/api/v1/applications/${appId}/admit-card.pdf`)).status).toBe(404);
    expect((await examAdmin.post(`/api/v1/admin/exams/${exam.id}/admit-cards/generate`)).body.queued).toBe(2);
    expect((await examAdmin.post(`/api/v1/admin/exams/${exam.id}/admit-cards/release`)).body.code).toBe('STEP_UP_REQUIRED');
    expect((await stepUp(examAdmin, `/api/v1/admin/exams/${exam.id}/admit-cards/release`)).body.released).toBe(2);
    const pdf = await cands[0]!.get(`/api/v1/applications/${appId}/admit-card.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const ac = await prisma.admitCard.findFirstOrThrow({ where: { applicationId: appId } });
    const verify = await new Client(app).get(`/api/v1/verify/admit/${ac.qrToken}`);
    expect(verify.body).toMatchObject({ valid: true, rollNo: ac.rollNo });
    const [body, sig] = ac.qrToken!.split('.') as [string, string];
    const valid = async (t: string) => (await new Client(app).get(`/api/v1/verify/admit/${t}`)).body.valid as boolean;
    // forged content: change the roll number inside the signed payload
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...payload, r: `${payload.r}9` })).toString('base64url');
    expect(await valid(`${forged}.${sig}`)).toBe(false);
    // corrupted signature: flip a character that carries data (not the trailing padding bits)
    const flipped = sig.slice(0, 10) + (sig[10] === 'A' ? 'B' : 'A') + sig.slice(11);
    expect(await valid(`${body}.${flipped}`)).toBe(false);
    // non-canonical encoding of the same signature (altered padding bits) is rejected too
    const last = sig.at(-1)!;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const padVariant = sig.slice(0, -1) + alphabet[alphabet.indexOf(last) ^ 1];
    expect(await valid(`${body}.${padVariant}`)).toBe(false);
  }, 120000);

  it('audit log records admin actions with decoded before/after for auditors', async () => {
    const auditor = await adminLogin(app, 'auditor@t.in');
    const r = await auditor.get('/api/v1/admin/audit-logs?action=ADMIT_RELEASED&decode=true');
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items[0].after.count).toBe(2);
    expect(r.body.items[0].actorType).toBe('ADMIN');
    // DB enforces append-only
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow();
  });

  it('candidate search uses blind indexes; reports export runs', async () => {
    const { c, id } = await registerCandidate(app, { fullName: 'Searchable Unique Name' });
    void c;
    const v = await adminLogin(app, 'verifier@t.in');
    const byMobile = await v.get(`/api/v1/admin/candidates?q=${id.mobile}`);
    expect(byMobile.body.items).toHaveLength(1);
    const byName = await v.get('/api/v1/admin/candidates?q=searchable%20unique');
    expect(byName.body.items[0].name).toBe('SEARCHABLE UNIQUE NAME');
    const ex = await adminLogin(app, 'exam@t.in');
    const rep = await stepUp(ex, '/api/v1/admin/reports', { type: 'REGISTRATIONS_BY_STATE', format: 'csv' });
    expect(rep.body.status).toBe('DONE');
    const dl = await ex.get(`/api/v1/admin/reports/${rep.body.id}/download`);
    expect(dl.body.url).toContain('/api/v1/files?');
  });
});
