import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  addressSchema, categorySchema, declarationSchema, educationEntrySchema, educationSchema, formatOtrId, personalSchema, WIZARD_STEPS,
  type AddressInput, type CategoryInput, type EducationInput, type PersonalInput, type WizardStep,
} from '@vtl/shared';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { QueueService } from '../../infra/queue.service';
import { SettingsService } from '../../infra/settings.service';
import { FieldCrypto } from '../../security/field-crypto';
import { CandidateAuthService } from '../auth/candidate-auth.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { DocumentsService } from './documents.service';

type Step = Exclude<WizardStep, 'photo'>;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly data: CandidateDataService,
    private readonly docs: DocumentsService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly queue: QueueService,
    private readonly authSvc: CandidateAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async assertDraft(candidateId: string, step: Step) {
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, select: { status: true } });
    if (c.status === 'BLOCKED') throw new ForbiddenException({ code: 'BLOCKED', message: 'Your account is blocked.' });
    // Education stays editable (results are declared after submission); address/email via contact-change flow.
    if (c.status === 'SUBMITTED' && step !== 'education') {
      throw new ForbiddenException({ code: 'LOCKED', message: 'This section is locked after submission. Use the correction request or contact change option.' });
    }
    return c.status;
  }

  private async markStep(candidateId: string, step: WizardStep, complete: boolean) {
    const p = await this.prisma.candidateProfile.findUniqueOrThrow({ where: { candidateId }, select: { completedSteps: true } });
    const set = new Set(p.completedSteps);
    if (complete) set.add(step);
    else set.delete(step);
    await this.prisma.candidateProfile.update({ where: { candidateId }, data: { completedSteps: [...set] } });
  }

  /** Auto-save (final=false: lenient, partial) or continue (final=true: strict validation, marks step complete). */
  async savePersonal(candidateId: string, body: { data?: unknown; final?: boolean }) {
    await this.assertDraft(candidateId, 'personal');
    const d = body.final ? parseOrThrow(personalSchema, body.data) : parseOrThrow(personalSchema.partial(), body.data);
    const before = (await this.data.view(candidateId)).personal;
    const p = d as Partial<PersonalInput>;
    const upd = {
      ...(p.fullName !== undefined && { fullNameEnc: this.crypto.encrypt(p.fullName.toUpperCase()) }),
      ...(p.fatherName !== undefined && { fatherNameEnc: this.crypto.encrypt(p.fatherName.toUpperCase()) }),
      ...(p.motherName !== undefined && { motherNameEnc: this.crypto.encrypt(p.motherName.toUpperCase()) }),
      ...(p.dob !== undefined && { dobEnc: this.crypto.encrypt(p.dob) }),
      ...(p.gender !== undefined && { gender: p.gender }),
      ...(p.nationality !== undefined && { nationality: p.nationality }),
      ...(p.maritalStatus !== undefined && { maritalStatus: p.maritalStatus }),
      ...(p.identificationMark1 !== undefined && { idMark1Enc: this.crypto.encOpt(p.identificationMark1) }),
      ...(p.identificationMark2 !== undefined && { idMark2Enc: this.crypto.encOpt(p.identificationMark2 || null) }),
    };
    await this.prisma.candidateProfile.update({ where: { candidateId }, data: upd });
    const after = (await this.data.view(candidateId)).personal;
    // identity dedupe on name/dob/father changes
    if (after.fullName && after.dob && after.fatherName) {
      const key = this.authSvc.dedupeKey(after.fullName, after.dob, after.fatherName);
      await this.prisma.candidate.update({ where: { id: candidateId }, data: { dedupeKey: key, nameTokens: this.authSvc.nameTokens(after.fullName) } });
      const others = await this.prisma.candidate.findMany({ where: { dedupeKey: key, id: { not: candidateId } }, select: { id: true } });
      if (others.length) {
        const ids = [candidateId, ...others.map((o) => o.id)];
        await this.prisma.duplicateFlag.upsert({ where: { type_key: { type: 'IDENTITY', key } }, create: { type: 'IDENTITY', key, candidateIds: ids }, update: { candidateIds: ids } });
      }
    }
    if (body.final) await this.markStep(candidateId, 'personal', true);
    await this.audit.log({ action: body.final ? 'PROFILE_PERSONAL_SAVED' : 'PROFILE_PERSONAL_DRAFT', entity: 'Candidate', entityId: candidateId, before, after });
    return this.data.publicView(candidateId);
  }

  async saveCategory(candidateId: string, body: { data?: unknown; final?: boolean }) {
    await this.assertDraft(candidateId, 'category');
    const lenient = z.object({}).passthrough();
    const d = (body.final ? parseOrThrow(categorySchema, body.data) : parseOrThrow(lenient, body.data)) as Partial<CategoryInput>;
    await this.docs.assertOwned(candidateId, [d.categoryCertDocId, d.pwdCertDocId, d.exsmCertDocId]);
    if (body.final) {
      if (d.category && d.category !== 'GEN' && !d.categoryCertDocId) throw new AppError('CERT_REQUIRED', 'Upload your category certificate.', 400, { field: 'categoryCertDocId' });
      if (d.pwd && !d.pwdCertDocId) throw new AppError('CERT_REQUIRED', 'Upload your disability certificate.', 400, { field: 'pwdCertDocId' });
      if (d.exServiceman && !d.exsmCertDocId) throw new AppError('CERT_REQUIRED', 'Upload your discharge certificate.', 400, { field: 'exsmCertDocId' });
    }
    const before = (await this.data.view(candidateId)).category;
    const pick = <K extends keyof CategoryInput>(k: K) => (d[k] !== undefined ? { [k]: d[k] } : {});
    await this.prisma.candidateProfile.update({
      where: { candidateId },
      data: {
        ...pick('category'), ...pick('pwd'), ...pick('pwdType'), ...pick('pwdPercent'), ...pick('exServiceman'), ...pick('serviceYears'),
        ...pick('domicileStateCode'), ...pick('categoryCertDocId'), ...pick('pwdCertDocId'), ...pick('exsmCertDocId'),
        ...(d.pwd === false && { pwdType: null, pwdPercent: null, pwdCertDocId: null }),
        ...(d.exServiceman === false && { serviceYears: null, exsmCertDocId: null }),
        ...(d.category === 'GEN' && { categoryCertDocId: null }),
      } as never,
    });
    if (body.final) await this.markStep(candidateId, 'category', true);
    await this.audit.log({ action: 'PROFILE_CATEGORY_SAVED', entity: 'Candidate', entityId: candidateId, before, after: (await this.data.view(candidateId)).category });
    return this.data.publicView(candidateId);
  }

  async saveAddress(candidateId: string, body: { data?: unknown; final?: boolean }, bypassLock = false) {
    if (!bypassLock) await this.assertDraft(candidateId, 'address');
    const d = (body.final ? parseOrThrow(addressSchema, body.data) : parseOrThrow(z.object({ permanent: z.any().optional(), correspondenceSameAsPermanent: z.boolean().optional(), correspondence: z.any().optional() }), body.data)) as Partial<AddressInput>;
    if (body.final && d.permanent) await this.assertDistrict(d.permanent.stateCode, d.permanent.districtId);
    if (body.final && d.correspondence && !d.correspondenceSameAsPermanent) await this.assertDistrict(d.correspondence.stateCode, d.correspondence.districtId);
    const before = (await this.data.view(candidateId)).address;
    await this.prisma.candidateProfile.update({
      where: { candidateId },
      data: {
        ...(d.permanent && { permanentAddressEnc: this.crypto.encJson(d.permanent), stateCode: d.permanent.stateCode ?? null, districtId: d.permanent.districtId ?? null }),
        ...(d.correspondenceSameAsPermanent !== undefined && { sameAddress: d.correspondenceSameAsPermanent }),
        ...(d.correspondenceSameAsPermanent ? { correspondenceAddressEnc: null } : d.correspondence ? { correspondenceAddressEnc: this.crypto.encJson(d.correspondence) } : {}),
      },
    });
    if (body.final) await this.markStep(candidateId, 'address', true);
    await this.audit.log({ action: bypassLock ? 'ADDRESS_CHANGED_AFTER_SUBMISSION' : 'PROFILE_ADDRESS_SAVED', entity: 'Candidate', entityId: candidateId, before, after: d });
    return this.data.publicView(candidateId);
  }

  private async assertDistrict(stateCode: string, districtId: number) {
    const ok = await this.prisma.district.findFirst({ where: { id: districtId, stateCode } });
    if (!ok) throw new AppError('INVALID_DISTRICT', 'Selected district does not belong to the selected state.');
  }

  async saveEducation(candidateId: string, body: { data?: unknown; final?: boolean }) {
    const status = await this.assertDraft(candidateId, 'education');
    const d = (body.final ? parseOrThrow(educationSchema, body.data) : parseOrThrow(z.object({ entries: z.array(z.object({}).passthrough()) }), body.data)) as EducationInput;
    if (body.final) {
      await this.docs.assertOwned(candidateId, d.entries.map((e) => e.documentId));
      const missingDoc = d.entries.find((e) => e.status === 'PASSED' && !e.documentId);
      if (missingDoc) throw new AppError('CERT_REQUIRED', 'Upload the marksheet/certificate for each passed qualification.', 400, { level: missingDoc.level });
      const levels = d.entries.map((e) => e.level).filter((l) => l !== 'OTHER');
      if (new Set(levels).size !== levels.length) throw new AppError('DUPLICATE_LEVEL', 'Each qualification level can be added only once.');
    }
    const before = (await this.data.view(candidateId)).education;
    if (body.final || d.entries.every((e) => educationEntrySchema.safeParse(e).success)) {
      await this.prisma.$transaction([
        this.prisma.education.deleteMany({ where: { candidateId } }),
        this.prisma.education.createMany({
          data: d.entries.map((e, i) => ({
            candidateId, level: e.level, qualificationName: e.qualificationName, boardOrUniversity: e.boardOrUniversity, yearOfPassing: e.yearOfPassing,
            status: e.status, resultType: e.resultType, marks: e.marks, maxMarks: e.maxMarks ?? null, cgpaScale: e.cgpaScale ?? null,
            rollNoEnc: this.crypto.encOpt(e.rollNo || null), documentId: e.documentId ?? null, sortOrder: i,
          })),
        }),
      ]);
    }
    if (body.final) await this.markStep(candidateId, 'education', true);
    await this.audit.log({ action: status === 'SUBMITTED' ? 'EDUCATION_UPDATED_AFTER_SUBMISSION' : 'PROFILE_EDUCATION_SAVED', entity: 'Candidate', entityId: candidateId, before, after: d.entries });
    return this.data.publicView(candidateId);
  }

  async saveDeclaration(candidateId: string, body: unknown) {
    await this.assertDraft(candidateId, 'declaration');
    const d = parseOrThrow(declarationSchema, body);
    const v = await this.data.view(candidateId);
    const missing = WIZARD_STEPS.filter((s) => s !== 'declaration' && !v.completedSteps.includes(s));
    if (missing.length) throw new AppError('INCOMPLETE', 'Please complete all sections before the declaration.', 400, { missing });
    await this.prisma.candidateProfile.update({ where: { candidateId }, data: { declarationAt: new Date(), declarationPlace: d.place } });
    await this.markStep(candidateId, 'declaration', true);
    await this.audit.log({ action: 'DECLARATION_ACCEPTED', entity: 'Candidate', entityId: candidateId, after: { place: d.place } });
    return this.data.publicView(candidateId);
  }

  /** Final OTR submission: generates the OTR ID, locks core fields, queues slip PDF + SMS/email. */
  async submit(candidateId: string) {
    const v = await this.data.view(candidateId);
    if (v.status === 'SUBMITTED') throw new AppError('ALREADY_SUBMITTED', 'Your OTR is already submitted.', 409, { otrId: v.otrId });
    if (v.status === 'BLOCKED') throw new ForbiddenException({ code: 'BLOCKED', message: 'Your account is blocked.' });
    const missing = WIZARD_STEPS.filter((s) => !v.completedSteps.includes(s));
    if (missing.length) throw new AppError('INCOMPLETE', 'Please complete all sections before submitting.', 400, { missing });
    if (!v.photo || !v.signature) throw new AppError('INCOMPLETE', 'Photograph and signature are required.', 400, { missing: ['photo'] });
    const fmt = (await this.settings.get()).otrIdFormat;
    const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(new Date()));
    const otrId = await this.prisma.$transaction(async (tx) => {
      const seq = Number((await tx.$queryRawUnsafe<Array<{ v: bigint }>>(`SELECT nextval('otr_seq') AS v`))[0]!.v);
      const id = formatOtrId(year, seq, fmt);
      const upd = await tx.candidate.updateMany({ where: { id: candidateId, status: 'DRAFT' }, data: { otrId: id, otrSeq: seq, status: 'SUBMITTED', submittedAt: new Date() } });
      if (upd.count !== 1) throw new AppError('ALREADY_SUBMITTED', 'Your OTR is already submitted.', 409);
      await this.audit.log({ action: 'OTR_SUBMITTED', entity: 'Candidate', entityId: candidateId, after: { otrId: id } }, tx);
      await tx.notification.create({ data: { candidateId, titleKey: 'notifications.otrGenerated', params: { otrId: id }, link: '/dashboard' } });
      return id;
    });
    await this.queue.add('pdf', 'otr-slip', { candidateId, notify: true });
    return { otrId, submittedAt: new Date() };
  }
}
