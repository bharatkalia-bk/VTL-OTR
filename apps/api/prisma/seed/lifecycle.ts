/**
 * Demo data for the exam lifecycle, written with the same pure rules the API uses (scoring, normalisation,
 * merit, allotment) so the seeded numbers are consistent with what the services would compute.
 *
 *  - VTL-CHSL-2026: exam held, attendance and responses in, provisional key published, objection window open
 *  - VTL-JE-2025:   completed: results (Tier 1, interview, final 80:20) published, allotment done, DV in progress
 *  - VTL-SO-2026:   Tier 1 published, interviews scheduled, panel marks pending
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { allot, buildMerit, equipercentile, scoreResponses, type AnswerKey, type Category } from '@vtl/shared';
import type { FieldCrypto } from '../../src/security/field-crypto';

const COORDS: Record<string, [number, number, string]> = {
  Delhi: [28.6139, 77.209, 'New Delhi'], Lucknow: [26.8467, 80.9462, 'Lucknow'], Patna: [25.5941, 85.1376, 'Patna'], Jaipur: [26.9124, 75.7873, 'Jaipur'], Bhopal: [23.2599, 77.4126, 'Bhopal'],
};
const OPTS = ['A', 'B', 'C', 'D'];
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

let s = 9871;
const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function makeKey(n: number, seed: number): AnswerKey {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), [OPTS[(i * 7 + seed) % 4]!]]));
}
/** Responses for a candidate of a given ability (0..1); harder shift lowers the hit rate. */
function respond(key: AnswerKey, ability: number, difficulty: number, trap?: { qno: number; option: string }) {
  const out: Record<string, string | null> = {};
  for (const [q, [k]] of Object.entries(key)) {
    const x = r();
    if (trap && Number(q) === trap.qno) { out[q] = ability > 0.45 ? trap.option : OPTS[Math.floor(r() * 4)]!; continue; }
    if (x < 0.08) out[q] = null;
    else if (x < 0.08 + ability * (1 - difficulty)) out[q] = k!;
    else out[q] = OPTS.filter((o) => o !== k)[Math.floor(r() * 3)]!;
  }
  return out;
}

interface Ctx { prisma: PrismaClient; crypto: FieldCrypto; staff: Record<string, { id: string }> }
interface Cand { appId: string; candidateId: string; category: Category; pwd: boolean; dob: string; name: string; ability: number; rollNo: string; centreId: string; shiftId?: string }

async function people(ctx: Ctx, appIds: string[]): Promise<Omit<Cand, 'rollNo' | 'centreId'>[]> {
  const apps = await ctx.prisma.application.findMany({ where: { id: { in: appIds } }, include: { candidate: { include: { profile: true } } }, orderBy: { applicationNo: 'asc' } });
  return apps.map((a, i) => ({
    appId: a.id, candidateId: a.candidateId, category: (a.candidate.profile?.category ?? 'GEN') as Category, pwd: !!a.candidate.profile?.pwd,
    dob: ctx.crypto.decOpt(a.candidate.profile?.dobEnc) ?? '2000-01-01', name: ctx.crypto.decOpt(a.candidate.profile?.fullNameEnc) ?? '', ability: 0.35 + ((i * 37) % 60) / 100,
  }));
}

async function setCentres(ctx: Ctx, examId: string) {
  const centres = await ctx.prisma.examCentre.findMany({ where: { city: { examId } }, include: { city: true } });
  for (const [i, c] of centres.entries()) {
    const [lat, lng, district] = COORDS[c.city.cityName] ?? [22.5, 78.9, c.city.cityName];
    await ctx.prisma.examCentre.update({ where: { id: c.id }, data: { lat: lat + (i % 2) * 0.012, lng: lng + (i % 2) * 0.017, districtName: district } });
  }
  return ctx.prisma.examCentre.findMany({ where: { city: { examId } }, include: { city: true }, orderBy: { code: 'asc' } });
}

async function shifts(ctx: Ctx, examId: string, date: string, stage = 'TIER1') {
  return [
    await ctx.prisma.examShift.create({ data: { examId, stage, code: 'S1', date, startTime: '09:00', endTime: '11:00', mode: 'CBT' } }),
    await ctx.prisma.examShift.create({ data: { examId, stage, code: 'S2', date, startTime: '14:00', endTime: '16:00', mode: 'OMR' } }),
  ];
}

