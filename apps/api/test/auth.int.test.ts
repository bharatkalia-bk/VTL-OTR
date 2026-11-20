import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { isValidOtrId } from '@vtl/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrap, captcha, Client, devOtp, identity, registerCandidate, resetDb } from './helpers';

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

describe('candidate registration & auth', () => {
  it('registers with mobile + email OTP, stores PII encrypted, records consent', async () => {
    const { c, id } = await registerCandidate(app);
    const me = await c.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.name).toBe(id.fullName.toUpperCase());
    const row = await prisma.candidate.findFirstOrThrow({ include: { consents: true, profile: true } });
    expect(row.mobileEnc).not.toContain(id.mobile);
    expect(row.emailEnc).not.toContain(id.email);
    expect(row.profile!.fullNameEnc).toMatch(/^v1\./);
    expect(row.consents.map((x) => x.purposeCode).sort()).toEqual(['EXAM_APPLICATION_PROCESSING', 'OTR_REGISTRATION']);
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects duplicate mobile, email and identity (name + DOB + father)', async () => {
    const { id } = await registerCandidate(app);
    const c = await new Client(app).init();
    const base = identity();
    let r = await c.post('/api/v1/auth/register/start', { ...base, mobile: id.mobile, consent: true, ...(await captcha(c)) });
    expect(r.body.code).toBe('MOBILE_EXISTS');
    r = await c.post('/api/v1/auth/register/start', { ...base, email: id.email, consent: true, ...(await captcha(c)) });
    expect(r.body.code).toBe('EMAIL_EXISTS');
    r = await c.post('/api/v1/auth/register/start', { ...base, fullName: `shri ${id.fullName.toLowerCase()}`, fatherName: id.fatherName, dob: id.dob, consent: true, ...(await captcha(c)) });
    expect(r.body.code).toBe('IDENTITY_EXISTS');
  });

  it('rejects wrong captcha, wrong OTP and validates input', async () => {
    const c = await new Client(app).init();
    const id = identity();
    let r = await c.post('/api/v1/auth/register/start', { ...id, consent: true, captchaId: (await captcha(c)).captchaId, captchaText: 'zzzzz' });
    expect(r.body.code).toBe('CAPTCHA_INVALID');
    r = await c.post('/api/v1/auth/register/start', { ...id, mobile: '12345', consent: true, ...(await captcha(c)) });
    expect(r.status).toBe(400);
    expect(r.body.issues.some((i: { path: string }) => i.path === 'mobile')).toBe(true);
    r = await c.post('/api/v1/auth/register/start', { ...id, consent: true, ...(await captcha(c)) });
    const v = await c.post('/api/v1/auth/register/verify', { registrationId: r.body.registrationId, mobileOtp: '000000', emailOtp: await devOtp(c, id.email) });
    expect(v.body.code).toBe('OTP_INVALID');
    expect(v.body.channels).toEqual(['mobile']);
  });

  it('enforces CSRF on mutating requests', async () => {
    const c = await new Client(app).init();
    const r = await c.agent.post('/api/v1/auth/login').send({ identifier: 'x', password: 'y' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CSRF');
  });

  it('locks the account after 5 failed logins and gives generic errors', async () => {
    const { id } = await registerCandidate(app);
    const c = await new Client(app).init();
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/api/v1/auth/login', { identifier: id.mobile, password: 'Wrong@123', ...(await captcha(c)) });
      expect(r.body.code).toBe('INVALID_CREDENTIALS');
    }
    const r = await c.post('/api/v1/auth/login', { identifier: id.mobile, password: 'Secret@123', ...(await captcha(c)) });
    expect(r.body.code).toBe('ACCOUNT_LOCKED');
    const unknown = await c.post('/api/v1/auth/login', { identifier: '9999999999', password: 'Secret@123', ...(await captcha(c)) });
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { c } = await registerCandidate(app);
    const rt1 = (await prisma.refreshToken.findMany({ orderBy: { createdAt: 'desc' }, take: 1 }))[0]!;
    const cookieJar = c.agent.jar.getCookies({ domain: '127.0.0.1', path: '/api/v1/auth', secure: false, script: false } as never);
    const oldRefresh = cookieJar.find((x: { name: string }) => x.name === 'vtl_rt')?.value;
    const r = await c.post('/api/v1/auth/refresh');
    expect(r.status).toBe(200);
    // replay the old token from a different client
    const attacker = await new Client(app).init();
    const replay = await attacker.agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', attacker.csrf).set('Cookie', `vtl_rt=${oldRefresh}; vtl_csrf=${attacker.csrf}`);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('SESSION_REVOKED');
    const family = await prisma.refreshToken.findMany({ where: { familyId: rt1.familyId } });
    expect(family.every((t) => t.revokedAt)).toBe(true);
  });

  it('supports OTP login and password reset', async () => {
    const { id } = await registerCandidate(app);
    const c = await new Client(app).init();
    const req = await c.post('/api/v1/auth/login/otp/request', { identifier: id.email, ...(await captcha(c)) });
    expect(req.body.sentTo).toMatch(/\*\*\*/);
    const ok = await c.post('/api/v1/auth/login/otp/verify', { challengeId: req.body.challengeId, otp: await devOtp(c, id.email) });
    expect(ok.status).toBe(200);
    const c2 = await new Client(app).init();
    const fr = await c2.post('/api/v1/auth/forgot/password/request', { identifier: id.mobile, ...(await captcha(c2)) });
    const reset = await c2.post('/api/v1/auth/forgot/password/reset', { challengeId: fr.body.challengeId, otp: await devOtp(c2, id.mobile), password: 'NewPass@456', confirmPassword: 'NewPass@456' });
    expect(reset.status).toBe(200);
    const login = await c2.post('/api/v1/auth/login', { identifier: id.mobile, password: 'NewPass@456', ...(await captcha(c2)) });
    expect(login.status).toBe(200);
  });

  it('returns generic response for unknown identifiers (no enumeration)', async () => {
    const c = await new Client(app).init();
    const r = await c.post('/api/v1/auth/login/otp/request', { identifier: '9123456789', ...(await captcha(c)) });
    expect(r.status).toBe(200);
    expect(r.body.challengeId).toBeTruthy();
    void isValidOtrId;
  });
});
