import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { publicTicketCreateSchema, ticketCreateSchema, ticketMessageSchema, ticketStatusSchema } from '@vtl/shared';
import { z } from 'zod';
import { parseOrThrow } from '../../common/zod';
import { CaptchaService } from '../../integrations/captcha';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RateLimitService } from '../../infra/rate-limit.service';
import { FieldCrypto } from '../../security/field-crypto';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class HelpdeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly captcha: CaptchaService,
    private readonly rl: RateLimitService,
    private readonly notify: NotifyService,
    private readonly data: CandidateDataService,
  ) {}

  private async ticketNo() {
    const seq = await this.prisma.nextSeq('ticket_seq');
    return `TKT${new Date().getFullYear()}${String(seq).padStart(7, '0')}`;
  }

  async create(candidateId: string, body: unknown) {
    const b = parseOrThrow(ticketCreateSchema, body);
    await this.rl.hit('ticket', candidateId, 10, 24 * 3600);
    if (b.attachmentId) {
      const ok = await this.prisma.document.count({ where: { id: b.attachmentId, candidateId } });
      if (!ok) throw new ForbiddenException({ code: 'INVALID_DOCUMENT', message: 'Invalid attachment.' });
    }
    const t = await this.prisma.helpdeskTicket.create({ data: { ticketNo: await this.ticketNo(), candidateId, category: b.category, subject: b.subject, messages: { create: { authorType: 'CANDIDATE', authorId: candidateId, message: b.message, attachmentId: b.attachmentId ?? null } } } });
    await this.audit.log({ action: 'TICKET_CREATED', entity: 'HelpdeskTicket', entityId: t.id });
    return { id: t.id, ticketNo: t.ticketNo, status: t.status };
  }

  async createPublic(body: unknown, ip: string) {
    const b = parseOrThrow(publicTicketCreateSchema, body);
    await this.rl.hit('ticket-public', ip, 5, 3600);
    await this.captcha.verify(b.captchaId, b.captchaText);
    const t = await this.prisma.helpdeskTicket.create({
      data: { ticketNo: await this.ticketNo(), contactEnc: this.crypto.encJson({ name: b.name, mobile: b.mobile, email: b.email }), category: b.category, subject: b.subject, messages: { create: { authorType: 'PUBLIC', message: b.message } } },
    });
    await this.audit.log({ action: 'TICKET_CREATED_PUBLIC', entity: 'HelpdeskTicket', entityId: t.id, actorType: 'PUBLIC' });
    return { ticketNo: t.ticketNo, status: t.status };
  }

  async listMine(candidateId: string) {
    return this.prisma.helpdeskTicket.findMany({ where: { candidateId }, orderBy: { updatedAt: 'desc' }, select: { id: true, ticketNo: true, category: true, subject: true, status: true, createdAt: true, updatedAt: true } });
  }

  async get(id: string, candidateId?: string) {
    const t = await this.prisma.helpdeskTicket.findFirst({ where: { id, ...(candidateId && { candidateId }) }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Ticket not found.' });
    return { ...t, contact: candidateId ? undefined : this.crypto.decJson(t.contactEnc), contactEnc: undefined };
  }

  async reply(id: string, actor: { type: 'CANDIDATE' | 'ADMIN'; id: string }, body: unknown) {
    const b = parseOrThrow(ticketMessageSchema, body);
    const t = await this.get(id, actor.type === 'CANDIDATE' ? actor.id : undefined);
    if (t.status === 'CLOSED') throw new ForbiddenException({ code: 'CLOSED', message: 'This ticket is closed.' });
    await this.prisma.ticketMessage.create({ data: { ticketId: id, authorType: actor.type, authorId: actor.id, message: b.message, attachmentId: b.attachmentId ?? null } });
    const status = actor.type === 'ADMIN' && t.status === 'OPEN' ? 'IN_PROGRESS' : actor.type === 'CANDIDATE' && t.status === 'RESOLVED' ? 'OPEN' : t.status;
    await this.prisma.helpdeskTicket.update({ where: { id }, data: { status, ...(actor.type === 'ADMIN' && !t.assignedToId && { assignedToId: actor.id }) } });
    if (actor.type === 'ADMIN') await this.notifyCandidate(t.candidateId, t.ticketNo, 'reply received');
    await this.audit.log({ action: 'TICKET_REPLY', entity: 'HelpdeskTicket', entityId: id });
    return this.get(id, actor.type === 'CANDIDATE' ? actor.id : undefined);
  }

  private async notifyCandidate(candidateId: string | null, ticketNo: string, status: string) {
    if (!candidateId) return;
    const v = await this.data.view(candidateId);
    await this.prisma.notification.create({ data: { candidateId, titleKey: 'notifications.ticketUpdated', params: { ticketNo }, link: '/helpdesk' } });
    await this.notify.send({ templateCode: 'TICKET_UPDATE', lang: v.language as 'en' | 'hi', email: v.email, params: { ticketNo, status } });
  }

  // admin
  async adminList(q: { status?: string; cursor?: string; limit: number }) {
    const rows = await this.prisma.helpdeskTicket.findMany({
      where: { ...(q.status && { status: q.status as never }) }, orderBy: { createdAt: 'desc' }, take: q.limit + 1, ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      select: { id: true, ticketNo: true, category: true, subject: true, status: true, assignedToId: true, createdAt: true, updatedAt: true, candidate: { select: { otrId: true } } },
    });
    return { items: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null };
  }

  async setStatus(id: string, adminId: string, body: unknown) {
    const { status } = parseOrThrow(ticketStatusSchema, body);
    const t = await this.prisma.helpdeskTicket.update({ where: { id }, data: { status } });
    await this.audit.log({ action: 'TICKET_STATUS', entity: 'HelpdeskTicket', entityId: id, actorType: 'ADMIN', actorId: adminId, after: { status } });
    await this.notifyCandidate(t.candidateId, t.ticketNo, status.toLowerCase().replace('_', ' '));
    return t;
  }

  async assign(id: string, adminId: string, body: unknown) {
    const { assigneeId } = parseOrThrow(z.object({ assigneeId: z.string().uuid().nullable() }), body);
    const t = await this.prisma.helpdeskTicket.update({ where: { id }, data: { assignedToId: assigneeId } });
    await this.audit.log({ action: 'TICKET_ASSIGNED', entity: 'HelpdeskTicket', entityId: id, actorType: 'ADMIN', actorId: adminId, after: { assigneeId } });
    return t;
  }
}