/** Admit cards, attendance and response sheets for a held written exam. Returns candidates with their keys per shift. */
async function holdExam(ctx: Ctx, exam: { id: string; code: string }, appIds: string[], prefix: string, date: string, opts: { absent?: number; trap?: { qno: number; option: string }; finalKey: boolean; qCount: number }) {
  const centres = await setCentres(ctx, exam.id);
  const [s1, s2] = await shifts(ctx, exam.id, date);
  const keys = { [s1!.id]: makeKey(opts.qCount, 1), [s2!.id]: makeKey(opts.qCount, 3) };
  const ppl = await people(ctx, appIds);
  const cands: Cand[] = [];
  for (const [k, p] of ppl.entries()) {
    const centre = centres[k % centres.length]!;
    const shift = k % 2 ? s2! : s1!;
    const existing = await ctx.prisma.admitCard.findUnique({ where: { applicationId: p.appId } });
    const rollNo = existing?.rollNo ?? `${prefix}${String(k + 1).padStart(6, '0')}`;
    if (existing) await ctx.prisma.admitCard.update({ where: { id: existing.id }, data: { shiftId: shift.id, centreId: existing.centreId ?? centre.id } });
    else await ctx.prisma.admitCard.create({ data: { applicationId: p.appId, examId: exam.id, rollNo, centreId: centre.id, shiftId: shift.id, allocationMethod: 'AUTO', releasedAt: days(-20), generatedAt: days(-20), downloadedAt: days(-15) } });
    const ac = await ctx.prisma.admitCard.findUniqueOrThrow({ where: { applicationId: p.appId } });
    const absent = k < (opts.absent ?? 0);
    await ctx.prisma.attendance.create({ data: { admitCardId: ac.id, status: absent ? 'ABSENT' : 'PRESENT', method: absent ? 'MANUAL' : 'QR', faceCheck: absent ? 'SKIPPED' : 'MATCH', markedById: ctx.staff.centre!.id, markedAt: new Date(`${date}T${shift.code === 'S1' ? '08:4' : '13:4'}${k % 10}:00+05:30`), note: absent ? 'Gate closed' : null } });
    if (!absent) {
      const resp = respond(keys[shift.id]!, p.ability, shift.code === 'S2' ? 0.15 : 0, opts.trap);
      await ctx.prisma.responseSheet.create({ data: { admitCardId: ac.id, shiftId: shift.id, source: shift.mode, responses: resp, timings: { activeMinutes: 70 + (k % 40) }, receivedAt: new Date(`${date}T18:00:00+05:30`) } });
      cands.push({ ...p, rollNo: ac.rollNo, centreId: ac.centreId!, shiftId: shift.id });
    }
  }
  for (const sh of [s1!, s2!]) {
    await ctx.prisma.examPaper.create({ data: {
      examId: exam.id, shiftId: sh.id, questionCount: opts.qCount, marksCorrect: 2, marksWrong: 0.5,
      sections: [{ name: 'Reasoning', from: 1, to: Math.floor(opts.qCount / 2) }, { name: 'General Awareness', from: Math.floor(opts.qCount / 2) + 1, to: opts.qCount }],
      provisionalKey: keys[sh.id], provisionalPublishedAt: opts.finalKey ? days(-60) : days(-1), objectionDeadline: opts.finalKey ? days(-55) : days(5),
      ...(opts.finalKey && { finalKey: keys[sh.id], finalPublishedAt: days(-50) }),
    } });
  }
  return { cands, keys, shifts: [s1!, s2!], centres };
}

