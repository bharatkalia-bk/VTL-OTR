import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { allot, dvScheduleSchema, dvUpdateSchema, panelMarkSchema, panelSchema, preferencesSchema, shortlistSchema, vacancySchema, type Category } from '@vtl/shared';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { FieldCrypto } from '../../security/field-crypto';
import type { AccessClaims } from '../../security/tokens.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { AiService } from './ai.service';
import { notFound, snapshotOf } from './common';

@Injectable()
export class SelectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
    private readonly data: CandidateDataService,
    private readonly ai: AiService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  private async seatsByCategory(examId: string): Promise<Partial<Record<Category, number>>> {
    const rows = await this.prisma.vacancyRow.findMany({ where: { examId } });
    const out: Partial<Record<Category, number>> = {};
    if (rows.length) for (const r of rows) out[r.category as Category] = (out[r.category as Category] ?? 0) + r.count;
    else for (const p of await this.prisma.post.findMany({ where: { examId } })) for (const [k, v] of Object.entries(p.vacancies as Record<string, number>)) out[k as Category] = (out[k as Category] ?? 0) + Number(v);
    return out;
  }

  // ── Shortlisting for the next stage ──
  async shortlist(adminId: string, examId: string, body: unknown) {
    const x = parseOrThrow(shortlistSchema, body);
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const idx = exam.stages.indexOf(x.toStage);
    if (idx <= 0) throw new AppError('INVALID_STAGE', `${x.toStage} is not a later stage of this exam.`);
    const prev = exam.stages[idx - 1]!;
    const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId, stage: prev } } });
    if (run?.status !== 'PUBLISHED') throw new AppError('STAGE_PENDING', `Publish the ${prev} result first.`);
    const cards = await this.prisma.scoreCard.findMany({ where: { examId, stage: prev, qualified: true, withheld: false }, orderBy: { rank: 'asc' }, include: { application: { include: { admitCard: true } } } });
    const seats = await this.seatsByCategory(examId);
    const picked = new Set<string>();
    // Unreserved list on merit first (open to all), then each category's own list by category rank.
    const genN = Math.ceil((seats.GEN ?? 0) * x.multiplier);
    for (const c of cards.slice(0, genN)) picked.add(c.applicationId);
    const cats = new Map<string, Category>();
    for (const c of cards) cats.set(c.applicationId, ((await snapshotOf(this.crypto, this.data, c.application)).category.category ?? 'GEN') as Category);
    for (const cat of Object.keys(seats) as Category[]) {
      if (cat === 'GEN') continue;
      const n = Math.ceil((seats[cat] ?? 0) * x.multiplier);
      let added = 0;
      for (const c of cards) { if (added >= n) break; if (cats.get(c.applicationId) === cat && !picked.has(c.applicationId)) { picked.add(c.applicationId); added++; } }
    }
    const chosen = cards.filter((c) => picked.has(c.applicationId));
    await this.prisma.stageCall.createMany({ data: chosen.map((c) => ({ applicationId: c.applicationId, examId, stage: x.toStage, rollNo: c.application.admitCard?.rollNo, venue: x.venue })), skipDuplicates: true });
    await this.audit.log({ action: 'SHORTLISTED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { stage: x.toStage, count: chosen.length, multiplier: x.multiplier } });
    return { shortlisted: chosen.length, seats };
  }

  async calls(examId: string, stage: string) {
    const rows = await this.prisma.stageCall.findMany({ where: { examId, stage }, orderBy: { rollNo: 'asc' } });
    const apps = new Map((await this.prisma.application.findMany({ where: { id: { in: rows.map((r) => r.applicationId) } } })).map((a) => [a.id, a]));
    const panels = new Map((await this.prisma.interviewPanel.findMany({ where: { examId } })).map((p) => [p.id, p.name]));
    return Promise.all(rows.map(async (r) => {
      const v = await snapshotOf(this.crypto, this.data, apps.get(r.applicationId)!);
      return { ...r, name: v.personal.fullName, category: v.category.category, panel: r.panelId ? panels.get(r.panelId) ?? null : null };
    }));
  }

  async releaseLetters(adminId: string, examId: string, stage: string) {
    const calls = await this.prisma.stageCall.findMany({ where: { examId, stage, letterReleasedAt: null } });
    if (stage === 'INTERVIEW' && calls.some((c) => !c.panelId || !c.slotAt)) throw new AppError('UNSCHEDULED', 'Assign every shortlisted candidate to a panel and slot first.');
    const now = new Date();
    await this.prisma.stageCall.updateMany({ where: { id: { in: calls.map((c) => c.id) } }, data: { status: 'CALLED', letterReleasedAt: now } });
    const apps = await this.prisma.application.findMany({ where: { id: { in: calls.map((c) => c.applicationId) } }, select: { id: true, candidateId: true } });
    if (apps.length) await this.prisma.notification.createMany({ data: apps.map((a) => ({ candidateId: a.candidateId, titleKey: 'notifications.callLetter', params: { stage }, link: `/selection/${a.id}` })) });
    await this.audit.log({ action: 'CALL_LETTERS_RELEASED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { stage, count: calls.length } });
    return { released: calls.length };
  }

  // ── Interview panels ──
  async createPanel(adminId: string, examId: string, body: unknown) {
    const x = parseOrThrow(panelSchema, body);
    const members = await this.prisma.adminUser.findMany({ where: { id: { in: x.memberIds } } });
    if (members.length !== x.memberIds.length || members.some((m) => !m.roles.includes('INTERVIEW_PANEL'))) throw new AppError('NOT_PANELIST', 'Every member must have the Interview Panel role.');
    const p = await this.prisma.interviewPanel.create({ data: { ...x, examId } });
    await this.audit.log({ action: 'PANEL_CREATED', entity: 'InterviewPanel', entityId: p.id, actorType: 'ADMIN', actorId: adminId, after: { name: x.name, members: x.memberIds.length } });
    return p;
  }

  async panels(examId: string) {
    const ps = await this.prisma.interviewPanel.findMany({ where: { examId }, orderBy: { createdAt: 'asc' } });
    const members = new Map((await this.prisma.adminUser.findMany({ where: { id: { in: ps.flatMap((p) => p.memberIds) } }, select: { id: true, name: true } })).map((m) => [m.id, m.name]));
    const counts = await this.prisma.stageCall.groupBy({ by: ['panelId'], where: { examId, stage: 'INTERVIEW' }, _count: true });
    return ps.map((p) => ({ ...p, members: p.memberIds.map((id) => ({ id, name: members.get(id) ?? id })), candidates: counts.find((c) => c.panelId === p.id)?._count ?? 0 }));
  }

  /** Distributes interview candidates across panels in 20-minute slots from 09:30 IST. */
  async scheduleInterviews(adminId: string, examId: string) {
    const panels = await this.prisma.interviewPanel.findMany({ where: { examId }, orderBy: { createdAt: 'asc' } });
    if (!panels.length) throw new AppError('NO_PANELS', 'Create at least one interview panel first.');
    const calls = await this.prisma.stageCall.findMany({ where: { examId, stage: 'INTERVIEW' }, orderBy: { rollNo: 'asc' } });
    const perPanel = new Map<string, number>();
    for (let i = 0; i < calls.length; i++) {
      const p = panels[i % panels.length]!;
      const n = perPanel.get(p.id) ?? 0;
      perPanel.set(p.id, n + 1);
      const slot = new Date(`${p.date}T09:30:00+05:30`);
      slot.setMinutes(slot.getMinutes() + n * 20 + (n >= 12 ? 60 : 0)); // lunch break after 12 interviews
      await this.prisma.stageCall.update({ where: { id: calls[i]!.id }, data: { panelId: p.id, slotAt: slot, venue: p.venue } });
    }
    await this.audit.log({ action: 'INTERVIEWS_SCHEDULED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { candidates: calls.length, panels: panels.length } });
    return { scheduled: calls.length };
  }

  /** Panel member workspace: only own panels, no category or community details (bias control). */
  async myPanels(u: AccessClaims) {
    const panels = await this.prisma.interviewPanel.findMany({ where: { memberIds: { has: u.sub } }, orderBy: { date: 'asc' } });
    const exams = new Map((await this.prisma.exam.findMany({ where: { id: { in: panels.map((p) => p.examId) } }, select: { id: true, code: true, titleEn: true } })).map((e) => [e.id, e]));
    return Promise.all(panels.map(async (p) => {
      const calls = await this.prisma.stageCall.findMany({ where: { panelId: p.id }, orderBy: { slotAt: 'asc' } });
      const mine = new Map((await this.prisma.panelMark.findMany({ where: { panelId: p.id, memberId: u.sub } })).map((m) => [m.stageCallId, m]));
      const candidates = await Promise.all(calls.map(async (c) => {
        const app = await this.prisma.application.findUniqueOrThrow({ where: { id: c.applicationId } });
        const v = await snapshotOf(this.crypto, this.data, app);
        return {
          stageCallId: c.id, rollNo: c.rollNo, slotAt: c.slotAt, status: c.status, name: v.personal.fullName,
          photo: app.photoKey ? await this.storage.signedUrl(app.photoKey, 600) : null,
          education: v.education.map((e) => ({ level: e.level, name: e.qualificationName, year: e.yearOfPassing, board: e.boardOrUniversity })),
          myMarks: mine.get(c.id) ?? null,
        };
      }));
      const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId: p.examId, stage: 'INTERVIEW' } } });
      return { ...p, exam: exams.get(p.examId) ?? null, candidates, locked: !!run && run.status !== 'DRAFT' };
    }));
  }

  async submitMarks(u: AccessClaims, stageCallId: string, body: unknown) {
    const x = parseOrThrow(panelMarkSchema, body);
    const call = await this.prisma.stageCall.findUnique({ where: { id: stageCallId } });
    const panel = call?.panelId ? await this.prisma.interviewPanel.findUnique({ where: { id: call.panelId } }) : null;
    if (!call || !panel || !panel.memberIds.includes(u.sub)) throw new AppError('OUT_OF_SCOPE', 'This candidate is not on your panel.', 403);
    const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId: call.examId, stage: 'INTERVIEW' } } });
    if (run && run.status !== 'DRAFT') throw new AppError('LOCKED', 'Interview marks are locked: the result is in approval or published.', 409);
    const criteria = panel.criteria as Array<{ key: string; label: string; max: number }>;
    let total = 0;
    for (const c of criteria) {
      const v = x.marks[c.key];
      if (v === undefined) throw new AppError('MARKS_INCOMPLETE', `Enter marks for ${c.label}.`);
      if (v > c.max) throw new AppError('MARKS_TOO_HIGH', `${c.label} is out of ${c.max}.`);
      total += v;
    }
    const m = await this.prisma.panelMark.upsert({ where: { stageCallId_memberId: { stageCallId, memberId: u.sub } }, create: { panelId: panel.id, stageCallId, memberId: u.sub, marks: x.marks, total, remarks: x.remarks }, update: { marks: x.marks, total, remarks: x.remarks, submittedAt: new Date() } });
    await this.prisma.stageCall.update({ where: { id: stageCallId }, data: { status: 'APPEARED' } });
    await this.audit.log({ action: 'INTERVIEW_MARKS_SUBMITTED', entity: 'StageCall', entityId: stageCallId, actorType: 'ADMIN', actorId: u.sub, after: { total } });
    return m;
  }

  async markAbsent(u: AccessClaims, stageCallId: string) {
    const call = await this.prisma.stageCall.findUnique({ where: { id: stageCallId } });
    const panel = call?.panelId ? await this.prisma.interviewPanel.findUnique({ where: { id: call.panelId } }) : null;
    if (!call || !panel || !panel.memberIds.includes(u.sub)) throw new AppError('OUT_OF_SCOPE', 'This candidate is not on your panel.', 403);
    return this.prisma.stageCall.update({ where: { id: stageCallId }, data: { status: 'ABSENT' } });
  }

  /** Short neutral brief for the panel, built from the education record only. */
  async interviewBrief(u: AccessClaims, stageCallId: string) {
    const call = await this.prisma.stageCall.findUnique({ where: { id: stageCallId } });
    const panel = call?.panelId ? await this.prisma.interviewPanel.findUnique({ where: { id: call.panelId } }) : null;
    if (!call || !panel || !panel.memberIds.includes(u.sub)) throw new AppError('OUT_OF_SCOPE', 'This candidate is not on your panel.', 403);
    const app = await this.prisma.application.findUniqueOrThrow({ where: { id: call.applicationId }, include: { exam: { include: { posts: true } } } });
    const v = await snapshotOf(this.crypto, this.data, app);
    const post = app.exam.posts.filter((p) => app.postIds.includes(p.id)).map((p) => p.titleEn).join(', ');
    const edu = v.education.map((e) => `${e.qualificationName} (${e.level}), ${e.boardOrUniversity}, ${e.yearOfPassing}`);
    const fallback = { provider: 'rules', points: [`Applied for: ${post || app.exam.titleEn}.`, ...edu.map((e) => `Education: ${e}.`), 'Suggested areas: subject knowledge for the post, current affairs, communication, situational judgement.'] };
    const ai = await this.ai.complete(
      'You prepare a neutral one-paragraph interview brief for a government recruitment panel. Use only the education history and post given. Never mention or infer caste, religion, gender, region or family. Suggest three question areas related to the post. Plain text, under 100 words.',
      [{ role: 'user', content: `Post: ${post || app.exam.titleEn}\nEducation:\n${edu.join('\n')}` }],
      { maxTokens: 500 },
    );
    return ai?.text ? { provider: ai.provider, points: [ai.text] } : fallback;
  }

  // ── Vacancies, preferences, allotment ──
  async setVacancies(adminId: string, examId: string, body: unknown) {
    const x = parseOrThrow(vacancySchema, body);
    const posts = new Set((await this.prisma.post.findMany({ where: { examId } })).map((p) => p.id));
    if (x.rows.some((r) => !posts.has(r.postId))) throw new AppError('INVALID_POST', 'Every row must refer to a post of this exam.');
    await this.prisma.$transaction([this.prisma.vacancyRow.deleteMany({ where: { examId } }), this.prisma.vacancyRow.createMany({ data: x.rows.map((r) => ({ ...r, examId })) })]);
    await this.audit.log({ action: 'VACANCIES_SET', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { rows: x.rows.length, total: x.rows.reduce((a, b) => a + b.count, 0) } });
    return this.vacancies(examId);
  }

  async vacancies(examId: string) {
    const rows = await this.prisma.vacancyRow.findMany({ where: { examId }, orderBy: [{ orgCode: 'asc' }, { category: 'asc' }] });
    const posts = new Map((await this.prisma.post.findMany({ where: { examId } })).map((p) => [p.id, p]));
    const filled = await this.prisma.allotment.groupBy({ by: ['postId', 'orgCode', 'category'], where: { examId, status: { notIn: ['DECLINED', 'DV_FAILED'] } }, _count: true });
    return rows.map((r) => ({ ...r, postTitle: posts.get(r.postId)?.titleEn ?? '', postTitleHi: posts.get(r.postId)?.titleHi ?? '', filled: filled.find((f) => f.postId === r.postId && f.orgCode === r.orgCode && f.category === r.category)?._count ?? 0 }));
  }

  private async finalCard(candidateId: string, applicationId: string) {
    const card = await this.prisma.scoreCard.findFirst({ where: { applicationId, stage: 'FINAL', publishedAt: { not: null }, application: { candidateId } } });
    if (!card) throw new AppError('NOT_IN_MERIT', 'Preferences open only for candidates in the published final merit list.', 403);
    return card;
  }

  async preferenceOptions(candidateId: string, applicationId: string) {
    const card = await this.finalCard(candidateId, applicationId);
    const rows = await this.vacancies(card.examId);
    const opts = new Map<string, { key: string; postTitle: string; postTitleHi: string; orgCode: string; orgName: string; seats: number }>();
    for (const r of rows) {
      const k = `${r.postId}:${r.orgCode}`;
      const o = opts.get(k) ?? { key: k, postTitle: r.postTitle, postTitleHi: r.postTitleHi, orgCode: r.orgCode, orgName: r.orgName, seats: 0 };
      o.seats += r.count;
      opts.set(k, o);
    }
    const saved = await this.prisma.allotmentPreference.findUnique({ where: { applicationId } });
    const allotment = await this.prisma.allotment.findUnique({ where: { applicationId } });
    return { qualified: card.qualified, rank: card.rank, options: [...opts.values()], prefs: saved?.prefs ?? [], submittedAt: saved?.submittedAt ?? null, allotment, locked: !!allotment };
  }

  async savePreferences(candidateId: string, applicationId: string, body: unknown) {
    const x = parseOrThrow(preferencesSchema, body);
    const card = await this.finalCard(candidateId, applicationId);
    if (!card.qualified) throw new AppError('NOT_QUALIFIED', 'Only qualified candidates can submit preferences.', 403);
    if (await this.prisma.allotment.findUnique({ where: { applicationId } })) throw new AppError('LOCKED', 'Allotment is done; preferences can no longer change.', 409);
    const valid = new Set((await this.prisma.vacancyRow.findMany({ where: { examId: card.examId } })).map((r) => `${r.postId}:${r.orgCode}`));
    if (new Set(x.prefs).size !== x.prefs.length) throw new AppError('DUPLICATE_PREFERENCE', 'Each option can appear only once.');
    if (x.prefs.some((p) => !valid.has(p))) throw new AppError('INVALID_PREFERENCE', 'One of the options is not available.');
    const p = await this.prisma.allotmentPreference.upsert({ where: { applicationId }, create: { applicationId, examId: card.examId, prefs: x.prefs }, update: { prefs: x.prefs, submittedAt: new Date() } });
    await this.audit.log({ action: 'PREFERENCES_SAVED', entity: 'Application', entityId: applicationId, actorType: 'CANDIDATE', actorId: candidateId, after: { count: x.prefs.length } });
    return p;
  }

  /** Runs a round of merit-cum-preference allotment. Accepted seats stay; declined seats return to the pool. */
  async runAllotment(adminId: string, examId: string) {
    const run = await this.prisma.resultRun.findUnique({ where: { examId_stage: { examId, stage: 'FINAL' } } });
    if (run?.status !== 'PUBLISHED') throw new AppError('STAGE_PENDING', 'Publish the final merit list first.');
    const existing = await this.prisma.allotment.findMany({ where: { examId } });
    const round = existing.reduce((a, b) => Math.max(a, b.round), 0) + 1;
    const keep = existing.filter((a) => ['ACCEPTED', 'DV_CLEARED', 'APPOINTED'].includes(a.status));
    const out = new Set(existing.filter((a) => ['DECLINED', 'DV_FAILED'].includes(a.status)).map((a) => a.applicationId));
    const seats = (await this.prisma.vacancyRow.findMany({ where: { examId } })).map((r) => ({ key: `${r.postId}:${r.orgCode}`, category: r.category as Category, count: r.count - keep.filter((k) => k.postId === r.postId && k.orgCode === r.orgCode && k.category === r.category).length }));
    const prefs = new Map((await this.prisma.allotmentPreference.findMany({ where: { examId } })).map((p) => [p.applicationId, p.prefs]));
    const cards = await this.prisma.scoreCard.findMany({ where: { examId, stage: 'FINAL', qualified: true, withheld: false }, orderBy: { rank: 'asc' }, include: { application: true } });
    const pool: Array<{ id: string; rank: number; category: Category; prefs: string[] }> = [];
    for (const c of cards) {
      if (out.has(c.applicationId) || keep.some((k) => k.applicationId === c.applicationId) || !prefs.get(c.applicationId)?.length) continue;
      const v = await snapshotOf(this.crypto, this.data, c.application);
      pool.push({ id: c.applicationId, rank: c.rank ?? 1e9, category: (v.category.category ?? 'GEN') as Category, prefs: prefs.get(c.applicationId)! });
    }
    const res = allot(pool, seats);
    const orgs = new Map((await this.prisma.vacancyRow.findMany({ where: { examId } })).map((r) => [`${r.postId}:${r.orgCode}`, r.orgName]));
    await this.prisma.$transaction(async (tx) => {
      await tx.allotment.deleteMany({ where: { examId, status: 'PROVISIONAL' } });
      for (const a of res.allotted) {
        const [postId, orgCode] = a.key.split(':') as [string, string];
        await tx.allotment.create({ data: { applicationId: a.id, examId, postId, orgCode, orgName: orgs.get(a.key) ?? orgCode, category: a.category, meritRank: pool.find((p) => p.id === a.id)!.rank, prefNo: a.prefNo, round } });
      }
      const apps = await tx.application.findMany({ where: { id: { in: res.allotted.map((a) => a.id) } }, select: { id: true, candidateId: true } });
      if (apps.length) await tx.notification.createMany({ data: apps.map((a) => ({ candidateId: a.candidateId, titleKey: 'notifications.allotment', params: { round }, link: `/selection/${a.id}` })) });
      await this.audit.log({ action: 'ALLOTMENT_RUN', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { round, allotted: res.allotted.length, unallotted: res.unallotted.length } }, tx);
    });
    return { round, allotted: res.allotted.length, unallotted: res.unallotted.length, kept: keep.length };
  }

  async allotments(examId: string) {
    const rows = await this.prisma.allotment.findMany({ where: { examId }, orderBy: { meritRank: 'asc' } });
    const apps = new Map((await this.prisma.application.findMany({ where: { id: { in: rows.map((r) => r.applicationId) } } })).map((a) => [a.id, a]));
    return Promise.all(rows.map(async (r) => ({ ...r, name: (await snapshotOf(this.crypto, this.data, apps.get(r.applicationId)!)).personal.fullName, applicationNo: apps.get(r.applicationId)!.applicationNo })));
  }

  async respond(candidateId: string, applicationId: string, accept: boolean) {
    const a = await this.prisma.allotment.findFirst({ where: { applicationId, status: 'PROVISIONAL' } });
    const app = await this.prisma.application.findFirst({ where: { id: applicationId, candidateId } });
    if (!a || !app) throw new AppError('NOT_FOUND', 'No provisional allotment to respond to.', 404);
    const u = await this.prisma.allotment.update({ where: { id: a.id }, data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() } });
    await this.audit.log({ action: accept ? 'ALLOTMENT_ACCEPTED' : 'ALLOTMENT_DECLINED', entity: 'Allotment', entityId: a.id, actorType: 'CANDIDATE', actorId: candidateId });
    return u;
  }

  // ── Document verification day ──
  async scheduleDv(adminId: string, examId: string, body: unknown) {
    const x = parseOrThrow(dvScheduleSchema, body);
    const done = new Set((await this.prisma.dvSession.findMany({ where: { examId } })).map((d) => d.applicationId));
    const due = (await this.prisma.allotment.findMany({ where: { examId, status: 'ACCEPTED' }, orderBy: { meritRank: 'asc' } })).filter((a) => !done.has(a.applicationId)).slice(0, x.slots.length * x.perSlot);
    const docs = ['Admit card and call letter', 'Photo ID (original)', 'Date of birth proof', 'Educational certificates', 'Category certificate (if claimed)', 'PwD certificate (if claimed)', 'Domicile certificate (if claimed)'];
    await this.prisma.dvSession.createMany({ data: due.map((a, i) => ({ applicationId: a.applicationId, examId, date: x.date, slot: x.slots[Math.floor(i / x.perSlot)]!, venue: x.venue, checklist: docs.map((d) => ({ item: d, status: 'PENDING' })) })) });
    const apps = await this.prisma.application.findMany({ where: { id: { in: due.map((a) => a.applicationId) } }, select: { id: true, candidateId: true } });
    if (apps.length) await this.prisma.notification.createMany({ data: apps.map((a) => ({ candidateId: a.candidateId, titleKey: 'notifications.dvScheduled', params: { date: x.date }, link: `/selection/${a.id}` })) });
    await this.audit.log({ action: 'DV_SCHEDULED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { date: x.date, count: due.length } });
    return { scheduled: due.length };
  }

  async dvList(examId: string, date?: string) {
    const rows = await this.prisma.dvSession.findMany({ where: { examId, ...(date && { date }) }, orderBy: [{ date: 'asc' }, { slot: 'asc' }] });
    const apps = new Map((await this.prisma.application.findMany({ where: { id: { in: rows.map((r) => r.applicationId) } }, include: { admitCard: true } })).map((a) => [a.id, a]));
    const allot = new Map((await this.prisma.allotment.findMany({ where: { applicationId: { in: rows.map((r) => r.applicationId) } } })).map((a) => [a.applicationId, a]));
    return Promise.all(rows.map(async (r) => {
      const app = apps.get(r.applicationId)!;
      const v = await snapshotOf(this.crypto, this.data, app);
      return { ...r, name: v.personal.fullName, rollNo: app.admitCard?.rollNo ?? null, category: v.category.category, otrId: v.otrId, candidateId: app.candidateId, allotment: allot.get(r.applicationId) ?? null };
    }));
  }

  /**
   * Discrepancy checks for the DV officer: data changed since the application was frozen, missing or
   * rejected certificates for claimed categories, unverified documents. Advisory only.
   */
  async dvChecks(adminId: string, id: string) {
    const s = await this.prisma.dvSession.findUnique({ where: { id } });
    if (!s) notFound('DV session');
    const app = await this.prisma.application.findUniqueOrThrow({ where: { id: s.applicationId } });
    const snap = this.crypto.decJson<Awaited<ReturnType<CandidateDataService['view']>>>(app.profileSnapshotEnc);
    const live = await this.data.view(app.candidateId);
    const f: Array<{ severity: 'HIGH' | 'MEDIUM' | 'LOW'; text: string }> = [];
    if (snap) {
      for (const k of ['fullName', 'fatherName', 'dob', 'gender'] as const) if (snap.personal[k] !== live.personal[k]) f.push({ severity: 'HIGH', text: `${k} changed after the application was submitted (correction record must be checked).` });
      if (snap.category.category !== live.category.category) f.push({ severity: 'HIGH', text: `Category changed from ${snap.category.category} to ${live.category.category} after application.` });
    }
    const docs = live.documents;
    const need: Array<[boolean, string, string]> = [
      [['SC', 'ST', 'OBC_NCL'].includes(live.category.category ?? ''), 'CATEGORY_CERT', 'Category certificate'],
      [live.category.category === 'EWS', 'EWS_CERT', 'EWS certificate'],
      [live.category.pwd, 'PWD_CERT', 'PwD certificate'],
      [live.category.exServiceman, 'EXSM_CERT', 'Ex-serviceman discharge certificate'],
    ];
    for (const [claimed, kind, label] of need) {
      if (!claimed) continue;
      const d = docs.find((x) => x.kind === kind);
      if (!d) f.push({ severity: 'HIGH', text: `${label} not uploaded although the benefit was claimed.` });
      else if (d.verificationStatus === 'REJECTED') f.push({ severity: 'HIGH', text: `${label} was rejected online: ${d.rejectionReason ?? ''}` });
      else if (d.verificationStatus !== 'APPROVED') f.push({ severity: 'MEDIUM', text: `${label} not yet verified online: check the original carefully.` });
    }
    for (const e of live.education) if (!e.documentId) f.push({ severity: 'MEDIUM', text: `No certificate uploaded for ${e.qualificationName}.` });
    if (live.identity.aadhaarVerifiedAt) f.push({ severity: 'LOW', text: 'Aadhaar e-KYC verified: name and DOB matched at registration.' });
    const corrections = await this.prisma.correctionRequest.count({ where: { candidateId: app.candidateId, status: 'APPROVED' } });
    if (corrections) f.push({ severity: 'LOW', text: `${corrections} approved correction(s) on record: check supporting proof.` });
    const ai = f.length ? await this.ai.complete('You help a document verification officer. In under 80 words, say which originals to examine most carefully, based only on the findings given. Plain text.', [{ role: 'user', content: f.map((x) => `[${x.severity}] ${x.text}`).join('\n') }], { maxTokens: 400 }) : null;
    const findings = { at: new Date().toISOString(), provider: ai?.text ? ai.provider : 'rules', items: f, note: ai?.text ?? null };
    await this.prisma.dvSession.update({ where: { id }, data: { aiFindings: findings as Prisma.InputJsonValue } });
    await this.audit.log({ action: 'DV_CHECKS_RUN', entity: 'DvSession', entityId: id, actorType: 'ADMIN', actorId: adminId, after: { findings: f.length } });
    return findings;
  }

  async dvUpdate(adminId: string, id: string, body: unknown) {
    const x = parseOrThrow(dvUpdateSchema, body);
    if (x.status === 'VERIFIED' && x.checklist.some((c) => c.status === 'MISMATCH' || c.status === 'MISSING')) throw new AppError('CHECKLIST_OPEN', 'Resolve mismatched or missing items, or mark the candidate deficient.');
    const s = await this.prisma.dvSession.update({ where: { id }, data: { status: x.status, checklist: x.checklist, remarks: x.remarks, officerId: adminId, ...(['VERIFIED', 'DEFICIENT', 'ABSENT'].includes(x.status) && { completedAt: new Date() }) } });
    if (x.status === 'VERIFIED') await this.prisma.allotment.updateMany({ where: { applicationId: s.applicationId }, data: { status: 'DV_CLEARED' } });
    if (x.status === 'ABSENT') await this.prisma.allotment.updateMany({ where: { applicationId: s.applicationId }, data: { status: 'DV_FAILED' } });
    await this.audit.log({ action: `DV_${x.status}`, entity: 'DvSession', entityId: id, actorType: 'ADMIN', actorId: adminId, after: { status: x.status, items: x.checklist.length } });
    return s;
  }

  // ── Candidate view of selection ──
  async mine(candidateId: string, applicationId: string) {
    const app = await this.prisma.application.findFirst({ where: { id: applicationId, candidateId }, include: { exam: true } });
    if (!app) notFound('Application');
    const calls = await this.prisma.stageCall.findMany({ where: { applicationId, letterReleasedAt: { not: null } } });
    const panels = new Map((await this.prisma.interviewPanel.findMany({ where: { id: { in: calls.flatMap((c) => (c.panelId ? [c.panelId] : [])) } } })).map((p) => [p.id, p]));
    return {
      exam: { id: app.examId, code: app.exam.code, title: app.exam.titleEn, titleHi: app.exam.titleHi, stages: app.exam.stages },
      calls: calls.map((c) => ({ stage: c.stage, status: c.status, rollNo: c.rollNo, slotAt: c.slotAt, venue: c.venue, panelDate: c.panelId ? panels.get(c.panelId)?.date : null })),
      allotment: await this.prisma.allotment.findUnique({ where: { applicationId } }),
      dv: await this.prisma.dvSession.findUnique({ where: { applicationId }, select: { date: true, slot: true, venue: true, status: true, remarks: true, checklist: true } }),
    };
  }
}
