import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminLogin, bootstrap, Client, completeProfile, createExam, registerCandidate, resetDb, TOTP_SECRET } from './helpers';

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

const stepUp = (c: Client, method: 'post' | 'put', url: string, body: object = {}) => c.agent[method](url).set('X-CSRF-Token', c.csrf).set('X-TOTP-Code', authenticator.generate(TOTP_SECRET)).send(body);
const KEY: Record<string, string[]> = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), ['A']]));

describe('full exam lifecycle: exam day → assessment → results → selection', () => {
  it('runs every stage with role scoping, maker-checker and idempotent gateways', async () => {
    // ── Setup: exam with written + interview (80:20), four applicants ──
    const exam = await createExam(prisma, { code: 'LIFE-1' });
    await prisma.exam.update({ where: { id: exam.id }, data: { stages: ['TIER1', 'INTERVIEW'], writtenWeight: 80, interviewWeight: 20, objectionFee: 100 } });
    const grad = exam.posts.find((p) => p.code === 'GRAD')!;
    const cands: Array<{ c: Client; appId: string }> = [];
    for (let i = 0; i < 4; i++) {
      const { c } = await registerCandidate(app, { gender: 'FEMALE', fullName: `Life Candidate ${'ABCD'[i]}` });
      await completeProfile(c, { gender: 'FEMALE' });
      await c.post('/api/v1/me/submit');
      const d = await c.post('/api/v1/applications', { examId: exam.id, postIds: [grad.id], centreCityIds: [exam.centreCities[0]!.id, exam.centreCities[1]!.id], customFieldValues: { medium: 'EN' } });
      await c.post(`/api/v1/applications/${d.body.id}/submit`);
      cands.push({ c, appId: d.body.id });
    }
    const ex = await adminLogin(app, 'exam@t.in');
    const ex2 = await adminLogin(app, 'exam2@t.in');
    const sup = await adminLogin(app, 'super@t.in');
    expect((await ex.post(`/api/v1/admin/exams/${exam.id}/admit-cards/allocate`)).body.placed).toBe(4);
    const s1 = await ex.post(`/api/v1/admin/exams/${exam.id}/shifts`, { code: 'S1', date: '2099-03-01', startTime: '09:00', endTime: '11:00', mode: 'CBT' });
    const s2 = await ex.post(`/api/v1/admin/exams/${exam.id}/shifts`, { code: 'S2', date: '2099-03-01', startTime: '14:00', endTime: '16:00', mode: 'OMR' });
    expect(s2.status).toBe(201);
    expect((await ex.post(`/api/v1/admin/exams/${exam.id}/shifts/assign`, {})).body.assigned).toBe(4);
    await ex.post(`/api/v1/admin/exams/${exam.id}/admit-cards/generate`);
    await stepUp(ex, 'post', `/api/v1/admin/exams/${exam.id}/admit-cards/release`);
    const cards = await prisma.admitCard.findMany({ where: { examId: exam.id }, include: { centre: true }, orderBy: { rollNo: 'asc' } });
    const c2 = cards.find((c) => c.centre?.code === 'C2')!;
    const c1 = cards.find((c) => c.centre?.code === 'C1')!;

    // ── Centre desk: scoped QR scan, duplicate entry, tampered QR ──
    await prisma.adminUser.update({ where: { email: 'centre@t.in' }, data: { scope: { centreIds: [c2.centreId] } } });
    const desk = await adminLogin(app, 'centre@t.in');
    expect((await desk.post('/api/v1/admin/centre/lookup', { rollNo: c1.rollNo, examId: exam.id })).body.code).toBe('OUT_OF_SCOPE');
    const look = await desk.post('/api/v1/admin/centre/lookup', { token: `https://x/verify/${c2.qrToken}` });
    expect(look.body).toMatchObject({ rollNo: c2.rollNo, qrValid: true, debarred: null });
    expect(look.body.candidate.photo).toBeTruthy();
    expect((await desk.post('/api/v1/admin/centre/attendance', { token: c2.qrToken, faceCheck: 'MATCH' })).body.status).toBe('PRESENT');
    expect((await desk.post('/api/v1/admin/centre/attendance', { token: c2.qrToken, faceCheck: 'MATCH' })).body.code).toBe('ALREADY_PRESENT');
    const [b, sig] = c2.qrToken!.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b!, 'base64url').toString()), r: 'X' })).toString('base64url');
    expect((await desk.post('/api/v1/admin/centre/lookup', { token: `${forged}.${sig}` })).body.code).toBe('QR_INVALID');
    const sheet = await desk.get(`/api/v1/admin/centre/centres/${c2.centreId}/roll-sheet`);
    expect(sheet.headers['content-type']).toBe('application/pdf');
    expect((await desk.get('/api/v1/admin/exams')).status).toBe(403); // field roles cannot browse the console

    // ── Observer: COI gate, idempotent offline sync ──
    const observer = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'observer@t.in' } });
    const asg = await ex.post(`/api/v1/admin/exams/${exam.id}/observers`, { observerId: observer.id, centreId: c2.centreId });
    expect(asg.status).toBe(201);
    const obs = await adminLogin(app, 'observer@t.in');
    const report = { clientId: 'client-0001-abc', assignmentId: asg.body.id, kind: 'INCIDENT', severity: 'HIGH', payload: { text: 'Candidate found with phone' }, capturedAt: new Date().toISOString() };
    expect((await obs.post('/api/v1/admin/observer/sync', { reports: [report] })).body.rejected[0].reason).toBe('COI_DECLARATION_PENDING');
    expect((await obs.post(`/api/v1/admin/observer/assignments/${asg.body.id}/coi`, { hasConflict: false, confirm: true })).body.coiStatus).toBe('DECLARED_CLEAR');
    for (let i = 0; i < 2; i++) expect((await obs.post('/api/v1/admin/observer/sync', { reports: [report] })).body.accepted).toEqual(['client-0001-abc']);
    expect(await prisma.observerReport.count()).toBe(1);

    // ── Agency gateway: key with step-up, API upload, idempotent re-send, row errors ──
    const agency = await adminLogin(app, 'agency@t.in');
    const key = await stepUp(agency, 'post', '/api/v1/admin/agency/keys', { name: 'CBT vendor', scopes: ['CBT_RESPONSES', 'OMR_READS'] });
    expect(key.body.key).toMatch(/^vtl_ak_/);
    const api = new Client(app);
    expect((await api.agent.get('/api/v1/agency/v1/ping')).status).toBe(401);
    expect((await api.agent.get('/api/v1/agency/v1/ping').set('X-Agency-Key', key.body.key)).body.ok).toBe(true);
    // candidate 0 best, 3 worst; everyone picked B on Q3
    const ans = (correct: number) => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), i === 2 ? 'B' : i < correct ? 'A' : 'C']));
    const rolls = await Promise.all(cands.map(async (x) => (await prisma.admitCard.findUniqueOrThrow({ where: { applicationId: x.appId } })).rollNo));
    const records = [...rolls.map((r, i) => ({ rollNo: r, responses: ans(10 - i * 2), activeMinutes: 60 })), { rollNo: 'NOPE', responses: {} }];
    const up = await api.agent.post(`/api/v1/agency/v1/exams/LIFE-1/submissions`).set('X-Agency-Key', key.body.key).send({ kind: 'CBT_RESPONSES', records });
    expect(up.body).toMatchObject({ accepted: 4, rejected: 1, duplicate: false });
    expect((await api.agent.post(`/api/v1/agency/v1/exams/LIFE-1/submissions`).set('X-Agency-Key', key.body.key).send({ kind: 'CBT_RESPONSES', records })).body.duplicate).toBe(true);
    expect((await api.agent.post(`/api/v1/agency/v1/exams/LIFE-1/submissions`).set('X-Agency-Key', key.body.key).send({ kind: 'ATTENDANCE', records: [] })).status).toBe(403);

    // ── Answer key, objection with fee, AI pre-review, decision, final key ──
    const papers = (await ex.get(`/api/v1/admin/exams/${exam.id}/papers`)).body as Array<{ shift: { id: string } }>;
    const paperIds: string[] = [];
    for (const p of papers) paperIds.push((await ex.put(`/api/v1/admin/shifts/${p.shift.id}/paper`, { questionCount: 10, marksCorrect: 2, marksWrong: 0.5 })).body.id);
    for (const id of paperIds) expect((await stepUp(ex, 'post', `/api/v1/admin/papers/${id}/provisional-key`, { key: KEY, objectionDays: 2 })).status).toBe(200);
    const me = cands[0]!;
    const rs = await me.c.get(`/api/v1/me/applications/${me.appId}/response-sheet`);
    expect(rs.body.keyType).toBe('PROVISIONAL');
    expect(rs.body.breakdown).toMatchObject({ correct: 9, wrong: 1, raw: 17.5 });
    const obj = await me.c.post(`/api/v1/me/applications/${me.appId}/objections`, { qno: 3, claimedOptions: ['B'], reasoning: 'Option B is correct as per the official NCERT textbook, chapter 4, page 52.' });
    expect(obj.body.status).toBe('PAYMENT_PENDING');
    const pay = await me.c.post(`/api/v1/me/objections/${obj.body.id}/pay`);
    await me.c.agent.post('/api/v1/mock-gateway/complete').type('form').send({ txn: pay.body.merchantTxnId, outcome: 'SUCCESS' });
    expect((await prisma.objection.findUniqueOrThrow({ where: { id: obj.body.id } })).status).toBe('SUBMITTED');
    const myPaper = (await prisma.objection.findUniqueOrThrow({ where: { id: obj.body.id } })).paperId;
    const review = await ex.post(`/api/v1/admin/papers/${myPaper}/questions/3/pre-review`);
    expect(review.body.provider).toBe('rules');
    expect(review.body.claims).toEqual({ B: 1 });
    expect((await stepUp(ex, 'post', `/api/v1/admin/papers/${myPaper}/questions/3/decision`, { decision: 'CHANGE_KEY', newOptions: ['B'], note: 'Committee agrees: B is correct' })).body.ok).toBe(true);
    expect((await prisma.payment.findFirstOrThrow({ where: { objectionId: obj.body.id } })).status).toBe('REFUND_MARKED');
    expect((await stepUp(ex, 'post', `/api/v1/admin/papers/${myPaper}/final-key`)).body.code).toBe('WINDOW_OPEN');
    await prisma.examPaper.updateMany({ where: { examId: exam.id }, data: { objectionDeadline: new Date(Date.now() - 1000) } });
    // the other shift's key also gets the same change so both shifts are fair
    for (const id of paperIds.filter((x) => x !== myPaper)) await stepUp(ex, 'post', `/api/v1/admin/papers/${id}/questions/3/decision`, { decision: 'CHANGE_KEY', newOptions: ['B'], note: 'Same question in both shifts' });
    for (const id of paperIds) expect((await stepUp(ex, 'post', `/api/v1/admin/papers/${id}/final-key`)).body.finalPublishedAt).toBeTruthy();

    // ── Results: compute with normalisation, maker-checker, publish ──
    const comp = await ex.post(`/api/v1/admin/exams/${exam.id}/result-runs`, { stage: 'TIER1', cutoffs: { GEN: 5 } });
    expect(comp.status).toBe(200);
    expect(comp.body.rows).toHaveLength(4);
    expect(comp.body.rows[0].raw).toBe(20);
    await ex.post(`/api/v1/admin/exams/${exam.id}/result-runs/TIER1/submit`);
    expect((await stepUp(ex, 'post', `/api/v1/admin/exams/${exam.id}/result-runs/TIER1/decision`, { approve: true })).body.code).toBe('MAKER_CHECKER');
    expect((await stepUp(ex2, 'post', `/api/v1/admin/exams/${exam.id}/result-runs/TIER1/decision`, { approve: true })).body.ok).toBe(true);
    expect((await stepUp(ex, 'post', `/api/v1/admin/exams/${exam.id}/result-runs/TIER1/publish`)).body.published).toBe(4);
    const mine = await me.c.get('/api/v1/me/results');
    expect(mine.body[0]).toMatchObject({ stage: 'TIER1', raw: 20, rank: 1, qualified: true });

    // ── Debarment: proposed by verifier, approved by exam admin, enforced on apply ──
    const ver = await adminLogin(app, 'verifier@t.in');
    const last = await prisma.application.findUniqueOrThrow({ where: { id: cands[3]!.appId }, include: { candidate: true } });
    const deb = await ver.post('/api/v1/admin/debarments', { otrId: last.candidate.otrId, scope: 'ALL', reason: 'Found using a mobile phone in the exam hall (observer report)', sourceType: 'OBSERVER_REPORT', fromDate: '2026-01-01', untilDate: '2029-12-31' });
    expect(deb.status).toBe(201);
    expect((await stepUp(ex, 'post', `/api/v1/admin/debarments/${deb.body.id}/decision`, { approve: true })).body.status).toBe('ACTIVE');
    const exam2 = await createExam(prisma, { code: 'LIFE-2' });
    const blocked = await cands[3]!.c.post('/api/v1/applications', { examId: exam2.id, postIds: [exam2.posts[0]!.id], centreCityIds: [exam2.centreCities[0]!.id], customFieldValues: { medium: 'EN' } });
    expect(blocked.body.code).toBe('DEBARRED');

    // ── Selection: vacancies, shortlist, panel, interview marks, final merit 80:20 ──
    await ex.put(`/api/v1/admin/exams/${exam.id}/vacancies`, { rows: [{ postId: grad.id, orgCode: 'SBI', orgName: 'State Bank of India', category: 'GEN', count: 1 }, { postId: grad.id, orgCode: 'PNB', orgName: 'Punjab National Bank', category: 'GEN', count: 1 }] });
    expect((await ex.post(`/api/v1/admin/exams/${exam.id}/shortlist`, { toStage: 'INTERVIEW', multiplier: 1.5 })).body.shortlisted).toBe(3);
    const panelist = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'panel@t.in' } });
    expect((await ex.post(`/api/v1/admin/exams/${exam.id}/panels`, { name: 'Panel A', memberIds: [panelist.id], date: '2099-05-01', venue: 'VTL House, Delhi', criteria: [{ key: 'knowledge', label: 'Knowledge', max: 15 }, { key: 'communication', label: 'Communication', max: 10 }] })).status).toBe(201);
    expect((await ex.post(`/api/v1/admin/exams/${exam.id}/panels/schedule`)).body.scheduled).toBe(3);
    expect((await stepUp(ex, 'post', `/api/v1/admin/exams/${exam.id}/stage-calls/INTERVIEW/release`)).body.released).toBe(3);
    const pm = await adminLogin(app, 'panel@t.in');
    const myPanels = (await pm.get('/api/v1/admin/panel/me')).body;
    expect(myPanels[0].candidates).toHaveLength(3);
    expect(JSON.stringify(myPanels)).not.toContain('"category"');
    const brief = await pm.get(`/api/v1/admin/panel/calls/${myPanels[0].candidates[0].stageCallId}/brief`);
    expect(brief.body.points.length).toBeGreaterThan(0);
    expect((await pm.post(`/api/v1/admin/panel/calls/${myPanels[0].candidates[0].stageCallId}/marks`, { marks: { knowledge: 20, communication: 5 } })).body.code).toBe('MARKS_TOO_HIGH');
    const iv = [10, 25, 20];
    for (const [i, cc] of myPanels[0].candidates.entries()) await pm.post(`/api/v1/admin/panel/calls/${cc.stageCallId}/marks`, { marks: { knowledge: Math.min(15, iv[i]!), communication: Math.max(0, iv[i]! - 15) } });
    for (const stage of ['INTERVIEW', 'FINAL']) {
      expect((await ex.post(`/api/v1/admin/exams/${exam.id}/result-runs`, { stage })).status).toBe(200);
      await ex.post(`/api/v1/admin/exams/${exam.id}/result-runs/${stage}/submit`);
      await stepUp(sup, 'post', `/api/v1/admin/exams/${exam.id}/result-runs/${stage}/decision`, { approve: true });
      expect((await stepUp(ex, 'post', `/api/v1/admin/exams/${exam.id}/result-runs/${stage}/publish`)).status).toBe(200);
    }
    const final = (await ex.get(`/api/v1/admin/exams/${exam.id}/result-runs/FINAL`)).body.rows as Array<{ raw: number; rank: number }>;
    expect(final).toHaveLength(3);
    expect(final.map((r) => r.rank)).toEqual([1, 2, 3]);

    // ── Preferences, allotment, accept, DV with discrepancy checks ──
    const finalists = await prisma.scoreCard.findMany({ where: { examId: exam.id, stage: 'FINAL' }, orderBy: { rank: 'asc' } });
    for (const f of finalists) {
      const cand = cands.find((x) => x.appId === f.applicationId)!;
      const opts = await cand.c.get(`/api/v1/me/applications/${f.applicationId}/preferences`);
      expect(opts.body.options).toHaveLength(2);
      await cand.c.put(`/api/v1/me/applications/${f.applicationId}/preferences`, { prefs: [`${grad.id}:SBI`, `${grad.id}:PNB`] });
    }
    expect((await stepUp(ex, 'post', `/api/v1/admin/exams/${exam.id}/allotment/run`)).body).toMatchObject({ round: 1, allotted: 2, unallotted: 1 });
    const topCand = cands.find((x) => x.appId === finalists[0]!.applicationId)!;
    const sel = await topCand.c.get(`/api/v1/me/applications/${topCand.appId}/selection`);
    expect(sel.body.allotment).toMatchObject({ orgCode: 'SBI', prefNo: 1 });
    expect((await topCand.c.post(`/api/v1/me/applications/${topCand.appId}/allotment/accept`)).body.status).toBe('ACCEPTED');
    expect((await ex.post(`/api/v1/admin/exams/${exam.id}/dv/schedule`, { date: '2099-06-01', venue: 'VTL House, Delhi', slots: ['10:00'], perSlot: 10 })).body.scheduled).toBe(1);
    const letter = await topCand.c.get(`/api/v1/me/applications/${topCand.appId}/call-letter/DV`);
    expect(letter.headers['content-type']).toBe('application/pdf');
    const dv = (await ver.get(`/api/v1/admin/exams/${exam.id}/dv`)).body[0];
    expect((await ver.post(`/api/v1/admin/dv/${dv.id}/checks`)).body.provider).toBe('rules');
    expect((await ver.put(`/api/v1/admin/dv/${dv.id}`, { status: 'VERIFIED', checklist: [{ item: 'Photo ID', status: 'MISMATCH' }] })).body.code).toBe('CHECKLIST_OPEN');
    expect((await ver.put(`/api/v1/admin/dv/${dv.id}`, { status: 'VERIFIED', checklist: [{ item: 'Photo ID', status: 'OK' }] })).body.status).toBe('VERIFIED');
    expect((await prisma.allotment.findUniqueOrThrow({ where: { applicationId: topCand.appId } })).status).toBe('DV_CLEARED');

    // ── Journey trace covers the whole path ──
    const otr = (await prisma.candidate.findFirstOrThrow({ where: { applications: { some: { id: topCand.appId } } } })).otrId!;
    const trace = await (await adminLogin(app, 'helpdesk@t.in')).get(`/api/v1/admin/journey/${otr}`);
    const stages = new Set((trace.body.events as Array<{ stage: string }>).map((e) => e.stage));
    for (const s of ['Registration', 'OTR', 'Exam LIFE-1', 'Result LIFE-1', 'Selection', 'Allotment', 'Document verification']) expect(stages).toContain(s);
  }, 240000);
});

