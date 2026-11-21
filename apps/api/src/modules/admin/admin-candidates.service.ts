import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isValidOtrId, normaliseName } from '@vtl/shared';
import { AppError } from '../../common/errors';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { FieldCrypto } from '../../security/field-crypto';
import { TokensService } from '../../security/tokens.service';
import { CandidateDataService } from '../candidates/candidate-data.service';

@Injectable()
export class AdminCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly data: CandidateDataService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  /** Search by OTR ID, mobile, email (blind indexes) or name tokens; never scans plaintext. */
  async search(q: { q?: string; status?: string; cursor?: string; limit: number }, adminId: string) {
    const term = q.q?.trim() ?? '';
    let where: Record<string, unknown> = {};
    if (term) {
      if (isValidOtrId(term) || /^[A-Z]+-OTR-/i.test(term)) where = { otrId: term.toUpperCase() };
      else if (/^[6-9]\d{9}$/.test(term)) where = { mobileIdx: this.crypto.blindIndex('mobile', term) };
      else if (term.includes('@')) where = { emailIdx: this.crypto.blindIndex('email', term.toLowerCase()) };
      else {
        const tokens = normaliseName(term).split(' ').filter((t) => t.length >= 2).map((t) => this.crypto.blindIndex('name', t));
        where = tokens.length ? { nameTokens: { hasEvery: tokens } } : {};
      }
    }
    if (q.status) where.status = q.status;
    const rows = await this.prisma.candidate.findMany({
      where, orderBy: { createdAt: 'desc' }, take: q.limit + 1, ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      include: { profile: { select: { fullNameEnc: true, category: true, stateCode: true, completedSteps: true } }, media: { where: { kind: 'PHOTO', isCurrent: true }, select: { duplicateFlag: true } } },
    });
    if (term) await this.audit.log({ action: 'ADMIN_CANDIDATE_SEARCH', entity: 'Candidate', actorType: 'ADMIN', actorId: adminId, after: { queryType: Object.keys(where)[0] } });
    return {
      items: rows.slice(0, q.limit).map((c) => ({
        id: c.id, otrId: c.otrId, status: c.status, name: this.crypto.decOpt(c.profile?.fullNameEnc), mobile: `XXXXXX${this.crypto.decrypt(c.mobileEnc).slice(-4)}`,
        category: c.profile?.category, stateCode: c.profile?.stateCode, completion: Math.round(((c.profile?.completedSteps.length ?? 0) / 6) * 100), duplicatePhoto: c.media.some((m) => m.duplicateFlag), createdAt: c.createdAt,
      })),
      nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
    };
  }

  /** Full profile for verification, including photo capture metadata. Viewing is audited. */
  async detail(id: string, adminId: string) {
    const v = await this.data.view(id);
    const [attempts, apps, corrections, flags, photoUrl, sigUrl, consents] = await Promise.all([
      this.prisma.photoAttempt.findMany({ where: { candidateId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.application.findMany({ where: { candidateId: id }, include: { exam: { select: { code: true, titleEn: true } } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.correctionRequest.findMany({ where: { candidateId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.duplicateFlag.findMany({ where: { candidateIds: { has: id } } }),
      v.photo ? this.storage.signedUrl(v.photo.objectKey, 300) : null,
      v.signature ? this.storage.signedUrl(v.signature.objectKey, 300) : null,
      this.prisma.consent.findMany({ where: { candidateId: id } }),
    ]);
    const states = new Map((await this.prisma.state.findMany()).map((s) => [s.code, s.nameEn]));
    await this.audit.log({ action: 'ADMIN_VIEWED_CANDIDATE', entity: 'Candidate', entityId: id, actorType: 'ADMIN', actorId: adminId });
    return {
      ...v,
      domicileStateName: states.get(v.category.domicileStateCode ?? '') ?? null,
      photo: v.photo ? { ...v.photo, objectKey: undefined, url: photoUrl } : null,
      signature: v.signature ? { ...v.signature, objectKey: undefined, url: sigUrl } : null,
      photoAttempts: attempts,
      applications: apps.map((a) => ({ id: a.id, applicationNo: a.applicationNo, exam: a.exam, status: a.status, feeAmount: a.feeAmount, submittedAt: a.submittedAt })),
      corrections: corrections.map((r) => ({ id: r.id, field: r.field, status: r.status, requestedValue: this.crypto.decrypt(r.requestedValueEnc), createdAt: r.createdAt })),
      duplicateFlags: flags,
      consents,
    };
  }

  async documentUrl(docId: string, adminId: string) {
    const d = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!d) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    await this.audit.log({ action: 'ADMIN_VIEWED_DOCUMENT', entity: 'Document', entityId: docId, actorType: 'ADMIN', actorId: adminId });
    return { url: await this.storage.signedUrl(d.objectKey, 300), mime: d.mime, fileName: d.fileName };
  }

  async verifyDocument(docId: string, adminId: string, approve: boolean, reason?: string) {
    const d = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!d) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    if (!approve && !reason) throw new AppError('REASON_REQUIRED', 'A rejection reason is required.');
    const u = await this.prisma.document.update({ where: { id: docId }, data: { verificationStatus: approve ? 'APPROVED' : 'REJECTED', verifiedById: adminId, verifiedAt: new Date(), rejectionReason: approve ? null : reason } });
    await this.audit.log({ action: approve ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED', entity: 'Document', entityId: docId, actorType: 'ADMIN', actorId: adminId, before: { status: d.verificationStatus }, after: { status: u.verificationStatus, reason } });
    if (d.candidateId && !approve) await this.prisma.notification.create({ data: { candidateId: d.candidateId, titleKey: 'notifications.documentRejected', params: { kind: d.kind, reason: reason ?? '' }, link: '/profile' } });
    return u;
  }

  async pendingDocuments(q: { cursor?: string; limit: number; status?: string }) {
    const rows = await this.prisma.document.findMany({
      where: { verificationStatus: (q.status as never) ?? 'PENDING', candidateId: { not: null }, kind: { notIn: ['HELPDESK_ATTACHMENT'] }, candidate: { status: 'SUBMITTED' } },
      orderBy: { createdAt: 'asc' }, take: q.limit + 1, ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      include: { candidate: { select: { otrId: true, id: true } } },
    });
    return { items: rows.slice(0, q.limit).map((d) => ({ ...d, objectKey: undefined })), nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null };
  }

  async setBlocked(id: string, adminId: string, blocked: boolean, reason?: string) {
    const c = await this.prisma.candidate.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Candidate not found.' });
    if (blocked && !reason) throw new AppError('REASON_REQUIRED', 'A reason is required to block.');
    const status = blocked ? 'BLOCKED' : c.otrId ? 'SUBMITTED' : 'DRAFT';
    await this.prisma.candidate.update({ where: { id }, data: { status, blockedReason: blocked ? reason : null } });
    if (blocked) await this.tokens.revokeAllFor('CANDIDATE', id);
    await this.audit.log({ action: blocked ? 'CANDIDATE_BLOCKED' : 'CANDIDATE_UNBLOCKED', entity: 'Candidate', entityId: id, actorType: 'ADMIN', actorId: adminId, before: { status: c.status }, after: { status, reason } });
    return { id, status };
  }

  async duplicates(status = 'OPEN') {
    const flags = await this.prisma.duplicateFlag.findMany({ where: { status: status as never }, orderBy: { createdAt: 'desc' }, take: 100 });
    const ids = [...new Set(flags.flatMap((f) => f.candidateIds))];
    const cands = await this.prisma.candidate.findMany({ where: { id: { in: ids } }, include: { profile: { select: { fullNameEnc: true, dobEnc: true } }, media: { where: { kind: 'PHOTO', isCurrent: true } } } });
    const byId = new Map(await Promise.all(cands.map(async (c) => [c.id, {
      id: c.id, otrId: c.otrId, status: c.status, name: this.crypto.decOpt(c.profile?.fullNameEnc), dob: this.crypto.decOpt(c.profile?.dobEnc),
      photoUrl: c.media[0] ? await this.storage.signedUrl(c.media[0].objectKey, 300) : null,
    }] as const)));
    return flags.map((f) => ({ ...f, candidates: f.candidateIds.map((id) => byId.get(id)).filter(Boolean) }));
  }

  async resolveDuplicate(id: string, adminId: string, status: 'CLEARED' | 'CONFIRMED', notes?: string) {
    const f = await this.prisma.duplicateFlag.update({ where: { id }, data: { status, notes, reviewedById: adminId, reviewedAt: new Date() } });
    if (status === 'CLEARED' && f.type === 'PHOTO_HASH') await this.prisma.mediaAsset.updateMany({ where: { sha256: f.key }, data: { duplicateFlag: false } });
    await this.audit.log({ action: `DUPLICATE_${status}`, entity: 'DuplicateFlag', entityId: id, actorType: 'ADMIN', actorId: adminId, after: { notes } });
    return f;
  }
}
