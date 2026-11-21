import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { answerKeySchema, applyKeyChanges, itemAnalysis, objectionCreateSchema, objectionDecisionSchema, paperSchema, scoreResponses, type AnswerKey } from '@vtl/shared';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { AiService } from './ai.service';
import { daysFromNow, notFound } from './common';

const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  // ── Papers and keys (admin) ──
  async papers(examId: string) {
    const shifts = await this.prisma.examShift.findMany({ where: { examId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
    const papers = await this.prisma.examPaper.findMany({ where: { examId } });
    const sheets = await this.prisma.responseSheet.groupBy({ by: ['shiftId'], where: { shiftId: { in: shifts.map((s) => s.id) } }, _count: true });
    const objections = await this.prisma.objection.groupBy({ by: ['paperId', 'status'], where: { examId }, _count: true });
    return shifts.map((s) => {
      const p = papers.find((x) => x.shiftId === s.id) ?? null;
      return { shift: s, paper: p, responseSheets: sheets.find((x) => x.shiftId === s.id)?._count ?? 0, objections: p ? Object.fromEntries(objections.filter((o) => o.paperId === p.id).map((o) => [o.status, o._count])) : {} };
    });
  }

  async upsertPaper(adminId: string, shiftId: string, body: unknown) {
    const x = parseOrThrow(paperSchema, body);
    for (const s of x.sections) if (s.from > s.to || s.to > x.questionCount) throw new AppError('INVALID_SECTION', `Section ${s.name} is outside 1-${x.questionCount}.`);
    const shift = await this.prisma.examShift.findUnique({ where: { id: shiftId } });
    if (!shift) notFound('Shift');
    const existing = await this.prisma.examPaper.findUnique({ where: { shiftId } });
    if (existing?.provisionalPublishedAt) throw new AppError('LOCKED', 'The scheme cannot change after the provisional key is published.', 409);
    const p = await this.prisma.examPaper.upsert({ where: { shiftId }, create: { ...x, shiftId, examId: shift.examId }, update: x });
    await this.audit.log({ action: 'PAPER_SCHEME_SAVED', entity: 'ExamPaper', entityId: p.id, actorType: 'ADMIN', actorId: adminId, after: x });
    return p;
  }

  async publishProvisionalKey(adminId: string, paperId: string, body: unknown) {
    const x = parseOrThrow(answerKeySchema, body);
    const p = await this.prisma.examPaper.findUnique({ where: { id: paperId } });
    if (!p) notFound('Paper');
    if (p.finalPublishedAt) throw new AppError('LOCKED', 'The final key is already published.', 409);
    const missing = Array.from({ length: p.questionCount }, (_, i) => String(i + 1)).filter((q) => !x.key[q]);
    if (missing.length) throw new AppError('KEY_INCOMPLETE', `Key missing for question(s) ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}.`);
    const u = await this.prisma.examPaper.update({ where: { id: p.id }, data: { provisionalKey: x.key, provisionalPublishedAt: new Date(), objectionDeadline: daysFromNow(x.objectionDays) } });
    const cands = await this.prisma.responseSheet.findMany({ where: { shiftId: p.shiftId }, select: { admitCard: { select: { application: { select: { id: true, candidateId: true } } } } } });
    if (cands.length) await this.prisma.notification.createMany({ data: cands.map((c) => ({ candidateId: c.admitCard.application.candidateId, titleKey: 'notifications.answerKey', params: { days: x.objectionDays }, link: `/results/${c.admitCard.application.id}` })) });
    await this.audit.log({ action: 'PROVISIONAL_KEY_PUBLISHED', entity: 'ExamPaper', entityId: p.id, actorType: 'ADMIN', actorId: adminId, after: { deadline: u.objectionDeadline, notified: cands.length } });
    return u;
  }

  async publishFinalKey(adminId: string, paperId: string) {
    const p = await this.prisma.examPaper.findUnique({ where: { id: paperId } });
    if (!p?.provisionalKey) throw new AppError('NO_KEY', 'Publish the provisional key first.');
    if (p.objectionDeadline && p.objectionDeadline > new Date()) throw new AppError('WINDOW_OPEN', 'The objection window is still open.', 409);
    const pending = await this.prisma.objection.count({ where: { paperId, status: 'SUBMITTED' } });
    if (pending) throw new AppError('OBJECTIONS_PENDING', `${pending} objection(s) still need a decision.`, 409);
    const changes = (p.changes as Array<{ qno: number; to: string[] | 'DROP' }>) ?? [];
    const { key, dropped } = applyKeyChanges(p.provisionalKey as AnswerKey, changes);
    const u = await this.prisma.examPaper.update({ where: { id: p.id }, data: { finalKey: key, dropped, finalPublishedAt: new Date() } });
    await this.audit.log({ action: 'FINAL_KEY_PUBLISHED', entity: 'ExamPaper', entityId: p.id, actorType: 'ADMIN', actorId: adminId, after: { changes: changes.length, dropped } });
    return u;
  }

  // ── Candidate: response sheet, OMR carbon copy, objections ──
  private async candidateSheet(candidateId: string, applicationId: string) {
    const app = await this.prisma.application.findFirst({ where: { id: applicationId, candidateId }, include: { exam: true, admitCard: { include: { responseSheet: true, shift: true, attendance: true } } } });
    if (!app) notFound('Application');
    const ac = app.admitCard;
    const paper = ac?.shiftId ? await this.prisma.examPaper.findUnique({ where: { shiftId: ac.shiftId } }) : null;
    return { app, ac, sheet: ac?.responseSheet ?? null, paper };
  }

  async responseSheet(candidateId: string, applicationId: string) {
    const { app, ac, sheet, paper } = await this.candidateSheet(candidateId, applicationId);
    const keyPublished = !!paper?.provisionalPublishedAt;
    const key = (paper?.finalKey ?? (keyPublished ? paper?.provisionalKey : null)) as AnswerKey | null;
    const breakdown = sheet && key && paper ? scoreResponses(sheet.responses as Record<string, string | null>, key, { questionCount: paper.questionCount, marksCorrect: paper.marksCorrect, marksWrong: paper.marksWrong, dropped: paper.finalPublishedAt ? paper.dropped : [], sections: paper.sections as Array<{ name: string; from: number; to: number }> }) : null;
    const objections = await this.prisma.objection.findMany({ where: { applicationId }, orderBy: { qno: 'asc' } });
    return {
      exam: { id: app.examId, code: app.exam.code, title: app.exam.titleEn, objectionFee: app.exam.objectionFee },
      rollNo: ac?.rollNo ?? null, shift: ac?.shift ?? null, attendance: ac?.attendance?.status ?? null,
      sheet: sheet ? { source: sheet.source, responses: sheet.responses, receivedAt: sheet.receivedAt, carbonCopy: !!sheet.carbonCopyKey, carbonUploadedAt: sheet.carbonUploadedAt } : null,
      paper: paper ? { id: paper.id, questionCount: paper.questionCount, marksCorrect: paper.marksCorrect, marksWrong: paper.marksWrong, sections: paper.sections, provisionalPublishedAt: paper.provisionalPublishedAt, objectionDeadline: paper.objectionDeadline, finalPublishedAt: paper.finalPublishedAt, dropped: paper.finalPublishedAt ? paper.dropped : [] } : null,
      key, keyType: paper?.finalPublishedAt ? 'FINAL' : keyPublished ? 'PROVISIONAL' : null,
      provisionalKey: keyPublished ? paper?.provisionalKey ?? null : null,
      breakdown, objections,
      objectionWindowOpen: !!paper?.objectionDeadline && paper.objectionDeadline > new Date() && !paper.finalPublishedAt,
    };
  }

  async uploadCarbon(candidateId: string, applicationId: string, file: Express.Multer.File | undefined) {
    const { ac, sheet } = await this.candidateSheet(candidateId, applicationId);
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Choose the scan of your OMR candidate copy.' });
    if (!ac?.shift || ac.shift.mode !== 'OMR') throw new AppError('NOT_OMR', 'Carbon copies apply only to OMR (pen and paper) exams.');
    if (!sheet) throw new AppError('NO_SHEET', 'Your OMR sheet has not been processed yet. Try again after it appears here.');
    const buf = file.buffer;
    if (!isJpeg(buf) && !isPdf(buf)) throw new AppError('INVALID_FILE_TYPE', 'Upload a JPEG image or a PDF.');
    if (buf.length > 5 * 1024 * 1024) throw new AppError('INVALID_SIZE', 'File must be 5 MB or smaller.');
    const key = `candidates/${candidateId}/omr/${randomUUID()}.${isPdf(buf) ? 'pdf' : 'jpg'}`;
    await this.storage.put(key, buf, isPdf(buf) ? 'application/pdf' : 'image/jpeg');
    await this.prisma.responseSheet.update({ where: { id: sheet.id }, data: { carbonCopyKey: key, carbonUploadedAt: new Date() } });
    await this.audit.log({ action: 'OMR_CARBON_UPLOADED', entity: 'ResponseSheet', entityId: sheet.id, actorType: 'CANDIDATE', actorId: candidateId });
    return { ok: true };
  }

  async createObjection(candidateId: string, applicationId: string, body: unknown) {
    const x = parseOrThrow(objectionCreateSchema, body);
    const { app, sheet, paper } = await this.candidateSheet(candidateId, applicationId);
    if (!paper?.provisionalPublishedAt || !paper.provisionalKey) throw new AppError('NO_KEY', 'The answer key is not published yet.');
    if (!paper.objectionDeadline || paper.objectionDeadline < new Date() || paper.finalPublishedAt) throw new AppError('OBJECTION_CLOSED', 'The objection window has closed.');
    if (!sheet) throw new AppError('NOT_APPEARED', 'Only candidates who took the exam can raise objections.');
    if (x.qno > paper.questionCount) throw new AppError('INVALID_QUESTION', `Question must be between 1 and ${paper.questionCount}.`);
    const keyed = ((paper.provisionalKey as AnswerKey)[String(x.qno)] ?? []).slice().sort().join(',');
    if (x.claimedOptions.slice().sort().join(',') === keyed) throw new AppError('SAME_AS_KEY', 'The option you claim is already the published answer.');
    const fee = app.exam.objectionFee;
    const o = await this.prisma.objection.create({ data: { examId: app.examId, paperId: paper.id, applicationId, candidateId, qno: x.qno, claimedOptions: x.claimedOptions, reasoning: x.reasoning, fee, status: fee > 0 ? 'PAYMENT_PENDING' : 'SUBMITTED' } });
    await this.audit.log({ action: 'OBJECTION_CREATED', entity: 'Objection', entityId: o.id, actorType: 'CANDIDATE', actorId: candidateId, after: { qno: x.qno, claimed: x.claimedOptions } });
    return o;
  }

  async withdrawObjection(candidateId: string, id: string) {
    const o = await this.prisma.objection.findFirst({ where: { id, candidateId, status: 'PAYMENT_PENDING' } });
    if (!o) throw new AppError('NOT_WITHDRAWABLE', 'Only unpaid objections can be withdrawn.', 409);
    await this.prisma.objection.delete({ where: { id } });
    return { ok: true };
  }

  // ── Objection review (admin / expert committee) ──
  async objectionSummary(examId: string) {
    const rows = await this.prisma.objection.findMany({ where: { examId, status: { in: ['SUBMITTED', 'ACCEPTED', 'REJECTED'] } }, orderBy: [{ paperId: 'asc' }, { qno: 'asc' }] });
    const papers = new Map((await this.prisma.examPaper.findMany({ where: { examId } })).map((p) => [p.id, p]));
    const shifts = new Map((await this.prisma.examShift.findMany({ where: { examId } })).map((s) => [s.id, s]));
    const groups = new Map<string, { paperId: string; shift: string; qno: number; key: string[]; count: number; claims: Record<string, number>; statuses: Record<string, number>; aiReview: unknown; samples: string[] }>();
    for (const o of rows) {
      const k = `${o.paperId}:${o.qno}`;
      const p = papers.get(o.paperId)!;
      const g = groups.get(k) ?? { paperId: o.paperId, shift: shifts.get(p.shiftId)?.code ?? '', qno: o.qno, key: (p.provisionalKey as AnswerKey)[String(o.qno)] ?? [], count: 0, claims: {}, statuses: {}, aiReview: null, samples: [] };
      g.count++;
      const c = o.claimedOptions.join('+');
      g.claims[c] = (g.claims[c] ?? 0) + 1;
      g.statuses[o.status] = (g.statuses[o.status] ?? 0) + 1;
      if (o.aiReview) g.aiReview = o.aiReview;
      if (g.samples.length < 3) g.samples.push(o.reasoning.slice(0, 400));
      groups.set(k, g);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }

  /**
   * Pre-review for the expert committee: classical item analysis of how top and bottom scorers answered,
   * plus a summary of candidates' arguments. Advisory only.
   */
  async preReview(adminId: string, paperId: string, qno: number) {
    const paper = await this.prisma.examPaper.findUnique({ where: { id: paperId } });
    if (!paper?.provisionalKey) notFound('Paper with provisional key');
    const key = paper.provisionalKey as AnswerKey;
    const sheets = await this.prisma.responseSheet.findMany({ where: { shiftId: paper.shiftId }, select: { responses: true } });
    const scheme = { questionCount: paper.questionCount, marksCorrect: paper.marksCorrect, marksWrong: paper.marksWrong };
    const scored = sheets.map((s) => ({ total: scoreResponses(s.responses as Record<string, string>, key, scheme).raw, responses: s.responses as Record<string, string> }));
    const stats = itemAnalysis(scored, qno, key[String(qno)] ?? []);
    const objections = await this.prisma.objection.findMany({ where: { paperId, qno, status: { in: ['SUBMITTED', 'ACCEPTED', 'REJECTED'] } }, select: { claimedOptions: true, reasoning: true } });
    const claims: Record<string, number> = {};
    for (const o of objections) claims[o.claimedOptions.join('+')] = (claims[o.claimedOptions.join('+')] ?? 0) + 1;
    const top = Object.entries(claims).sort((a, b) => b[1] - a[1])[0];

    const signals: string[] = [];
    if (stats.suspectKey) signals.push(`Top scorers mostly chose ${stats.topChoice} (${Math.round(stats.topChoiceShare * 100)}%) rather than the keyed answer, and the item does not discriminate (index ${stats.discrimination}). The key may be wrong.`);
    if (stats.discrimination < 0) signals.push('Negative discrimination: weaker candidates answered "correctly" more often than strong ones.');
    if (stats.difficulty < 0.1) signals.push(`Only ${Math.round(stats.difficulty * 100)}% matched the key: check for an ambiguous or incorrect question.`);
    if (top && top[1] >= Math.max(3, objections.length * 0.6)) signals.push(`${top[1]} of ${objections.length} objections claim ${top[0]}.`);
    let recommendation: 'REVIEW_CHANGE' | 'REVIEW_DROP' | 'LIKELY_REJECT' = 'LIKELY_REJECT';
    if (stats.suspectKey) recommendation = 'REVIEW_CHANGE';
    else if (stats.discrimination < 0 || stats.difficulty < 0.1) recommendation = 'REVIEW_DROP';

    let summary = objections.length ? `${objections.length} objection(s). Most common claim: ${top?.[0] ?? '-'}.` : 'No objections.';
    const ai = objections.length
      ? await this.ai.complete(
          'You assist an expert committee reviewing objections to an exam answer key. Summarise the candidates\' arguments neutrally in at most 120 words, grouped by claimed option. Do not decide; note any argument that cites a source or points to an ambiguity in the question. Plain text, no markdown.',
          [{ role: 'user', content: `Question ${qno}. Keyed answer: ${(key[String(qno)] ?? []).join(', ')}. Item statistics: ${JSON.stringify(stats)}.\n\nObjections:\n${objections.slice(0, 60).map((o, i) => `${i + 1}. Claims ${o.claimedOptions.join('+')}: ${o.reasoning.slice(0, 800)}`).join('\n')}` }],
          { maxTokens: 800 },
        )
      : null;
    if (ai?.text) summary = ai.text;
    const review = { at: new Date().toISOString(), provider: ai?.text ? ai.provider : 'rules', stats, claims, signals, recommendation, summary };
    await this.prisma.objection.updateMany({ where: { paperId, qno }, data: { aiReview: review as Prisma.InputJsonValue } });
    await this.audit.log({ action: 'OBJECTION_PRE_REVIEW', entity: 'ExamPaper', entityId: paperId, actorType: 'ADMIN', actorId: adminId, after: { qno, recommendation } });
    return review;
  }

  async decide(adminId: string, paperId: string, qno: number, body: unknown) {
    const x = parseOrThrow(objectionDecisionSchema, body);
    const paper = await this.prisma.examPaper.findUnique({ where: { id: paperId } });
    if (!paper) notFound('Paper');
    if (paper.finalPublishedAt) throw new AppError('LOCKED', 'The final key is already published.', 409);
    const accepted = x.decision !== 'REJECT';
    const changes = ((paper.changes as Array<{ qno: number }>) ?? []).filter((c) => c.qno !== qno);
    if (accepted) changes.push({ qno, to: x.decision === 'DROP' ? 'DROP' : x.newOptions!, reason: x.note, at: new Date().toISOString(), by: adminId } as never);
    await this.prisma.$transaction(async (tx) => {
      await tx.examPaper.update({ where: { id: paperId }, data: { changes: changes as Prisma.InputJsonValue } });
      const objs = await tx.objection.findMany({ where: { paperId, qno, status: { in: ['SUBMITTED', 'ACCEPTED', 'REJECTED'] } } });
      for (const o of objs) {
        // An accepted objection is one whose claim matches the decision (or any claim when the question is dropped).
        const match = x.decision === 'DROP' || (x.decision === 'CHANGE_KEY' && o.claimedOptions.slice().sort().join() === x.newOptions!.slice().sort().join());
        const status = accepted && match ? 'ACCEPTED' : 'REJECTED';
        await tx.objection.update({ where: { id: o.id }, data: { status, decisionNote: x.note, decidedById: adminId, decidedAt: new Date() } });
        if (status === 'ACCEPTED' && o.paymentId) await tx.payment.updateMany({ where: { id: o.paymentId, status: 'SUCCESS' }, data: { status: 'REFUND_MARKED', refundMarkedAt: new Date(), refundNote: 'Objection accepted: fee refundable' } });
      }
      await this.audit.log({ action: `OBJECTION_${x.decision}`, entity: 'ExamPaper', entityId: paperId, actorType: 'ADMIN', actorId: adminId, after: { qno, ...x } }, tx);
    });
    return { ok: true };
  }
}
