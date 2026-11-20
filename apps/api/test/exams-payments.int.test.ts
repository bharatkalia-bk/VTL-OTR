import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signPayload } from '../src/integrations/payment';
import { bootstrap, Client, completeProfile, createExam, registerCandidate, resetDb } from './helpers';

let app: NestExpressApplication;
let prisma: PrismaClient;
let redis: Redis;
let exam: Awaited<ReturnType<typeof createExam>>;

beforeAll(async () => {
  ({ app, prisma, redis } = await bootstrap());
  await resetDb(prisma, redis);
  exam = await createExam(prisma);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  redis.disconnect();
});

async function submittedCandidate(opts: Parameters<typeof completeProfile>[1] = {}, reg: Parameters<typeof registerCandidate>[1] = {}) {
  const { c } = await registerCandidate(app, reg);
  await completeProfile(c, opts);
  const s = await c.post('/api/v1/me/submit');
  if (s.status !== 200) throw new Error(JSON.stringify(s.body));
  return c;
}
const gradPost = () => exam.posts.find((p) => p.code === 'GRAD')!.id;
const pgPost = () => exam.posts.find((p) => p.code === 'PG')!.id;

describe('exams, eligibility and applications', () => {
  it('requires a submitted OTR', async () => {
    const { c } = await registerCandidate(app);
    const r = await c.post('/api/v1/applications', { examId: exam.id, postIds: [gradPost()], centreCityIds: [exam.centreCities[0]!.id], customFieldValues: { medium: 'EN' } });
    expect(r.body.code).toBe('OTR_REQUIRED');
  });

  it('auto-checks eligibility per post with reasons', async () => {
    const c = await submittedCandidate();
    const list = await c.get('/api/v1/exams');
    const e = list.body.find((x: { id: string }) => x.id === exam.id);
    const grad = e.posts.find((p: { code: string }) => p.code === 'GRAD');
    const pg = e.posts.find((p: { code: string }) => p.code === 'PG');
    expect(grad.eligibility.eligible).toBe(true);
    expect(pg.eligibility.eligible).toBe(false);
    expect(pg.eligibility.criteria.find((x: { code: string }) => x.code === 'QUALIFICATION').reasonKey).toBe('eligibility.qualification.missing');
    expect(e.fee).toEqual({ amount: 100, exempt: false, ruleLabel: 'General/EWS/OBC' });
    const bad = await c.post('/api/v1/applications', { examId: exam.id, postIds: [pgPost()], centreCityIds: [exam.centreCities[0]!.id], customFieldValues: { medium: 'EN' } });
    expect(bad.body.code).toBe('NOT_ELIGIBLE');
    const missingCustom = await c.post('/api/v1/applications', { examId: exam.id, postIds: [gradPost()], centreCityIds: [exam.centreCities[0]!.id], customFieldValues: {} });
    expect(missingCustom.body.code).toBe('VALIDATION_FAILED');
  }, 60000);

  it('applies category age relaxation (SC candidate aged 30 is eligible, GEN is not)', async () => {
    const gen = await submittedCandidate({}, { dob: '1996-06-01' });
    const sc = await submittedCandidate({ category: 'SC' }, { dob: '1996-06-01', fullName: 'Other Person Sc', fatherName: 'Another Father' });
    const g = (await gen.get(`/api/v1/exams/${exam.id}`)).body.posts.find((p: { code: string }) => p.code === 'GRAD');
    const s = (await sc.get(`/api/v1/exams/${exam.id}`)).body.posts.find((p: { code: string }) => p.code === 'GRAD');
    expect(g.eligibility.eligible).toBe(false);
    expect(s.eligibility.eligible).toBe(true);
    expect(s.eligibility.upperAgeLimit).toBe(32);
    expect((await sc.get(`/api/v1/exams/${exam.id}`)).body.fee.amount).toBe(0);
  }, 60000);
});