describe('helpdesk channels', () => {
  it('chat assistant answers from the knowledge base and escalates to a ticket', async () => {
    const c = await new Client(app).init();
    const r = await c.post('/api/v1/chat', { message: 'I did not receive the OTP on my phone', lang: 'en' });
    expect(r.body.provider).toBe('rules');
    expect(r.body.reply).toContain('Resend');
    const h = await c.post('/api/v1/chat', { sessionId: r.body.sessionId, message: 'I want to talk to a human', lang: 'en' });
    expect(h.body.suggestEscalation).toBe(true);
    expect((await c.post(`/api/v1/chat/${r.body.sessionId}/escalate`, {})).body.code).toBe('CONTACT_REQUIRED');
    const t = await c.post(`/api/v1/chat/${r.body.sessionId}/escalate`, { name: 'Ravi', mobile: '9876500000' });
    expect(t.body.ticketNo).toMatch(/^TKT/);
    expect((await prisma.helpdeskTicket.findUniqueOrThrow({ where: { id: t.body.ticketId } })).channel).toBe('CHAT');
  });

  it('IVR menu reads status for registered callers and logs call-back tickets; agents log phone calls', async () => {
    const { id } = await registerCandidate(app);
    const c = new Client(app);
    await c.init();
    const m = await c.post('/api/v1/ivr', { from: id.mobile });
    expect(m.body.say).toContain('press 1');
    const s = await c.post('/api/v1/ivr', { callId: m.body.callId, from: id.mobile, digits: '1' });
    expect(s.body.say).toContain('not yet submitted');
    const cb = await c.post('/api/v1/ivr', { callId: m.body.callId, from: id.mobile, digits: '9' });
    expect(cb.body.end).toBe(true);
    const hd = await adminLogin(app, 'helpdesk@t.in');
    const ph = await hd.post('/api/v1/admin/tickets/phone', { callerName: 'Ravi', mobile: id.mobile, category: 'PAYMENT', subject: 'Payment deducted twice', notes: 'Explained reconciliation; advised to wait 24h', resolved: true });
    expect(ph.body).toMatchObject({ channel: 'PHONE', status: 'RESOLVED', linkedCandidate: true });
    expect((await hd.get('/api/v1/admin/ivr-calls')).body[0].outcome).toBe('CALLBACK_TICKET');
  });
});
