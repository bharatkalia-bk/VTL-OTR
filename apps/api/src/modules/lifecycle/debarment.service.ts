import { Injectable } from '@nestjs/common';
import { debarmentSchema } from '@vtl/shared';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { notFound } from './common';

/** Debarment: proposed by one officer, approved by another (maker-checker), enforced at application and at the gate. */
@Injectable()
export class DebarmentService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async activeFor(candidateId: string, examId?: string) {
    const now = new Date();
    return this.prisma.debarment.findFirst({
      where: { candidateId, status: 'ACTIVE', fromDate: { lte: now }, OR: [{ untilDate: null }, { untilDate: { gt: now } }], AND: [{ OR: [{ scope: 'ALL' }, ...(examId ? [{ scope: 'EXAM', examId }] : [])] }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertNotDebarred(candidateId: string, examId?: string) {
    const d = await this.activeFor(candidateId, examId);
    if (d) throw new AppError('DEBARRED', `You are debarred${d.untilDate ? ` until ${d.untilDate.toISOString().slice(0, 10)}` : ''} and cannot apply. Reason: ${d.reason}`, 403);
  }

  async propose(adminId: string, body: unknown) {
    const x = parseOrThrow(debarmentSchema, body);
    const c = await this.prisma.candidate.findUnique({ where: { otrId: x.otrId.trim().toUpperCase() } });
    if (!c) notFound('Candidate with this OTR ID');
    const d = await this.prisma.debarment.create({ data: {
      candidateId: c.id, scope: x.scope, examId: x.scope === 'EXAM' ? x.examId : null, reason: x.reason, sourceType: x.sourceType, sourceId: x.sourceId,
      fromDate: new Date(`${x.fromDate}T00:00:00+05:30`), untilDate: x.untilDate ? new Date(`${x.untilDate}T23:59:59+05:30`) : null, evidence: x.evidence, proposedById: adminId,
    } });
    await this.audit.log({ action: 'DEBARMENT_PROPOSED', entity: 'Debarment', entityId: d.id, actorType: 'ADMIN', actorId: adminId, after: { otrId: c.otrId, scope: x.scope, untilDate: x.untilDate ?? 'PERMANENT' } });
    return d;
  }

  async decide(adminId: string, id: string, body: unknown) {
    const x = parseOrThrow(z.object({ approve: z.boolean(), note: z.string().max(500).optional() }), body);
    const d = await this.prisma.debarment.findUnique({ where: { id } });
    if (!d) notFound('Debarment');
    if (d.status !== 'PROPOSED') throw new AppError('INVALID_STATE', 'Only a proposed debarment can be decided.', 409);
    if (d.proposedById === adminId) throw new AppError('MAKER_CHECKER', 'A different officer must approve the debarment you proposed.', 403);
    const u = await this.prisma.debarment.update({ where: { id }, data: { status: x.approve ? 'ACTIVE' : 'REJECTED', approvedById: adminId, approvedAt: new Date(), ...(x.note && { revokeReason: x.approve ? null : x.note }) } });
    if (x.approve) {
      await this.prisma.notification.create({ data: { candidateId: d.candidateId, titleKey: 'notifications.debarred', params: { until: d.untilDate?.toISOString().slice(0, 10) ?? '-' }, link: '/dashboard' } });
    }
    await this.audit.log({ action: x.approve ? 'DEBARMENT_APPROVED' : 'DEBARMENT_REJECTED', entity: 'Debarment', entityId: id, actorType: 'ADMIN', actorId: adminId, after: x });
    return u;
  }

  async revoke(adminId: string, id: string, reason: string) {
    const d = await this.prisma.debarment.findUnique({ where: { id } });
    if (!d) notFound('Debarment');
    if (d.status !== 'ACTIVE') throw new AppError('INVALID_STATE', 'Only an active debarment can be revoked.', 409);
    const u = await this.prisma.debarment.update({ where: { id }, data: { status: 'REVOKED', revokedById: adminId, revokedAt: new Date(), revokeReason: reason } });
    await this.audit.log({ action: 'DEBARMENT_REVOKED', entity: 'Debarment', entityId: id, actorType: 'ADMIN', actorId: adminId, after: { reason } });
    return u;
  }

  async list(status?: string) {
    const rows = await this.prisma.debarment.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const cands = new Map((await this.prisma.candidate.findMany({ where: { id: { in: rows.map((r) => r.candidateId) } }, select: { id: true, otrId: true } })).map((c) => [c.id, c.otrId]));
    const admins = new Map((await this.prisma.adminUser.findMany({ select: { id: true, name: true } })).map((a) => [a.id, a.name]));
    return rows.map((r) => ({ ...r, otrId: cands.get(r.candidateId) ?? null, proposedBy: admins.get(r.proposedById) ?? null, approvedBy: r.approvedById ? admins.get(r.approvedById) ?? null : null }));
  }

  mine(candidateId: string) {
    return this.prisma.debarment.findMany({ where: { candidateId, status: { in: ['ACTIVE', 'REVOKED'] } }, select: { id: true, scope: true, reason: true, fromDate: true, untilDate: true, status: true }, orderBy: { createdAt: 'desc' } });
  }
}
