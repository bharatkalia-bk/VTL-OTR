import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  answerSimilarity, buildMerit, centreOutliers, equipercentile, fastHighScores, percentiles, resultComputeSchema, scoreResponses, stageMarksSchema,
  type AnomalyFlag, type AnswerKey, type Category, type ResultStage,
} from '@vtl/shared';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { FieldCrypto } from '../../security/field-crypto';
import { CandidateDataService, type CandidateView } from '../candidates/candidate-data.service';
import { notFound, parseCsv, snapshotOf } from './common';
import { DebarmentService } from './debarment.service';

const r2 = (n: number) => Math.round(n * 100) / 100;
interface Row { applicationId: string; candidateId: string; rollNo: string; centreId: string | null; category: Category; pwd: boolean; dob: string; name: string; raw: number; normalised: number; percentile: number; correct: number; wrong: number; unattempted: number; sectionScores: Record<string, number>; withheld: boolean; withheldReason?: string }

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
    private readonly data: CandidateDataService,
    private readonly debar: DebarmentService,
  ) {}

  private async snap(app: { candidateId: string; profileSnapshotEnc: string | null }): Promise<CandidateView> {
    return snapshotOf(this.crypto, this.data, app);
  }

  /** Reasons to withhold a result: active debarment, confirmed impersonation alert, pending re-exam. */
  private async withholdMap(examId: string): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    for (const a of await this.prisma.biometricAlert.findMany({ where: { examId, status: 'CONFIRMED' } })) m.set(a.rollNo, `Biometric alert confirmed (${a.kind})`);
    for (const t of await this.prisma.technicalException.findMany({ where: { examId, status: 'RE_EXAM' } })) for (const r of t.rollNos) m.set(r, 'Re-exam pending (technical exception)');
    return m;
  }

  async compute(adminId: string, examId: string, body: unknown) {
    const x = parseOrThrow(resultComputeSchema, body);
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) notFound('Exam');
    const existing = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId, stage: x.stage } } });
    if (existing && ['PENDING_APPROVAL', 'APPROVED', 'PUBLISHED'].includes(existing.status)) throw new AppError('LOCKED', `This result is ${existing.status.toLowerCase().replace('_', ' ')}; it cannot be recomputed.`, 409);

    let rows: Row[];
    let anomalies: AnomalyFlag[] = [];
    let stats: Record<string, unknown> = {};
    if (x.stage === 'TIER1') ({ rows, anomalies, stats } = await this.computeWritten(examId, x.baseShiftId));
    else if (x.stage === 'TIER2') rows = await this.fromStageMarks(examId, 'TIER2');
    else if (x.stage === 'INTERVIEW') rows = await this.fromPanels(examId);
    else return this.computeFinal(adminId, examId, x.cutoffs);

    const withhold = await this.withholdMap(examId);
    for (const r of rows) {
      const w = withhold.get(r.rollNo) ?? ((await this.debar.activeFor(r.candidateId, examId)) ? 'Debarred' : undefined);
      if (w) { r.withheld = true; r.withheldReason = w; }
    }
    const merit = buildMerit(rows.filter((r) => !r.withheld).map((r) => ({ id: r.applicationId, category: r.category, pwd: r.pwd, dob: r.dob, name: r.name, written: r.normalised })), { writtenMax: 1, writtenWeight: 100, interviewWeight: 0, cutoffs: x.cutoffs });
    const byId = new Map(merit.map((m) => [m.id, m]));
    await this.prisma.$transaction(async (tx) => {
      await tx.scoreCard.deleteMany({ where: { examId, stage: x.stage } });
      await tx.scoreCard.createMany({ data: rows.map((r) => {
        const m = byId.get(r.applicationId);
        return { applicationId: r.applicationId, examId, stage: x.stage, raw: r.raw, normalised: r.normalised, percentile: r.percentile, correct: r.correct, wrong: r.wrong, unattempted: r.unattempted, sectionScores: { ...r.sectionScores, ...(r.withheldReason && { _withheld: r.withheldReason }) } as Prisma.InputJsonValue, rank: m?.rank ?? null, categoryRank: m?.categoryRank ?? null, qualified: !!m?.qualified, withheld: r.withheld };
      }) });
      const byCat: Record<string, { n: number; qualified: number; max: number; lastQualified: number | null }> = {};
      for (const m of merit) {
        const c = (byCat[m.category] ??= { n: 0, qualified: 0, max: -Infinity, lastQualified: null });
        c.n++; c.max = Math.max(c.max, m.written);
        if (m.qualified) { c.qualified++; c.lastQualified = c.lastQualified === null ? m.written : Math.min(c.lastQualified, m.written); }
      }
      const run = { cutoffs: x.cutoffs, stats: { ...stats, candidates: rows.length, withheld: rows.filter((r) => r.withheld).length, qualified: merit.filter((m) => m.qualified).length, byCategory: byCat } as Prisma.InputJsonValue, anomalies: anomalies as unknown as Prisma.InputJsonValue, computedById: adminId, computedAt: new Date(), status: 'DRAFT', rejectNote: null };
      await tx.resultRun.upsert({ where: { examId_stage: { examId, stage: x.stage } }, create: { examId, stage: x.stage, ...run }, update: run });
      await this.audit.log({ action: 'RESULT_COMPUTED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { stage: x.stage, candidates: rows.length, anomalies: anomalies.length } }, tx);
    });
    return this.get(examId, x.stage);
  }

  /** Stage 1: score every response sheet with the final key, normalise across shifts, flag anomalies. */
  private async computeWritten(examId: string, baseShiftId?: string) {
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const shifts = await this.prisma.examShift.findMany({ where: { examId, stage: exam.stages[0] ?? 'TIER1' } });
    const papers = new Map((await this.prisma.examPaper.findMany({ where: { examId } })).map((p) => [p.shiftId, p]));
    const notFinal = shifts.filter((s) => papers.get(s.id) && !papers.get(s.id)!.finalPublishedAt);
    if (!papers.size) throw new AppError('NO_PAPERS', 'Set up the paper and answer key for each shift first.');
    if (notFinal.length) throw new AppError('KEY_NOT_FINAL', `Publish the final answer key for shift(s) ${notFinal.map((s) => s.code).join(', ')} first.`);
    const sheets = await this.prisma.responseSheet.findMany({ where: { shiftId: { in: shifts.map((s) => s.id) } }, include: { admitCard: { include: { application: true } } } });
    if (!sheets.length) throw new AppError('NO_RESPONSES', 'No response sheets received yet.');
    const rows: Row[] = [];
    const byShift = new Map<string, Array<{ id: string; raw: number }>>();
    const forSimilarity: Array<{ id: string; group: string; responses: Record<string, string | null>; key: AnswerKey }> = [];
    const timing: Array<{ id: string; scorePct: number; activeMinutes: number }> = [];
    for (const s of sheets) {
      const p = papers.get(s.shiftId);
      if (!p?.finalKey) continue;
      const app = s.admitCard.application;
      const v = await this.snap(app);
      const scheme = { questionCount: p.questionCount, marksCorrect: p.marksCorrect, marksWrong: p.marksWrong, dropped: p.dropped, sections: p.sections as Array<{ name: string; from: number; to: number }> };
      const b = scoreResponses(s.responses as Record<string, string | null>, p.finalKey as AnswerKey, scheme);
      rows.push({ applicationId: app.id, candidateId: app.candidateId, rollNo: s.admitCard.rollNo, centreId: s.admitCard.centreId, category: (v.category.category ?? 'GEN') as Category, pwd: v.category.pwd, dob: v.personal.dob ?? '', name: v.personal.fullName ?? '', raw: b.raw, normalised: b.raw, percentile: 0, correct: b.correct, wrong: b.wrong, unattempted: b.unattempted, sectionScores: b.sectionScores, withheld: false });
      byShift.set(s.shiftId, [...(byShift.get(s.shiftId) ?? []), { id: app.id, raw: b.raw }]);
      forSimilarity.push({ id: s.admitCard.rollNo, group: `${s.admitCard.centreId ?? '-'}|${s.shiftId}`, responses: s.responses as Record<string, string | null>, key: p.finalKey as AnswerKey });
      const t = s.timings as { activeMinutes?: number } | null;
      if (t?.activeMinutes) timing.push({ id: s.admitCard.rollNo, scorePct: (b.raw / (p.questionCount * p.marksCorrect)) * 100, activeMinutes: t.activeMinutes });
    }
    const norm = equipercentile([...byShift].map(([shiftId, scores]) => ({ shiftId, scores })), baseShiftId);
    const nm = new Map(norm.results.map((n) => [n.id, n]));
    for (const r of rows) { const n = nm.get(r.applicationId)!; r.normalised = r2(n.normalised); r.percentile = n.percentile; }

    const centres = new Map((await this.prisma.examCentre.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => (r.centreId ? [r.centreId] : [])))] } } })).map((c) => [c.id, c]));
    const byCentre: Record<string, number[]> = {};
    for (const r of rows) if (r.centreId) (byCentre[`${centres.get(r.centreId)?.code ?? r.centreId}`] ??= []).push(r.normalised);
    const anomalies: AnomalyFlag[] = [...centreOutliers(byCentre), ...fastHighScores(timing)];
    const groups = new Map<string, typeof forSimilarity>();
    for (const s of forSimilarity) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
    for (const [, list] of groups) anomalies.push(...answerSimilarity(list, list[0]!.key, 8).map((f) => ({ ...f, subject: `${centres.get(f.subject.split('|')[0]!)?.code ?? f.subject.split('|')[0]} (shift)` })));
    return { rows, anomalies, stats: { baseShift: norm.base, shifts: norm.stats } };
  }

  /** Stage 2 (descriptive / skill test) marks uploaded as CSV: rollNo,marks. Normalised = marks. */
  async uploadStageMarks(adminId: string, examId: string, stage: 'TIER2', body: unknown) {
    const x = parseOrThrow(stageMarksSchema, body);
    const rows = parseCsv(x.csv);
    const errors: Array<{ row: number; error: string }> = [];
    let accepted = 0;
    for (let i = 0; i < rows.length; i++) {
      const roll = rows[i]!.rollNo ?? rows[i]!.roll_no;
      const marks = Number(rows[i]!.marks);
      const call = roll ? await this.prisma.stageCall.findFirst({ where: { examId, stage, rollNo: roll } }) : null;
      if (!call) { errors.push({ row: i + 2, error: `Roll ${roll ?? '?'} is not shortlisted for ${stage}` }); continue; }
      if (!Number.isFinite(marks) || marks < -1000 || marks > 1000) { errors.push({ row: i + 2, error: 'Invalid marks' }); continue; }
      await this.prisma.scoreCard.upsert({ where: { applicationId_stage: { applicationId: call.applicationId, stage } }, create: { applicationId: call.applicationId, examId, stage, raw: marks, normalised: marks }, update: { raw: marks, normalised: marks } });
      await this.prisma.stageCall.update({ where: { id: call.id }, data: { status: 'APPEARED' } });
      accepted++;
    }
    await this.audit.log({ action: 'STAGE_MARKS_UPLOADED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { stage, accepted, rejected: errors.length } });
    return { accepted, errors };
  }

  private async rowsFor(examId: string, scores: Array<{ applicationId: string; raw: number }>): Promise<Row[]> {
    const apps = new Map((await this.prisma.application.findMany({ where: { id: { in: scores.map((s) => s.applicationId) } }, include: { admitCard: true } })).map((a) => [a.id, a]));
    const pct = percentiles(scores.map((s) => s.raw));
    return Promise.all(scores.map(async (s, i) => {
      const a = apps.get(s.applicationId)!;
      const v = await this.snap(a);
      return { applicationId: a.id, candidateId: a.candidateId, rollNo: a.admitCard?.rollNo ?? '', centreId: a.admitCard?.centreId ?? null, category: (v.category.category ?? 'GEN') as Category, pwd: v.category.pwd, dob: v.personal.dob ?? '', name: v.personal.fullName ?? '', raw: s.raw, normalised: s.raw, percentile: pct[i]!, correct: 0, wrong: 0, unattempted: 0, sectionScores: {}, withheld: false };
    }));
  }

  private async fromStageMarks(examId: string, stage: 'TIER2'): Promise<Row[]> {
    const cards = await this.prisma.scoreCard.findMany({ where: { examId, stage } });
    if (!cards.length) throw new AppError('NO_MARKS', `Upload ${stage} marks first.`);
    return this.rowsFor(examId, cards.map((c) => ({ applicationId: c.applicationId, raw: c.raw })));
  }

  /** Interview score = mean of the panel members' totals. */
  private async fromPanels(examId: string): Promise<Row[]> {
    const calls = await this.prisma.stageCall.findMany({ where: { examId, stage: 'INTERVIEW', panelId: { not: null } } });
    const marks = await this.prisma.panelMark.findMany({ where: { stageCallId: { in: calls.map((c) => c.id) } } });
    const scores = calls.flatMap((c) => {
      const m = marks.filter((x) => x.stageCallId === c.id);
      return m.length ? [{ applicationId: c.applicationId, raw: r2(m.reduce((a, b) => a + b.total, 0) / m.length) }] : [];
    });
    if (!scores.length) throw new AppError('NO_MARKS', 'No interview marks submitted yet.');
    return this.rowsFor(examId, scores);
  }

  /** Final merit: written stages (normalised) and interview, weighted as notified (e.g. 80:20). */
  private async computeFinal(adminId: string, examId: string, cutoffs: Partial<Record<string, number>>) {
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { shifts: true } });
    const written = exam.stages.filter((s) => s !== 'INTERVIEW');
    const lastWritten = written[written.length - 1]!;
    const runs = await this.prisma.resultRun.findMany({ where: { examId } });
    for (const s of exam.stages) if (runs.find((r) => r.stage === s)?.status !== 'PUBLISHED') throw new AppError('STAGE_PENDING', `Publish the ${s} result first.`);
    const cards = await this.prisma.scoreCard.findMany({ where: { examId, stage: { in: exam.stages } } });
    const finalists = cards.filter((c) => c.stage === (exam.stages.includes('INTERVIEW') ? 'INTERVIEW' : lastWritten) && !c.withheld);
    const papers = await this.prisma.examPaper.findMany({ where: { examId } });
    const writtenMax = (papers[0] ? papers[0].questionCount * papers[0].marksCorrect : 100) * (written.length > 1 ? 2 : 1);
    const panels = await this.prisma.interviewPanel.findMany({ where: { examId } });
    const interviewMax = panels[0] ? (panels[0].criteria as Array<{ max: number }>).reduce((a, b) => a + b.max, 0) : 0;
    const inputs = await Promise.all(finalists.map(async (f) => {
      const app = await this.prisma.application.findUniqueOrThrow({ where: { id: f.applicationId } });
      const v = await this.snap(app);
      const w = cards.filter((c) => c.applicationId === f.applicationId && written.includes(c.stage)).reduce((a, b) => a + (b.normalised ?? b.raw), 0);
      const iv = cards.find((c) => c.applicationId === f.applicationId && c.stage === 'INTERVIEW')?.raw ?? null;
      return { id: f.applicationId, category: (v.category.category ?? 'GEN') as Category, pwd: v.category.pwd, dob: v.personal.dob ?? '', name: v.personal.fullName ?? '', written: r2(w), interview: iv };
    }));
    const merit = buildMerit(inputs, { writtenMax, interviewMax: interviewMax || undefined, writtenWeight: exam.interviewWeight ? exam.writtenWeight : 100, interviewWeight: exam.interviewWeight, cutoffs: cutoffs as Partial<Record<Category, number>> });
    await this.prisma.$transaction(async (tx) => {
      await tx.scoreCard.deleteMany({ where: { examId, stage: 'FINAL' } });
      await tx.scoreCard.createMany({ data: merit.map((m) => ({ applicationId: m.id, examId, stage: 'FINAL', raw: m.final, normalised: m.final, percentile: null, sectionScores: { written: m.written, interview: m.interview ?? 0 }, rank: m.rank, categoryRank: m.categoryRank, qualified: m.qualified })) });
      const run = { cutoffs: cutoffs as Prisma.InputJsonValue, stats: { candidates: merit.length, writtenMax, interviewMax, weights: `${exam.writtenWeight}:${exam.interviewWeight}` }, anomalies: [], computedById: adminId, computedAt: new Date(), status: 'DRAFT', rejectNote: null };
      await tx.resultRun.upsert({ where: { examId_stage: { examId, stage: 'FINAL' } }, create: { examId, stage: 'FINAL', ...run }, update: run });
      await this.audit.log({ action: 'RESULT_COMPUTED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { stage: 'FINAL', candidates: merit.length } }, tx);
    });
    return this.get(examId, 'FINAL');
  }

  async get(examId: string, stage: string) {
    const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId, stage } } });
    const cards = await this.prisma.scoreCard.findMany({ where: { examId, stage }, orderBy: [{ rank: { sort: 'asc', nulls: 'last' } }], take: 500, include: { application: { include: { admitCard: true } } } });
    const rows = await Promise.all(cards.map(async (c) => {
      const v = await this.snap(c.application);
      return { id: c.id, applicationId: c.applicationId, rollNo: c.application.admitCard?.rollNo ?? null, name: v.personal.fullName, category: v.category.category, raw: c.raw, normalised: c.normalised, percentile: c.percentile, correct: c.correct, wrong: c.wrong, rank: c.rank, categoryRank: c.categoryRank, qualified: c.qualified, withheld: c.withheld, sectionScores: c.sectionScores };
    }));
    const admins = new Map((await this.prisma.adminUser.findMany({ where: { id: { in: [run?.computedById, run?.approvedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
    return { run: run ? { ...run, computedBy: run.computedById ? admins.get(run.computedById) : null, approvedBy: run.approvedById ? admins.get(run.approvedById) : null } : null, rows };
  }

  async runs(examId: string) {
    return this.prisma.resultRun.findMany({ where: { examId }, orderBy: { createdAt: 'asc' } });
  }

  async submit(adminId: string, examId: string, stage: string) {
    const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId, stage } } });
    if (run?.status !== 'DRAFT') throw new AppError('INVALID_STATE', 'Only a computed draft can be sent for approval.', 409);
    await this.prisma.resultRun.update({ where: { id: run.id }, data: { status: 'PENDING_APPROVAL', submittedAt: new Date() } });
    await this.audit.log({ action: 'RESULT_SUBMITTED', entity: 'ResultRun', entityId: run.id, actorType: 'ADMIN', actorId: adminId, after: { stage } });
    return { ok: true };
  }

  /** Maker-checker: the officer who computed the result cannot approve it. */
  async decide(adminId: string, examId: string, stage: string, body: unknown) {
    const x = parseOrThrow(z.object({ approve: z.boolean(), note: z.string().max(500).optional() }), body);
    const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId, stage } } });
    if (run?.status !== 'PENDING_APPROVAL') throw new AppError('INVALID_STATE', 'This result is not awaiting approval.', 409);
    if (run.computedById === adminId) throw new AppError('MAKER_CHECKER', 'A different officer must approve the result you computed.', 403);
    await this.prisma.resultRun.update({ where: { id: run.id }, data: x.approve ? { status: 'APPROVED', approvedById: adminId, approvedAt: new Date() } : { status: 'DRAFT', rejectNote: x.note ?? 'Returned for correction' } });
    await this.audit.log({ action: x.approve ? 'RESULT_APPROVED' : 'RESULT_RETURNED', entity: 'ResultRun', entityId: run.id, actorType: 'ADMIN', actorId: adminId, after: { stage, ...x } });
    return { ok: true };
  }

  async publish(adminId: string, examId: string, stage: ResultStage) {
    const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId, stage } } });
    if (run?.status !== 'APPROVED') throw new AppError('INVALID_STATE', 'Approve the result before publishing.', 409);
    const now = new Date();
    const cards = await this.prisma.scoreCard.findMany({ where: { examId, stage }, include: { application: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.scoreCard.updateMany({ where: { examId, stage }, data: { publishedAt: now } });
      await tx.resultRun.update({ where: { id: run.id }, data: { status: 'PUBLISHED', publishedAt: now } });
      // Summary result on the application (status shown on the candidate dashboard).
      for (const c of cards) {
        const status = c.withheld ? 'WITHHELD' : c.qualified ? 'QUALIFIED' : 'NOT_QUALIFIED';
        await tx.result.upsert({ where: { applicationId: c.applicationId }, create: { applicationId: c.applicationId, status, score: c.normalised ?? c.raw, rank: c.rank }, update: { status, score: c.normalised ?? c.raw, rank: c.rank, publishedAt: now } });
      }
      if (cards.length) await tx.notification.createMany({ data: cards.map((c) => ({ candidateId: c.application.candidateId, titleKey: 'notifications.resultPublished', params: { stage }, link: `/results/${c.applicationId}` })) });
      await tx.exam.update({ where: { id: examId }, data: { resultsPublishedAt: now } });
      await this.audit.log({ action: 'RESULT_PUBLISHED', entity: 'ResultRun', entityId: run.id, actorType: 'ADMIN', actorId: adminId, after: { stage, count: cards.length } }, tx);
    });
    return { published: cards.length };
  }

  /** Candidate: published score cards across stages. */
  async mine(candidateId: string, applicationId?: string) {
    const cards = await this.prisma.scoreCard.findMany({ where: { application: { candidateId }, publishedAt: { not: null }, ...(applicationId && { applicationId }) }, include: { application: { include: { exam: { select: { id: true, code: true, titleEn: true, titleHi: true, stages: true } } } } }, orderBy: { publishedAt: 'asc' } });
    const runs = await this.prisma.resultRun.findMany({ where: { examId: { in: [...new Set(cards.map((c) => c.examId))] }, status: 'PUBLISHED' } });
    return cards.map((c) => ({
      id: c.id, applicationId: c.applicationId, exam: c.application.exam, stage: c.stage, raw: c.raw, normalised: c.normalised, percentile: c.percentile, correct: c.correct, wrong: c.wrong, unattempted: c.unattempted,
      sectionScores: Object.fromEntries(Object.entries((c.sectionScores ?? {}) as Record<string, number>).filter(([k]) => !k.startsWith('_'))), rank: c.rank, categoryRank: c.categoryRank, qualified: c.qualified, withheld: c.withheld, publishedAt: c.publishedAt,
      cutoffs: runs.find((r) => r.examId === c.examId && r.stage === c.stage)?.cutoffs ?? {},
    }));
  }
}