/** Tier 1 scorecards (normalised across shifts) and published result run. */
async function publishTier1(ctx: Ctx, examId: string, held: Awaited<ReturnType<typeof holdExam>>, cutoffs: Partial<Record<Category, number>>) {
  const papers = await ctx.prisma.examPaper.findMany({ where: { examId } });
  const scored = await Promise.all(held.cands.map(async (c) => {
    const sheet = await ctx.prisma.responseSheet.findFirstOrThrow({ where: { admitCard: { applicationId: c.appId } } });
    const p = papers.find((x) => x.shiftId === c.shiftId)!;
    return { c, b: scoreResponses(sheet.responses as Record<string, string | null>, p.finalKey as AnswerKey, { questionCount: p.questionCount, marksCorrect: p.marksCorrect, marksWrong: p.marksWrong, sections: p.sections as Array<{ name: string; from: number; to: number }> }) };
  }));
  const byShift = new Map<string, Array<{ id: string; raw: number }>>();
  for (const x of scored) byShift.set(x.c.shiftId!, [...(byShift.get(x.c.shiftId!) ?? []), { id: x.c.appId, raw: x.b.raw }]);
  const norm = equipercentile([...byShift].map(([shiftId, sc]) => ({ shiftId, scores: sc })));
  const nm = new Map(norm.results.map((n) => [n.id, n]));
  const merit = buildMerit(scored.map((x) => ({ id: x.c.appId, category: x.c.category, pwd: x.c.pwd, dob: x.c.dob, name: x.c.name, written: Math.round(nm.get(x.c.appId)!.normalised * 100) / 100 })), { writtenMax: 1, writtenWeight: 100, interviewWeight: 0, cutoffs });
  const mm = new Map(merit.map((m) => [m.id, m]));
  const pub = days(-40);
  for (const x of scored) {
    const m = mm.get(x.c.appId)!;
    await ctx.prisma.scoreCard.create({ data: { applicationId: x.c.appId, examId, stage: 'TIER1', raw: x.b.raw, normalised: m.written, percentile: nm.get(x.c.appId)!.percentile, correct: x.b.correct, wrong: x.b.wrong, unattempted: x.b.unattempted, sectionScores: x.b.sectionScores, rank: m.rank, categoryRank: m.categoryRank, qualified: m.qualified, publishedAt: pub } });
    await ctx.prisma.result.create({ data: { applicationId: x.c.appId, status: m.qualified ? 'QUALIFIED' : 'NOT_QUALIFIED', score: m.written, rank: m.rank, publishedAt: pub } });
  }
  await ctx.prisma.resultRun.create({ data: { examId, stage: 'TIER1', status: 'PUBLISHED', cutoffs, stats: { candidates: scored.length, qualified: merit.filter((m) => m.qualified).length, withheld: 0, baseShift: norm.base, shifts: norm.stats }, anomalies: [], computedById: ctx.staff.examadmin!.id, computedAt: days(-42), submittedAt: days(-42), approvedById: ctx.staff.examadmin2!.id, approvedAt: days(-41), publishedAt: pub } });
  return merit;
}

