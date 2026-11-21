import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_FEE_RULES } from '@vtl/shared';
import Redis from 'ioredis';
import { authenticator } from 'otplib';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/main';
import { FieldCrypto } from '../src/security/field-crypto';
import { hashPassword } from '../src/security/password';

export const TOTP_SECRET = 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD';
export const ADMIN_PW = 'Admin@12345';

export class Client {
  agent: ReturnType<typeof request.agent>;
  csrf = '';
  constructor(app: NestExpressApplication) {
    this.agent = request.agent(app.getHttpServer());
  }
  async init() {
    const r = await this.agent.get('/api/v1/auth/csrf');
    this.csrf = r.body.csrfToken;
    return this;
  }
  get(url: string) { return this.agent.get(url); }
  post(url: string, body?: object) { return this.agent.post(url).set('X-CSRF-Token', this.csrf).send(body ?? {}); }
  put(url: string, body?: object) { return this.agent.put(url).set('X-CSRF-Token', this.csrf).send(body ?? {}); }
  del(url: string) { return this.agent.delete(url).set('X-CSRF-Token', this.csrf); }
  upload(url: string, field: string, buf: Buffer, filename: string, fields: Record<string, string> = {}) {
    let r = this.agent.post(url).set('X-CSRF-Token', this.csrf);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach(field, buf, filename);
  }
}

export async function bootstrap() {
  const app = await createApp();
  await app.init();
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL!);
  return { app, prisma, redis };
}

export async function resetDb(prisma: PrismaClient, redis: Redis) {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await redis.flushdb();
  await prisma.state.create({ data: { code: 'UP', nameEn: 'Uttar Pradesh', nameHi: 'उत्तर प्रदेश', districts: { create: [{ name: 'Lucknow' }] } } });
  await prisma.state.create({ data: { code: 'DL', nameEn: 'Delhi', nameHi: 'दिल्ली', districts: { create: [{ name: 'New Delhi' }] } } });
  const crypto = new FieldCrypto(process.env.PII_ENC_KEY!, process.env.PII_INDEX_KEY!);
  const pw = await hashPassword(ADMIN_PW);
  for (const [email, roles] of [['super@t.in', ['SUPER_ADMIN']], ['exam@t.in', ['EXAM_ADMIN']], ['verifier@t.in', ['VERIFIER']], ['helpdesk@t.in', ['HELPDESK_AGENT']], ['auditor@t.in', ['AUDITOR']]] as const) {
    await prisma.adminUser.create({ data: { name: email, email, roles: [...roles], passwordHash: pw, totpSecretEnc: crypto.encrypt(TOTP_SECRET), totpEnrolledAt: new Date() } });
  }
  await prisma.adminUser.create({ data: { name: 'new', email: 'new@t.in', roles: ['VERIFIER'], passwordHash: pw } });
  for (const [email, roles, name] of [['exam2@t.in', ['EXAM_ADMIN'], 'Second Exam Admin'], ['centre@t.in', ['CENTRE_SUPERINTENDENT'], 'Centre Supdt'], ['observer@t.in', ['OBSERVER'], 'Observer Verma'], ['agency@t.in', ['AGENCY'], 'Agency Ops'], ['panel@t.in', ['INTERVIEW_PANEL'], 'Panel Member']] as const) {
    await prisma.adminUser.create({ data: { name, email, roles: [...roles], passwordHash: pw, totpSecretEnc: crypto.encrypt(TOTP_SECRET), totpEnrolledAt: new Date() } });
  }
}

