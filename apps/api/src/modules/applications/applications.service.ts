import { mapsUrl } from '../pdf/pdf-docs.service';
import { DebarmentService } from '../lifecycle/debarment.service';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { applicationDraftSchema, customFieldSchema, type CustomField } from '@vtl/shared';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { FieldCrypto } from '../../security/field-crypto';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { applyWindow, feeFor, postEligibility } from '../exams/exam-rules';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: CandidateDataService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly debar: DebarmentService,
  ) {}

  private validateCustom(defs: CustomField[], values: Record<string, unknown>) {
    const out: Record<string, string | number | boolean> = {};
    for (const d of defs) {
      const v = values[d.key];
      if (v === undefined || v === '' || v === null) {
        if (d.required) throw new AppError('VALIDATION_FAILED', `${d.labelEn} is required.`, 400, { issues: [{ path: `customFieldValues.${d.key}`, message: 'validation.required' }] });
        continue;
      }
      if (d.type === 'number' && typeof v !== 'number') throw new AppError('VALIDATION_FAILED', `${d.labelEn} must be a number.`);
      if (d.type === 'boolean' && typeof v !== 'boolean') throw new AppError('VALIDATION_FAILED', `${d.labelEn} must be yes/no.`);
      if (d.type === 'select' && !d.options?.some((o) => o.value === v)) throw new AppError('VALIDATION_FAILED', `${d.labelEn}: invalid option.`);
      if (d.type === 'text' && (typeof v !== 'string' || v.length > (d.maxLength ?? 200))) throw new AppError('VALIDATION_FAILED', `${d.labelEn} is too long.`);
      out[d.key] = v as string | number | boolean;
    }
    return out;
  }

  /** Draft create/update with all exam rules enforced. */
  async saveDraft(candidateId: string, body: unknown) {
    const b = parseOrThrow(applicationDraftSchema, body);
    const v = await this.data.view(candidateId);
    if (v.status !== 'SUBMITTED') throw new ForbiddenException({ code: 'OTR_REQUIRED', message: 'Complete and submit your OTR before applying.' });
    const exam = await this.prisma.exam.findUnique({ where: { id: b.examId }, include: { posts: true, feeRules: true, centreCities: true } });
    if (!exam) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Exam not found.' });
    if (!applyWindow(exam).open) throw new AppError('APPLY_CLOSED', 'Applications for this exam are not open.');
    await this.debar.assertNotDebarred(candidateId, exam.id);
    const existing = await this.prisma.application.findUnique({ where: { candidateId_examId: { candidateId, examId: exam.id } } });
    if (existing && existing.status !== 'DRAFT') throw new AppError('ALREADY_SUBMITTED', 'You have already submitted an application for this exam.', 409, { applicationId: existing.id });
    if (new Set(b.postIds).size !== b.postIds.length || new Set(b.centreCityIds).size !== b.centreCityIds.length) throw new AppError('DUPLICATE_PREFERENCE', 'Preferences must be unique.');
    const profile = this.data.eligibilityProfile(v);
    const elig = postEligibility(exam.posts, profile, exam.ageCutoffDate);
    for (const pid of b.postIds) {
      const e = elig.find((x) => x.postId === pid);
      if (!e) throw new AppError('INVALID_POST', 'Selected post does not belong to this exam.');
      if (!e.result?.eligible) throw new AppError('NOT_ELIGIBLE', `You are not eligible for post ${e.postCode}.`, 400, { postCode: e.postCode, criteria: e.result?.criteria });
    }
    if (b.centreCityIds.length > exam.maxCentrePreferences) throw new AppError('TOO_MANY_CENTRES', `Choose at most ${exam.maxCentrePreferences} centre cities.`);
    if (!b.centreCityIds.every((id) => exam.centreCities.some((c) => c.id === id))) throw new AppError('INVALID_CENTRE', 'Invalid centre city.');
    const defs = z.array(customFieldSchema).parse(exam.customFields);
    const custom = this.validateCustom(defs, b.customFieldValues);
    const fee = feeFor(exam.feeRules, profile)!;
    const results = elig.filter((x) => b.postIds.includes(x.postId)).map((x) => ({ postCode: x.postCode, eligible: x.result?.eligible, criteria: x.result?.criteria ?? [] }));
    const eligibilitySnapshot = JSON.parse(JSON.stringify({ evaluatedAt: new Date().toISOString(), cutoff: exam.ageCutoffDate, results })) as Prisma.InputJsonValue;
    if (existing) {
      const u = await this.prisma.application.update({ where: { id: existing.id }, data: { postIds: b.postIds, centreCityIds: b.centreCityIds, customFieldValues: custom, feeAmount: fee.amount, feeRuleLabel: fee.ruleLabel, eligibilitySnapshot } });
      await this.audit.log({ action: 'APPLICATION_DRAFT_UPDATED', entity: 'Application', entityId: u.id });
      return this.get(candidateId, u.id);
    }
    const seq = await this.prisma.nextSeq('application_seq');
    const applicationNo = `${exam.rollNoPrefix}${new Date().getFullYear() % 100}${String(seq).padStart(8, '0')}`;
    const app = await this.prisma.application.create({
      data: { applicationNo, candidateId, examId: exam.id, postIds: b.postIds, centreCityIds: b.centreCityIds, customFieldValues: custom, feeAmount: fee.amount, feeRuleLabel: fee.ruleLabel, eligibilitySnapshot, events: { create: { status: 'DRAFT', note: 'Application started' } } },
    });
    await this.audit.log({ action: 'APPLICATION_CREATED', entity: 'Application', entityId: app.id, after: { examId: exam.id } });
    return this.get(candidateId, app.id);
  }

  /** Final submit: freezes OTR snapshot (encrypted), photo/signature keys; moves to PAYMENT_PENDING or FEE_EXEMPT. */
  async submit(candidateId: string, id: string) {
    const app = await this.prisma.application.findFirst({ where: { id, candidateId }, include: { exam: true } });
    if (!app) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Application not found.' });
    if (app.status !== 'DRAFT') throw new AppError('ALREADY_SUBMITTED', 'Application already submitted.', 409);
    // re-validate against current rules
    await this.saveDraft(candidateId, { examId: app.examId, postIds: app.postIds, centreCityIds: app.centreCityIds, customFieldValues: app.customFieldValues });
    const fresh = await this.prisma.application.findUniqueOrThrow({ where: { id } });
    const v = await this.data.view(candidateId);
    const status = fresh.feeAmount === 0 ? 'FEE_EXEMPT' : 'PAYMENT_PENDING';
    await this.prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id },
        data: { status, submittedAt: new Date(), profileSnapshotEnc: this.crypto.encJson(v), photoKey: v.photo?.objectKey, signatureKey: v.signature?.objectKey,
          events: { create: [{ status: 'SUBMITTED', note: 'Application submitted' }, { status, note: status === 'FEE_EXEMPT' ? 'Fee exempted as per rules' : `Fee payable: Rs ${fresh.feeAmount}` }] } },
      });
      await tx.notification.create({ data: { candidateId, titleKey: 'notifications.applicationSubmitted', params: { applicationNo: app.applicationNo, exam: app.exam.titleEn }, link: `/applications/${id}` } });
      await this.audit.log({ action: 'APPLICATION_SUBMITTED', entity: 'Application', entityId: id, after: { status, fee: fresh.feeAmount } }, tx);
    });
    const lang = v.language as 'en' | 'hi';
    await this.notify.send({ templateCode: 'APPLICATION_SUBMITTED', lang, mobile: v.mobile, email: v.email, params: { applicationNo: app.applicationNo, exam: app.exam.titleEn, feeNote: status === 'FEE_EXEMPT' ? 'No fee is payable.' : `Pay Rs ${fresh.feeAmount} before the last date.` } });
    return this.get(candidateId, id);
  }

  async list(candidateId: string) {
    const rows = await this.prisma.application.findMany({
      where: { candidateId }, orderBy: { createdAt: 'desc' },
      include: { exam: { select: { titleEn: true, titleHi: true, code: true, dates: true, admitCardsReleasedAt: true } }, admitCard: { select: { releasedAt: true, rollNo: true } }, result: true, events: { orderBy: { at: 'asc' } } },
    });
    return rows.map((a) => ({
      id: a.id, applicationNo: a.applicationNo, status: a.status, feeAmount: a.feeAmount, submittedAt: a.submittedAt, exam: a.exam,
      admitCard: a.admitCard?.releasedAt ? { rollNo: a.admitCard.rollNo, releasedAt: a.admitCard.releasedAt } : null,
      result: a.result, events: a.events,
    }));
  }

  async get(candidateId: string, id: string) {
    const a = await this.prisma.application.findFirst({
      where: { id, candidateId },
      include: { exam: { include: { posts: true, centreCities: true } }, events: { orderBy: { at: 'asc' } }, payments: { orderBy: { createdAt: 'desc' } }, admitCard: { include: { centre: { include: { city: true } }, shift: true } }, result: true },
    });
    if (!a) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Application not found.' });
    const w = applyWindow(a.exam);
    return {
      id: a.id, applicationNo: a.applicationNo, status: a.status, feeAmount: a.feeAmount, feeRuleLabel: a.feeRuleLabel, submittedAt: a.submittedAt, createdAt: a.createdAt,
      exam: { id: a.exam.id, code: a.exam.code, titleEn: a.exam.titleEn, titleHi: a.exam.titleHi, dates: w.dates, feeOpen: w.feeOpen, applyOpen: w.open },
      posts: a.postIds.map((pid) => a.exam.posts.find((p) => p.id === pid)).filter(Boolean).map((p) => ({ id: p!.id, code: p!.code, titleEn: p!.titleEn, titleHi: p!.titleHi })),
      centreCities: a.centreCityIds.map((cid) => a.exam.centreCities.find((c) => c.id === cid)).filter(Boolean).map((c) => ({ id: c!.id, cityName: c!.cityName })),
      customFieldValues: a.customFieldValues, eligibilitySnapshot: a.eligibilitySnapshot, events: a.events,
      payments: a.payments.map((p) => ({ id: p.id, merchantTxnId: p.merchantTxnId, gatewayTxnId: p.gatewayTxnId, amount: p.amount, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt })),
      admitCard: a.admitCard?.releasedAt ? {
        rollNo: a.admitCard.rollNo, releasedAt: a.admitCard.releasedAt,
        shift: a.admitCard.shift ? { code: a.admitCard.shift.code, date: a.admitCard.shift.date, startTime: a.admitCard.shift.startTime, endTime: a.admitCard.shift.endTime, mode: a.admitCard.shift.mode } : null,
        centre: a.admitCard.centre ? { name: a.admitCard.centre.name, city: a.admitCard.centre.city.cityName, address: a.admitCard.centre.address, reportingTime: a.admitCard.centre.reportingTime, gateClosingTime: a.admitCard.centre.gateClosingTime, mapUrl: mapsUrl(a.admitCard.centre) } : null,
      } : null,
      result: a.result,
    };
  }

  async withdraw(candidateId: string, id: string) {
    const a = await this.prisma.application.findFirst({ where: { id, candidateId } });
    if (!a) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Application not found.' });
    if (a.status !== 'DRAFT') throw new AppError('CANNOT_WITHDRAW', 'Only draft applications can be discarded.');
    await this.prisma.application.delete({ where: { id } });
    await this.audit.log({ action: 'APPLICATION_DRAFT_DISCARDED', entity: 'Application', entityId: id });
    return { ok: true };
  }
}