export async function seedLifecycle(ctx: Ctx, input: { chslId: string; jeAppIds: string[]; soAppIds: string[]; jeExamId: string; soExamId: string }) {
  const { prisma } = ctx;
  // ── CHSL: exam held, provisional key, objections window open ──
  const chsl = await prisma.exam.update({ where: { id: input.chslId }, data: { dates: { notification: '2026-06-01', applyStart: '2026-06-01', applyEnd: '2026-07-15', feeLastDate: '2026-07-17', admitCardRelease: '2026-11-05', examDate: '2026-11-16' }, objectionFee: 100 } });
  const chslApps = (await prisma.application.findMany({ where: { examId: chsl.id }, select: { id: true } })).map((a) => a.id);
  const held = await holdExam(ctx, chsl, chslApps, 'CHS', '2026-11-16', { absent: 2, trap: { qno: 7, option: 'C' }, finalKey: false, qCount: 25 });
  // Q7 key in S1 is wrong on purpose (strong candidates answer C): objections + item analysis flag it.
  const s1Paper = await prisma.examPaper.findFirstOrThrow({ where: { shiftId: held.shifts[0]!.id } });
  const objectors = held.cands.filter((c) => c.shiftId === held.shifts[0]!.id).slice(0, 3);
  for (const [i, c] of objectors.entries()) {
    const o = await prisma.objection.create({ data: { examId: chsl.id, paperId: s1Paper.id, applicationId: c.appId, candidateId: c.candidateId, qno: 7, claimedOptions: ['C'], reasoning: ['As per NCERT Class 10 Science, chapter 6, the correct answer is C, not D.', 'Option C is correct; option D describes a different process (see Lucent GK page 112).', 'The keyed answer contradicts the standard definition. C is right.'][i]!, fee: 100, status: i === 2 ? 'PAYMENT_PENDING' : 'SUBMITTED' } });
    if (i < 2) {
      const p = await prisma.payment.create({ data: { applicationId: c.appId, purpose: 'OBJECTION', objectionId: o.id, merchantTxnId: `VTLO20261120SEED${i}`, gateway: 'mock', gatewayTxnId: `MPGOBJ${i}`, amount: 100, status: 'SUCCESS', reconciledAt: new Date() } });
      await prisma.objection.update({ where: { id: o.id }, data: { paymentId: p.id } });
    }
  }
  for (const c of held.cands) await prisma.notification.create({ data: { candidateId: c.candidateId, titleKey: 'notifications.answerKey', params: { days: 5 }, link: `/results/${c.appId}` } });
  // Exam-day records
  const c0 = held.centres[0]!;
  const asg = await prisma.observerAssignment.create({ data: { observerId: ctx.staff.observer!.id, examId: chsl.id, centreId: c0.id, shiftId: held.shifts[0]!.id, coiStatus: 'DECLARED_CLEAR', coiDeclaredAt: days(-6) } });
  await prisma.observerAssignment.create({ data: { observerId: ctx.staff.observer!.id, examId: chsl.id, centreId: held.centres[2]!.id, shiftId: held.shifts[1]!.id, coiStatus: 'PENDING', autoCoiFlags: [{ code: 'HOME_DISTRICT', detail: `Centre is in the observer's home district (${COORDS.Lucknow![2]}).` }] } });
  for (const [k, rep] of ([
    ['ARRIVAL', 'INFO', { text: 'Reached centre at 07:45' }],
    ['CHECKLIST', 'INFO', { cctv: true, jammer: true, frisking: true, seating: true, papers_sealed: true, biometric: true, gate_closed: true, pwd_facility: false, summary: '7/8 items OK' }],
    ['INCIDENT', 'HIGH', { text: 'Candidate in room 4 found with a smartwatch during the exam. Device seized, statement recorded.' }],
    ['FINAL', 'INFO', { text: 'Exam concluded; OMR sheets sealed and dispatched' }],
  ] as const).entries()) {
    await prisma.observerReport.create({ data: { assignmentId: asg.id, clientId: `seed-obs-${k}`, kind: rep[0], severity: rep[1], payload: rep[2] as Prisma.InputJsonValue, capturedAt: new Date(`2026-11-16T${String(7 + k * 2).padStart(2, '0')}:${10 + k * 7}:00+05:30`), lat: c0.lat ?? undefined, lng: c0.lng ?? undefined } });
  }
  const suspect = held.cands[3]!;
  await prisma.biometricAlert.create({ data: { examId: chsl.id, admitCardId: (await prisma.admitCard.findUniqueOrThrow({ where: { applicationId: suspect.appId } })).id, rollNo: suspect.rollNo, centreId: suspect.centreId, kind: 'FACE_MISMATCH', score: 0.41, source: 'AGENCY', details: { note: 'Entry camera face match below threshold' } } });
  await prisma.technicalException.create({ data: { examId: chsl.id, shiftId: held.shifts[0]!.id, centreId: c0.id, rollNos: held.cands.slice(0, 2).map((c) => c.rollNo), kind: 'SYSTEM_FAILURE', minutesLost: 12, description: 'Two terminals froze at 09:40; candidates moved to spare systems and resumed.', reportedById: ctx.staff.centre!.id, reportedVia: 'DESK' } });
  await prisma.agencySubmission.create({ data: { examId: chsl.id, kind: 'CBT_RESPONSES', source: 'API', submittedById: ctx.staff.agency!.id, checksum: 'seed-cbt-s1', records: held.cands.length, accepted: held.cands.length, rejected: 0 } });
  await prisma.adminUser.update({ where: { id: ctx.staff.centre!.id }, data: { scope: { centreIds: held.centres.slice(0, 2).map((c) => c.id) } } });
  await prisma.adminUser.update({ where: { id: ctx.staff.agency!.id }, data: { scope: { examIds: [chsl.id, input.jeExamId, input.soExamId], agency: 'Demo Testing Services Pvt Ltd' } } });

  // ── JE 2025: completed lifecycle ──
  const je = await holdExam(ctx, { id: input.jeExamId, code: 'VTL-JE-2025' }, input.jeAppIds, 'JE25', '2025-09-20', { finalKey: true, qCount: 30 });
  const jeMerit = await publishTier1(ctx, input.jeExamId, je, { GEN: 10, OBC_NCL: 8, SC: 5, ST: 5, EWS: 9 });
  const jePosts = await prisma.post.findMany({ where: { examId: input.jeExamId } });
  const vac = [['NHAI', 'National Highways Authority', 'GEN', 2], ['NHAI', 'National Highways Authority', 'OBC_NCL', 1], ['CPWD', 'Central Public Works Department', 'GEN', 2], ['CPWD', 'Central Public Works Department', 'SC', 1]] as const;
  for (const [code, name, cat, n] of vac) await prisma.vacancyRow.create({ data: { examId: input.jeExamId, postId: jePosts[0]!.id, orgCode: code, orgName: name, category: cat, count: n } });
  const jePanel = await prisma.interviewPanel.create({ data: { examId: input.jeExamId, name: 'Panel A', memberIds: [ctx.staff.panel!.id, ctx.staff.panel2!.id], date: '2025-11-05', venue: 'VTL House, Connaught Place, New Delhi', criteria: [{ key: 'knowledge', label: 'Subject knowledge', max: 40 }, { key: 'communication', label: 'Communication', max: 30 }, { key: 'personality', label: 'Personality & aptitude', max: 30 }] } });
  const shortlisted = jeMerit.filter((m) => m.qualified).slice(0, 9);
  const ivScores = new Map<string, number>();
  for (const [k, m] of shortlisted.entries()) {
    const c = je.cands.find((x) => x.appId === m.id)!;
    const call = await prisma.stageCall.create({ data: { applicationId: m.id, examId: input.jeExamId, stage: 'INTERVIEW', status: 'APPEARED', rollNo: c.rollNo, panelId: jePanel.id, slotAt: new Date(`2025-11-05T${String(9 + Math.floor(k / 3)).padStart(2, '0')}:${['30', '50', '10'][k % 3]}:00+05:30`), venue: jePanel.venue, letterReleasedAt: days(-35) } });
    let total = 0;
    for (const member of [ctx.staff.panel!, ctx.staff.panel2!]) {
      const marks = { knowledge: 20 + ((k * 7 + member.id.length) % 18), communication: 15 + ((k * 5) % 13), personality: 14 + ((k * 3) % 14) };
      const t = marks.knowledge + marks.communication + marks.personality;
      total += t;
      await prisma.panelMark.create({ data: { panelId: jePanel.id, stageCallId: call.id, memberId: member.id, marks, total: t, remarks: k % 3 === 0 ? 'Clear technical concepts' : null } });
    }
    ivScores.set(m.id, total / 2);
  }
  const pub2 = days(-25);
  const ivRows = shortlisted.map((m) => ({ id: m.id, raw: ivScores.get(m.id)! }));
  for (const [k, x] of [...ivRows].sort((a, b) => b.raw - a.raw).entries()) await prisma.scoreCard.create({ data: { applicationId: x.id, examId: input.jeExamId, stage: 'INTERVIEW', raw: x.raw, normalised: x.raw, rank: k + 1, qualified: true, publishedAt: pub2 } });
  await prisma.resultRun.create({ data: { examId: input.jeExamId, stage: 'INTERVIEW', status: 'PUBLISHED', stats: { candidates: ivRows.length }, computedById: ctx.staff.examadmin!.id, computedAt: days(-27), approvedById: ctx.staff.examadmin2!.id, approvedAt: days(-26), publishedAt: pub2 } });
  const final = buildMerit(shortlisted.map((m) => ({ id: m.id, category: m.category, pwd: m.pwd, dob: m.dob, name: m.name, written: m.written, interview: ivScores.get(m.id)! })), { writtenMax: 60, interviewMax: 100, writtenWeight: 80, interviewWeight: 20 });
  const pub3 = days(-20);
  for (const f of final) {
    await prisma.scoreCard.create({ data: { applicationId: f.id, examId: input.jeExamId, stage: 'FINAL', raw: f.final, normalised: f.final, sectionScores: { written: f.written, interview: f.interview ?? 0 }, rank: f.rank, categoryRank: f.categoryRank, qualified: true, publishedAt: pub3 } });
    await prisma.result.update({ where: { applicationId: f.id }, data: { score: f.final, rank: f.rank, publishedAt: pub3 } });
    await prisma.notification.create({ data: { candidateId: je.cands.find((c) => c.appId === f.id)!.candidateId, titleKey: 'notifications.resultPublished', params: { stage: 'FINAL' }, link: `/results/${f.id}` } });
  }
  await prisma.resultRun.create({ data: { examId: input.jeExamId, stage: 'FINAL', status: 'PUBLISHED', stats: { candidates: final.length, writtenMax: 60, interviewMax: 100, weights: '80:20' }, computedById: ctx.staff.examadmin!.id, computedAt: days(-22), approvedById: ctx.staff.examadmin2!.id, approvedAt: days(-21), publishedAt: pub3 } });
  // Preferences and allotment round 1
  const prefKeys = ['NHAI', 'CPWD'].map((o) => `${jePosts[0]!.id}:${o}`);
  for (const [k, f] of final.entries()) await prisma.allotmentPreference.create({ data: { applicationId: f.id, examId: input.jeExamId, prefs: k % 2 ? [...prefKeys].reverse() : prefKeys, submittedAt: days(-18) } });
  const res = allot(final.map((f, k) => ({ id: f.id, rank: f.rank, category: f.category, prefs: k % 2 ? [...prefKeys].reverse() : prefKeys })), vac.map(([code, , cat, n]) => ({ key: `${jePosts[0]!.id}:${code}`, category: cat, count: n })));
  for (const [k, a] of res.allotted.entries()) {
    const org = a.key.split(':')[1]!;
    const status = k < 3 ? 'ACCEPTED' : k === 3 ? 'DECLINED' : 'PROVISIONAL';
    await prisma.allotment.create({ data: { applicationId: a.id, examId: input.jeExamId, postId: jePosts[0]!.id, orgCode: org, orgName: vac.find((v) => v[0] === org)![1], category: a.category, meritRank: final.find((f) => f.id === a.id)!.rank, prefNo: a.prefNo, status, respondedAt: status === 'PROVISIONAL' ? null : days(-14) } });
    if (status === 'ACCEPTED') {
      await prisma.dvSession.create({ data: { applicationId: a.id, examId: input.jeExamId, date: new Date().toISOString().slice(0, 10), slot: ['10:00', '10:00', '12:00'][k]!, venue: 'VTL House, Connaught Place, New Delhi', status: k === 0 ? 'VERIFIED' : 'SCHEDULED', officerId: k === 0 ? ctx.staff.verifier!.id : null, completedAt: k === 0 ? days(-1) : null, checklist: ['Admit card and call letter', 'Photo ID (original)', 'Date of birth proof', 'Educational certificates', 'Category certificate (if claimed)', 'PwD certificate (if claimed)'].map((item) => ({ item, status: k === 0 ? 'OK' : 'PENDING' })) } });
      if (k === 0) await prisma.allotment.update({ where: { applicationId: a.id }, data: { status: 'DV_CLEARED' } });
    }
  }

  // ── SO 2026: Tier 1 done, interviews pending (panel workspace) ──
  const so = await holdExam(ctx, { id: input.soExamId, code: 'VTL-SO-2026' }, input.soAppIds, 'SO26', '2026-10-12', { finalKey: true, qCount: 30 });
  const soMerit = await publishTier1(ctx, input.soExamId, so, { GEN: 12, OBC_NCL: 10, SC: 7, ST: 7, EWS: 11 });
  const soPanel = await prisma.interviewPanel.create({ data: { examId: input.soExamId, name: 'Panel 1', memberIds: [ctx.staff.panel!.id], date: new Date().toISOString().slice(0, 10), venue: 'VTL Regional Office, Lucknow', criteria: [{ key: 'knowledge', label: 'Subject knowledge', max: 40 }, { key: 'communication', label: 'Communication', max: 30 }, { key: 'personality', label: 'Personality & aptitude', max: 30 }] } });
  for (const [k, m] of soMerit.filter((x) => x.qualified).slice(0, 6).entries()) {
    const c = so.cands.find((x) => x.appId === m.id)!;
    const slot = new Date(); slot.setUTCHours(4, 0 + k * 20, 0, 0);
    await prisma.stageCall.create({ data: { applicationId: m.id, examId: input.soExamId, stage: 'INTERVIEW', status: 'CALLED', rollNo: c.rollNo, panelId: soPanel.id, slotAt: slot, venue: soPanel.venue, letterReleasedAt: days(-7) } });
  }
  return { chslCandidates: held.cands.length, jeFinal: final.length, soShortlist: 6 };
}