describe('payments', () => {
  async function pendingApp() {
    const c = await submittedCandidate();
    const d = await c.post('/api/v1/applications', { examId: exam.id, postIds: [gradPost()], centreCityIds: [exam.centreCities[1]!.id], customFieldValues: { medium: 'EN' } });
    const s = await c.post(`/api/v1/applications/${d.body.id}/submit`);
    expect(s.body.status).toBe('PAYMENT_PENDING');
    return { c, appId: d.body.id as string };
  }

  it('success via signed callback; replays are idempotent; receipt PDF available', async () => {
    const { c, appId } = await pendingApp();
    const init = await c.post(`/api/v1/applications/${appId}/payments`);
    expect(init.body.redirectUrl).toContain('/mock-gateway/pay/');
    const page = await c.get(`/api/v1/mock-gateway/pay/${init.body.merchantTxnId}`);
    expect(page.text).toContain('Mock Payment Gateway');
    const done = await c.agent.post('/api/v1/mock-gateway/complete').type('form').send({ txn: init.body.merchantTxnId, outcome: 'SUCCESS' });
    expect(done.status).toBe(303);
    const app1 = await c.get(`/api/v1/applications/${appId}`);
    expect(app1.body.status).toBe('PAID');
    // replay the S2S callback with identical payload: no state change, no duplicate events
    const pay = await prisma.payment.findUniqueOrThrow({ where: { merchantTxnId: init.body.merchantTxnId } });
    const fields = { merchantTxnId: pay.merchantTxnId, gatewayTxnId: pay.gatewayTxnId!, status: 'SUCCESS', amount: pay.amount };
    const body = { ...fields, signature: signPayload('mock-gateway-webhook-secret', fields) };
    for (let i = 0; i < 3; i++) expect((await new Client(app).agent.post('/api/v1/payments/callback/mock').send(body)).body.status).toBe('SUCCESS');
    const events = await prisma.paymentEvent.count({ where: { paymentId: pay.id, source: 'CALLBACK' } });
    expect(events).toBe(1);
    const appEvents = await prisma.applicationEvent.count({ where: { applicationId: appId, status: 'PAID' } });
    expect(appEvents).toBe(1);
    const receipt = await c.get(`/api/v1/payments/${pay.id}/receipt.pdf`);
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toBe('application/pdf');
    expect((await c.post(`/api/v1/applications/${appId}/payments`)).body.code).toBe('PAYMENT_NOT_DUE');
  }, 60000);

  it('rejects tampered callbacks and amount mismatches', async () => {
    const { c, appId } = await pendingApp();
    const init = await c.post(`/api/v1/applications/${appId}/payments`);
    const fields = { merchantTxnId: init.body.merchantTxnId, gatewayTxnId: 'X1', status: 'SUCCESS', amount: 100 };
    const forged = await new Client(app).agent.post('/api/v1/payments/callback/mock').send({ ...fields, signature: 'deadbeef' });
    expect(forged.body.code).toBe('INVALID_SIGNATURE');
    const wrongAmt = { ...fields, amount: 1 };
    const r = await new Client(app).agent.post('/api/v1/payments/callback/mock').send({ ...wrongAmt, signature: signPayload('mock-gateway-webhook-secret', wrongAmt) });
    expect(r.body.status).toBe('FAILED');
    expect((await c.get(`/api/v1/applications/${appId}`)).body.status).toBe('PAYMENT_PENDING');
  }, 60000);

  it('failure then retry; pending resolved by reconciliation', async () => {
    const { c, appId } = await pendingApp();
    const a = await c.post(`/api/v1/applications/${appId}/payments`);
    await c.agent.post('/api/v1/mock-gateway/complete').type('form').send({ txn: a.body.merchantTxnId, outcome: 'FAILED' });
    expect((await c.get(`/api/v1/payments/by-txn/${a.body.merchantTxnId}`)).body.status).toBe('FAILED');
    const b = await c.post(`/api/v1/applications/${appId}/payments`);
    await c.agent.post('/api/v1/mock-gateway/complete').type('form').send({ txn: b.body.merchantTxnId, outcome: 'PENDING' });
    expect((await c.get(`/api/v1/payments/by-txn/${b.body.merchantTxnId}`)).body.status).toBe('PENDING');
    expect((await c.post(`/api/v1/applications/${appId}/payments`)).body.code).toBe('PAYMENT_PENDING');
    // make the mock bank settle now, then reconcile
    const k = `vtltest:mockpg:${b.body.merchantTxnId}`;
    const o = JSON.parse((await redis.get(k))!);
    o.resolveAt = Date.now() - 1;
    await redis.set(k, JSON.stringify(o));
    const { PaymentsService } = await import('../src/modules/payments/payments.service');
    const res = await app.get(PaymentsService).reconcile(0);
    expect(res.updated).toBeGreaterThanOrEqual(1);
    expect((await c.get(`/api/v1/applications/${appId}`)).body.status).toBe('PAID');
  }, 60000);
});
