import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import { isValidOtrId } from '@vtl/shared';
import type Redis from 'ioredis';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminLogin, bootstrap, captcha, Client, completeProfile, devOtp, jpeg, pdfBuf, registerCandidate, resetDb, uploadPhoto } from './helpers';

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

describe('photo & signature validation (server never trusts the client)', () => {
  it('rejects uploads without a live capture session', async () => {
    const { c } = await registerCandidate(app);
    const meta = { captureSessionId: 'forged-session-id-123', capturedAt: new Date().toISOString(), userAgent: 'x', attemptNo: 1, liveness: { passed: true, method: 'BLINK' }, scores: { faceConfidence: 0.9, centreOffset: 0, areaRatio: 0.1, luminance: 120, blurVariance: 100 } };
    const r = await c.upload('/api/v1/me/photo', 'file', await jpeg(350, 450, 20480, 51200), 'p.jpg', { meta: JSON.stringify(meta) });
    expect(r.body.code).toBe('CAPTURE_SESSION_INVALID');
  });

  it('rejects PNG renamed as JPEG, wrong dimensions, size out of range; session is single use', async () => {
    const { c } = await registerCandidate(app);
    const png = await sharp({ create: { width: 350, height: 450, channels: 3, background: '#888' } }).png().toBuffer();
    expect((await uploadPhoto(c, png)).body.code).toBe('INVALID_IMAGE_TYPE');
    expect((await uploadPhoto(c, await jpeg(400, 450, 20480, 51200))).body.code).toBe('INVALID_DIMENSIONS');
    const tiny = await sharp({ create: { width: 350, height: 450, channels: 3, background: '#888' } }).jpeg({ quality: 50 }).toBuffer();
    expect((await uploadPhoto(c, tiny)).body.code).toBe('INVALID_SIZE');
    expect((await uploadPhoto(c, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 1, 2, 3]))).body.code).toMatch(/INVALID_IMAGE/);
    const ok = await uploadPhoto(c);
    expect(ok.status).toBe(201);
  });

  it('strips EXIF and stores a SHA-256 hash', async () => {
    const { c } = await registerCandidate(app);
    const withExif = await jpeg(350, 450, 21 * 1024, 49 * 1024, true);
    const r = await uploadPhoto(c, withExif);
    expect(r.status).toBe(201);
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(asset.sizeBytes).toBeLessThan(withExif.length);
    expect(asset.method).toBe('LIVE');
  });

  it('flags the same photo used by two candidates', async () => {
    const photo = await jpeg(350, 450, 20480, 51200);
    const a = await registerCandidate(app);
    const b = await registerCandidate(app);
    await uploadPhoto(a.c, photo);
    const r = await uploadPhoto(b.c, photo);
    expect(r.body.duplicate).toBe(true);
    const flag = await prisma.duplicateFlag.findFirstOrThrow({ where: { type: 'PHOTO_HASH' } });
    expect(flag.candidateIds).toHaveLength(2);
  });

  it('enforces the retake limit', async () => {
    const { c } = await registerCandidate(app);
    const scores = { faceConfidence: 0.9, centreOffset: 0.05, areaRatio: 0.12, luminance: 130, blurVariance: 200 };
    for (let i = 1; i <= 5; i++) expect((await c.post('/api/v1/me/photo/attempts', { attemptNo: i, scores, liveness: { passed: true, method: 'BLINK' } })).status).toBe(200);
    const r = await c.post('/api/v1/me/photo/attempts', { attemptNo: 6, scores, liveness: { passed: true, method: 'BLINK' } });
    expect(r.status).toBe(429);
    expect((await c.post('/api/v1/me/photo/session')).body.code).toBe('ATTEMPTS_EXHAUSTED');
  });
});

