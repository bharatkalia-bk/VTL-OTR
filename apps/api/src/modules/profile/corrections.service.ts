import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { addressSchema, correctionRequestSchema, emailSchema, type CorrectionField } from '@vtl/shared';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { FieldCrypto } from '../../security/field-crypto';
import { CandidateAuthService } from '../auth/candidate-auth.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { MediaService } from '../media/media.service';
import { NotifyService } from '../notify/notify.service';
import { OtpService } from '../notify/otp.service';
import { DocumentsService } from './documents.service';
import { ProfileService } from './profile.service';

const FIELD_TO_PROFILE: Partial<Record<CorrectionField, string>> = { FULL_NAME: 'fullNameEnc', FATHER_NAME: 'fatherNameEnc', MOTHER_NAME: 'motherNameEnc', DOB: 'dobEnc' };

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly data: CandidateDataService,
    private readonly docs: DocumentsService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly notify: NotifyService,
    private readonly otp: OtpService,
    private readonly profile: ProfileService,
    private readonly authSvc: CandidateAuthService,
  ) {}

  private currentValue(v: Awaited<ReturnType<CandidateDataService['view']>>, field: CorrectionField): string | null {
    switch (field) {
      case 'FULL_NAME': return v.personal.fullName;
      case 'FATHER_NAME': return v.personal.fatherName;
      case 'MOTHER_NAME': return v.personal.motherName;
      case 'DOB': return v.personal.dob;
      case 'GENDER': return v.personal.gender;
      case 'CATEGORY': return v.category.category;
      case 'MOBILE': return v.mobile;
      default: return null;
    }
  }

  async create(candidateId: string, body: unknown) {
    const b = parseOrThrow(correctionRequestSchema, body);
    const v = await this.data.view(candidateId);
    if (v.status !== 'SUBMITTED') throw new ForbiddenException({ code: 'NOT_SUBMITTED', message: 'Corrections are only needed after submission. Edit your profile directly.' });
    await this.docs.assertOwned(candidateId, [b.documentId]);
    const pending = await this.prisma.correctionRequest.count({ where: { candidateId, field: b.field, status: 'PENDING' } });
    if (pending) throw new AppError('ALREADY_PENDING', 'A correction request for this field is already pending.', 409);
    if (b.field === 'DOB' && !/^\d{4}-\d{2}-\d{2}$/.test(b.requestedValue)) throw new AppError('VALIDATION_FAILED', 'Date must be YYYY-MM-DD.');
    if (b.field === 'MOBILE' && !/^[6-9]\d{9}$/.test(b.requestedValue)) throw new AppError('VALIDATION_FAILED', 'Enter a valid 10-digit mobile number.');
    if (b.field === 'GENDER' && !['MALE', 'FEMALE', 'TRANSGENDER'].includes(b.requestedValue)) throw new AppError('VALIDATION_FAILED', 'Invalid gender.');
    if (b.field === 'CATEGORY' && !['GEN', 'EWS', 'OBC_NCL', 'SC', 'ST'].includes(b.requestedValue)) throw new AppError('VALIDATION_FAILED', 'Invalid category.');
    const cur = this.currentValue(v, b.field);
    const r = await this.prisma.correctionRequest.create({
      data: { candidateId, field: b.field, currentValueEnc: this.crypto.encOpt(cur), requestedValueEnc: this.crypto.encrypt(b.field.endsWith('NAME') ? b.requestedValue.toUpperCase() : b.requestedValue), reason: b.reason, documentId: b.documentId },
    });
    await this.audit.log({ action: 'CORRECTION_REQUESTED', entity: 'CorrectionRequest', entityId: r.id, after: { field: b.field } });
    return { id: r.id, status: r.status };
  }

  async listMine(candidateId: string) {
    const rows = await this.prisma.correctionRequest.findMany({ where: { candidateId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, field: r.field, currentValue: this.crypto.decOpt(r.currentValueEnc), requestedValue: this.crypto.decrypt(r.requestedValueEnc), reason: r.reason, status: r.status, decisionReason: r.decisionReason, createdAt: r.createdAt, decidedAt: r.decidedAt }));
  }

  /** Admin decision. Approval applies the change atomically (or unlocks photo/signature for re-capture). */
  async decide(id: string, adminId: string, approve: boolean, reason: string | undefined) {
    const r = await this.prisma.correctionRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found.' });
    if (r.status !== 'PENDING') throw new AppError('ALREADY_DECIDED', 'This request has already been decided.', 409);
    const value = this.crypto.decrypt(r.requestedValueEnc);
    const field = r.field as CorrectionField;
    const before = await this.data.view(r.candidateId);
    await this.prisma.$transaction(async (tx) => {
      if (approve) {
        const col = FIELD_TO_PROFILE[field];
        if (col) await tx.candidateProfile.update({ where: { candidateId: r.candidateId }, data: { [col]: this.crypto.encrypt(value) } });
        if (field === 'GENDER') await tx.candidateProfile.update({ where: { candidateId: r.candidateId }, data: { gender: value as never } });
        if (field === 'CATEGORY') await tx.candidateProfile.update({ where: { candidateId: r.candidateId }, data: { category: value as never } });
        if (field === 'MOBILE') {
          const idx = this.crypto.blindIndex('mobile', value);
          const clash = await tx.candidate.findUnique({ where: { mobileIdx: idx } });
          if (clash) throw new AppError('MOBILE_EXISTS', 'That mobile number belongs to another registration.', 409);
          await tx.candidate.update({ where: { id: r.candidateId }, data: { mobileEnc: this.crypto.encrypt(value), mobileIdx: idx } });
        }
        if (['FULL_NAME', 'FATHER_NAME', 'DOB'].includes(field)) {
          const p = { fullName: before.personal.fullName, fatherName: before.personal.fatherName, dob: before.personal.dob };
          if (field === 'FULL_NAME') p.fullName = value; if (field === 'FATHER_NAME') p.fatherName = value; if (field === 'DOB') p.dob = value;
          if (p.fullName && p.fatherName && p.dob) await tx.candidate.update({ where: { id: r.candidateId }, data: { dedupeKey: this.authSvc.dedupeKey(p.fullName, p.dob, p.fatherName), nameTokens: this.authSvc.nameTokens(p.fullName) } });
        }
      }
      await tx.correctionRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: adminId, decisionReason: reason ?? null, decidedAt: new Date() } });
      await this.audit.log({ action: approve ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED', entity: 'CorrectionRequest', entityId: id, actorType: 'ADMIN', actorId: adminId, before: { field, value: this.crypto.decOpt(r.currentValueEnc) }, after: approve ? { field, value } : { reason } }, tx);
      await tx.notification.create({ data: { candidateId: r.candidateId, titleKey: approve ? 'notifications.correctionApproved' : 'notifications.correctionRejected', params: { field }, link: '/dashboard/corrections' } });
    });
    if (approve && (field === 'PHOTO' || field === 'SIGNATURE')) await this.media.unlock(r.candidateId, field);
    await this.notify.send({ templateCode: 'CORRECTION_DECIDED', lang: before.language as 'en' | 'hi', mobile: before.mobile, email: before.email, params: { field, status: approve ? 'approved' : 'rejected', reason: reason ?? '' } });
    return { id, status: approve ? 'APPROVED' : 'REJECTED' };
  }

  // ── Non-core contact changes with OTP re-verification ──
  async contactChangeRequest(candidateId: string, body: unknown) {
    const b = parseOrThrow(z.object({ email: emailSchema.optional(), address: addressSchema.optional() }).refine((x) => x.email || x.address, 'validation.required'), body);
    const v = await this.data.view(candidateId);
    if (v.status !== 'SUBMITTED') throw new AppError('NOT_SUBMITTED', 'Edit your profile directly before submission.');
    if (b.email) {
      const clash = await this.prisma.candidate.findUnique({ where: { emailIdx: this.crypto.blindIndex('email', b.email) } });
      if (clash) throw new AppError('EMAIL_EXISTS', 'This email is already in use.', 409);
    }
    // OTP to registered mobile, plus the new email when changing email (proves ownership of both).
    const ch = await this.otp.create('CONTACT_CHANGE', candidateId, { mobile: v.mobile, email: b.email ?? null }, v.language as 'en' | 'hi', { enc: this.crypto.encJson(b) });
    return { challengeId: ch.challengeId, channels: b.email ? ['mobile', 'email'] : ['mobile'], expiresIn: ch.expiresIn };
  }

  async contactChangeVerify(candidateId: string, body: unknown) {
    const b = parseOrThrow(z.object({ challengeId: z.string().min(10), mobileOtp: z.string().regex(/^\d{6}$/), emailOtp: z.string().regex(/^\d{6}$/).optional() }), body);
    const ch = await this.otp.verify(b.challengeId, { mobile: b.mobileOtp, email: b.emailOtp }, 'CONTACT_CHANGE');
    if (ch.subject !== candidateId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Invalid request.' });
    const change = this.crypto.decJson<{ email?: string; address?: unknown }>(String(ch.data?.enc))!;
    if (change.email) {
      const before = (await this.data.view(candidateId)).email;
      await this.prisma.candidate.update({ where: { id: candidateId }, data: { emailEnc: this.crypto.encrypt(change.email), emailIdx: this.crypto.blindIndex('email', change.email), emailVerifiedAt: new Date() } });
      await this.audit.log({ action: 'EMAIL_CHANGED', entity: 'Candidate', entityId: candidateId, before: { email: before }, after: { email: change.email } });
    }
    if (change.address) await this.profile.saveAddress(candidateId, { data: change.address, final: true }, true);
    return this.data.publicView(candidateId);
  }
}