export async function createExam(prisma: PrismaClient, opts: { code?: string; applyEnd?: string; genders?: string[] } = {}) {
  return prisma.exam.create({
    data: {
      code: opts.code ?? 'TEST-CGL', titleEn: 'Test Graduate Exam', titleHi: 'परीक्षा', notificationNo: 'T/1', conductingBody: 'Test Board', status: 'PUBLISHED', ageCutoffDate: '2027-01-01', rollNoPrefix: 'TST',
      dates: { notification: '2026-01-01', applyStart: '2026-01-01', applyEnd: opts.applyEnd ?? '2099-12-31', feeLastDate: '2099-12-31', examDate: '2099-12-31' },
      customFields: [{ key: 'medium', labelEn: 'Medium', labelHi: 'माध्यम', type: 'select', required: true, options: [{ value: 'EN', labelEn: 'English', labelHi: 'अंग्रेज़ी' }] }],
      posts: { create: [
        { code: 'GRAD', titleEn: 'Graduate post', titleHi: 'स्नातक पद', eligibility: { age: { min: 18, max: 27, categoryRelaxation: { OBC_NCL: 3, SC: 5, ST: 5 } }, qualification: { minLevel: 'GRADUATION' }, ...(opts.genders && { genders: opts.genders }) } },
        { code: 'PG', titleEn: 'PG post', titleHi: 'पीजी पद', eligibility: { age: { min: 18, max: 27 }, qualification: { minLevel: 'PG' } } },
      ] },
      feeRules: { create: DEFAULT_FEE_RULES.map((r) => ({ priority: r.priority, label: r.label, amount: r.amount, conditions: r.conditions })) },
      centreCities: { create: [{ cityName: 'Lucknow', stateCode: 'UP', centres: { create: [{ code: 'C1', name: 'Centre One', address: 'Hazratganj, Lucknow', capacity: 1, reportingTime: '08:30', gateClosingTime: '09:30' }] } }, { cityName: 'Delhi', stateCode: 'DL', centres: { create: [{ code: 'C2', name: 'Centre Two', address: 'ITO, Delhi', capacity: 5, reportingTime: '08:30', gateClosingTime: '09:30' }] } }] },
    },
    include: { posts: true, centreCities: true },
  });
}

export async function devOtp(c: Client, target: string): Promise<string> {
  return (await c.get(`/api/v1/dev/otp?target=${encodeURIComponent(target)}`)).body.otp;
}
export async function captcha(c: Client) {
  const r = await c.get('/api/v1/captcha');
  const t = await c.get(`/api/v1/dev/captcha/${r.body.captchaId}`);
  return { captchaId: r.body.captchaId as string, captchaText: t.body.text as string };
}

let counter = 0;
export function identity(overrides: Partial<{ fullName: string; fatherName: string; dob: string; gender: string; mobile: string; email: string }> = {}) {
  counter++;
  const n = String(Date.now() % 100000).padStart(5, '0') + String(counter).padStart(2, '0');
  return { fullName: `Test Person ${String.fromCharCode(65 + (counter % 26))}${String.fromCharCode(65 + ((counter * 7) % 26))}`, fatherName: 'Father Name', dob: '2001-04-15', gender: 'MALE', mobile: `9${n.slice(0, 9).padEnd(9, '1')}`, email: `t${n}@example.in`, ...overrides };
}

/** Register + verify + set password, returning a logged-in client. */
export async function registerCandidate(app: NestExpressApplication, overrides: Parameters<typeof identity>[0] = {}) {
  const c = await new Client(app).init();
  const id = identity(overrides);
  const start = await c.post('/api/v1/auth/register/start', { ...id, consent: true, language: 'en', ...(await captcha(c)) });
  if (start.status !== 200) throw new Error(`register start ${start.status} ${JSON.stringify(start.body)}`);
  const v = await c.post('/api/v1/auth/register/verify', { registrationId: start.body.registrationId, mobileOtp: await devOtp(c, id.mobile), emailOtp: await devOtp(c, id.email) });
  if (v.status !== 200) throw new Error(`verify ${v.status} ${JSON.stringify(v.body)}`);
  const p = await c.post('/api/v1/auth/register/password', { registrationToken: v.body.registrationToken, password: 'Secret@123', confirmPassword: 'Secret@123' });
  if (p.status !== 200) throw new Error(`password ${p.status}`);
  return { c, id };
}

export async function adminLogin(app: NestExpressApplication, email: string) {
  const c = await new Client(app).init();
  const r = await c.post('/api/v1/admin/auth/login', { email, password: ADMIN_PW });
  if (r.status !== 200) throw new Error(`admin login ${r.status}`);
  const v = await c.post('/api/v1/admin/auth/totp/verify', { code: authenticator.generate(TOTP_SECRET) });
  if (v.status !== 200) throw new Error(`totp ${v.status} ${JSON.stringify(v.body)}`);
  return c;
}

export const pdfBuf = () => Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n' + ' '.repeat(200));

let jpegSeed = 1;
export async function jpeg(width: number, height: number, targetMin: number, targetMax: number, exif = false): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let s = 12345 + jpegSeed++ * 7919;
  for (const amp of [90, 160, 255]) {
    for (let i = 0; i < raw.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; raw[i] = 128 - amp / 2 + (s % amp); }
    for (let q = 100; q >= 5; q -= 3) {
      let img = sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: q, chromaSubsampling: '4:4:4' });
      if (exif) img = img.withMetadata({ exif: { IFD0: { Software: 'CameraX', Copyright: 'x'.repeat(200) } } });
      const b = await img.toBuffer();
      if (b.length <= targetMax && b.length >= targetMin) return b;
    }
  }
  throw new Error(`could not make jpeg ${width}x${height} in range`);
}