describe('profile wizard, OTR submission and locks', () => {
  it('rejects non-PDF documents and over-size files', async () => {
    const { c } = await registerCandidate(app);
    expect((await c.upload('/api/v1/me/documents', 'file', Buffer.from('<html>hello</html>'.repeat(20)), 'x.pdf', { kind: 'EDU_CLASS_10' })).body.code).toBe('INVALID_FILE_TYPE');
    expect((await c.upload('/api/v1/me/documents', 'file', Buffer.concat([pdfBuf(), Buffer.alloc(600 * 1024)]), 'x.pdf', { kind: 'EDU_CLASS_10' })).body.code).toBe('FILE_TOO_LARGE');
  });

  it('auto-saves drafts, requires all steps, then generates a valid OTR ID and locks core fields', async () => {
    const { c } = await registerCandidate(app);
    const draft = await c.put('/api/v1/me/profile/personal', { final: false, data: { motherName: 'Draft Mother' } });
    expect(draft.status).toBe(200);
    expect(draft.body.personal.motherName).toBe('DRAFT MOTHER');
    expect((await c.post('/api/v1/me/submit')).body.code).toBe('INCOMPLETE');
    await completeProfile(c);
    const s = await c.post('/api/v1/me/submit');
    expect(s.status).toBe(200);
    expect(isValidOtrId(s.body.otrId)).toBe(true);
    expect((await c.post('/api/v1/me/submit')).body.code).toBe('ALREADY_SUBMITTED');
    // locked
    expect((await c.put('/api/v1/me/profile/personal', { final: false, data: { fullName: 'Changed Name' } })).body.code).toBe('LOCKED');
    expect((await c.post('/api/v1/me/photo/session')).body.code).toBe('LOCKED');
    // slip PDF generated
    const slip = await c.get('/api/v1/me/otr-slip.pdf').buffer(true).parse((res, cb) => { const ch: Buffer[] = []; res.on('data', (d: Buffer) => ch.push(d)); res.on('end', () => cb(null, Buffer.concat(ch))); });
    expect(slip.status).toBe(200);
    expect((slip.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    // audit trail exists
    const audit = await prisma.auditLog.findMany({ where: { action: 'OTR_SUBMITTED' } });
    expect(audit.length).toBeGreaterThan(0);
  }, 60000);

  it('correction request flow: candidate requests, verifier approves with step-up TOTP, value changes', async () => {
    const { c } = await registerCandidate(app);
    await completeProfile(c);
    await c.post('/api/v1/me/submit');
    const proof = (await c.upload('/api/v1/me/documents', 'file', pdfBuf(), 'proof.pdf', { kind: 'CORRECTION_PROOF' })).body.id;
    const cr = await c.post('/api/v1/me/corrections', { field: 'FATHER_NAME', requestedValue: 'Corrected Father', reason: 'Spelling differs from Class 10 certificate', documentId: proof });
    expect(cr.status).toBe(201);
    expect((await c.post('/api/v1/me/corrections', { field: 'FATHER_NAME', requestedValue: 'Again', reason: 'Duplicate request test', documentId: proof })).body.code).toBe('ALREADY_PENDING');
    const v = await adminLogin(app, 'verifier@t.in');
    const noStep = await v.post(`/api/v1/admin/corrections/${cr.body.id}/approve`, {});
    expect(noStep.body.code).toBe('STEP_UP_REQUIRED');
    const { authenticator } = await import('otplib');
    const ok = await v.agent.post(`/api/v1/admin/corrections/${cr.body.id}/approve`).set('X-CSRF-Token', v.csrf).set('X-TOTP-Code', authenticator.generate('KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD')).send({});
    expect(ok.body.status).toBe('APPROVED');
    const me = await c.get('/api/v1/me/profile');
    expect(me.body.personal.fatherName).toBe('CORRECTED FATHER');
  }, 60000);

  it('contact change requires OTP on registered mobile and new email', async () => {
    const { c, id } = await registerCandidate(app);
    await completeProfile(c);
    await c.post('/api/v1/me/submit');
    const r = await c.post('/api/v1/me/contact/change/request', { email: 'new.address@example.in' });
    expect(r.body.channels).toEqual(['mobile', 'email']);
    const bad = await c.post('/api/v1/me/contact/change/verify', { challengeId: r.body.challengeId, mobileOtp: '000000', emailOtp: await devOtp(c, 'new.address@example.in') });
    expect(bad.body.code).toBe('OTP_INVALID');
    const ok = await c.post('/api/v1/me/contact/change/verify', { challengeId: r.body.challengeId, mobileOtp: await devOtp(c, id.mobile), emailOtp: await devOtp(c, 'new.address@example.in') });
    expect(ok.body.email).toBe('new.address@example.in');
    void captcha; void Client;
  }, 60000);
});