/** Completes every wizard step through the API (photo via capture session). */
export async function completeProfile(c: Client, opts: { gender?: string; category?: string; stateCode?: string; withGraduation?: boolean } = {}) {
  const prisma = new PrismaClient();
  const district = await prisma.district.findFirstOrThrow({ where: { stateCode: opts.stateCode ?? 'UP' } });
  await prisma.$disconnect();
  const doc = async (kind: string) => (await c.upload('/api/v1/me/documents', 'file', pdfBuf(), 'cert.pdf', { kind })).body.id as string;
  const me = (await c.get('/api/v1/me/profile')).body;
  let r = await c.put('/api/v1/me/profile/personal', { final: true, data: { fullName: me.personal.fullName, fatherName: me.personal.fatherName, motherName: 'Mother Name', dob: me.personal.dob, gender: opts.gender ?? me.personal.gender, nationality: 'INDIAN', maritalStatus: 'UNMARRIED', identificationMark1: 'Mole on left hand' } });
  if (r.status !== 200) throw new Error(`personal ${JSON.stringify(r.body)}`);
  const category = opts.category ?? 'GEN';
  r = await c.put('/api/v1/me/profile/category', { final: true, data: { category, pwd: false, exServiceman: false, domicileStateCode: opts.stateCode ?? 'UP', categoryCertDocId: category === 'GEN' ? null : await doc('CATEGORY_CERT') } });
  if (r.status !== 200) throw new Error(`category ${JSON.stringify(r.body)}`);
  r = await c.put('/api/v1/me/profile/address', { final: true, data: { permanent: { line1: '12 MG Road', city: 'Lucknow', stateCode: opts.stateCode ?? 'UP', districtId: district.id, pin: '226001' }, correspondenceSameAsPermanent: true } });
  if (r.status !== 200) throw new Error(`address ${JSON.stringify(r.body)}`);
  const entries = [{ level: 'CLASS_10', qualificationName: 'Secondary', boardOrUniversity: 'CBSE', yearOfPassing: 2016, status: 'PASSED', resultType: 'PERCENT', marks: 82, documentId: await doc('EDU_CLASS_10') }];
  if (opts.withGraduation !== false) entries.push({ level: 'GRADUATION', qualificationName: 'B.Sc.', boardOrUniversity: 'University of Lucknow', yearOfPassing: 2022, status: 'PASSED', resultType: 'PERCENT', marks: 68, documentId: await doc('EDU_GRADUATION') });
  r = await c.put('/api/v1/me/profile/education', { final: true, data: { entries } });
  if (r.status !== 200) throw new Error(`education ${JSON.stringify(r.body)}`);
  await uploadPhoto(c);
  await uploadSignature(c);
  r = await c.put('/api/v1/me/profile/declaration', { agreeTruth: true, agreeConsent: true, place: 'Lucknow' });
  if (r.status !== 200) throw new Error(`declaration ${JSON.stringify(r.body)}`);
}

export async function uploadPhoto(c: Client, photo?: Buffer) {
  const s = await c.post('/api/v1/me/photo/session');
  if (s.status !== 200) throw new Error(`session ${JSON.stringify(s.body)}`);
  const meta = { captureSessionId: s.body.captureSessionId, capturedAt: new Date().toISOString(), userAgent: 'test', attemptNo: 1, liveness: { passed: true, method: 'BLINK' }, scores: { faceConfidence: 0.9, centreOffset: 0.05, areaRatio: 0.12, luminance: 130, blurVariance: 200 } };
  await c.post('/api/v1/me/photo/attempts', { attemptNo: 1, scores: meta.scores, liveness: meta.liveness });
  return c.upload('/api/v1/me/photo', 'file', photo ?? (await jpeg(350, 450, 20 * 1024, 50 * 1024)), 'photo.jpg', { meta: JSON.stringify(meta) });
}
export async function uploadSignature(c: Client) {
  return c.upload('/api/v1/me/signature', 'file', await jpeg(140, 60, 10 * 1024, 20 * 1024), 'sig.jpg', { method: 'DRAWN' });
}
