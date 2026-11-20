import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { campaignCreateSchema, campaignFilterSchema, templateUpsertSchema } from '@vtl/shared';
import type { z } from 'zod';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { QueueService } from '../../infra/queue.service';
import { FieldCrypto } from '../../security/field-crypto';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class CampaignsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly queue: QueueService, private readonly notify: NotifyService, private readonly crypto: FieldCrypto, private readonly audit: AuditService) {}

  onModuleInit(): void {
    this.queue.register('campaigns', 'run', async (d) => this.run(String(d.campaignId)));
  }

  templates() {
    return this.prisma.messageTemplate.findMany({ orderBy: [{ code: 'asc' }, { channel: 'asc' }, { language: 'asc' }] });
  }

  async upsertTemplate(adminId: string, body: unknown) {
    const b = parseOrThrow(templateUpsertSchema, body);
    const t = await this.prisma.messageTemplate.upsert({ where: { code_channel_language: { code: b.code, channel: b.channel, language: b.language } }, create: b, update: b });
    await this.audit.log({ action: 'TEMPLATE_SAVED', entity: 'MessageTemplate', entityId: t.id, actorType: 'ADMIN', actorId: adminId, after: b });
    return t;
  }

  where(f: z.infer<typeof campaignFilterSchema>): Prisma.CandidateWhereInput {
    return {
      status: f.candidateStatus ? (f.candidateStatus as never) : { not: 'BLOCKED' },
      ...(f.stateCode || f.category ? { profile: { ...(f.stateCode && { stateCode: f.stateCode }), ...(f.category && { category: f.category as never }) } } : {}),
      ...(f.examId && { applications: { some: { examId: f.examId, ...(f.applicationStatus && { status: f.applicationStatus as never }) } } }),
    };
  }

  async create(adminId: string, body: unknown) {
    const b = parseOrThrow(campaignCreateSchema, body);
    const total = await this.prisma.candidate.count({ where: this.where(b.filters) });
    if (b.dryRun) return { dryRun: true, total };
    const c = await this.prisma.bulkCampaign.create({ data: { name: b.name, templateCode: b.templateCode, filters: b.filters, total, createdById: adminId } });
    await this.audit.log({ action: 'CAMPAIGN_CREATED', entity: 'BulkCampaign', entityId: c.id, actorType: 'ADMIN', actorId: adminId, after: { ...b, total } });
    await this.queue.add('campaigns', 'run', { campaignId: c.id });
    return c;
  }

  list() {
    return this.prisma.bulkCampaign.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  /** Streams recipients in pages and enqueues one notify job each (rate shaping is done by queue concurrency). */
  async run(campaignId: string) {
    const c = await this.prisma.bulkCampaign.update({ where: { id: campaignId }, data: { status: 'RUNNING' } });
    const filters = campaignFilterSchema.parse(c.filters);
    let cursor: string | undefined;
    let sent = 0;
    for (;;) {
      const page = await this.prisma.candidate.findMany({ where: this.where(filters), take: 500, orderBy: { id: 'asc' }, ...(cursor && { cursor: { id: cursor }, skip: 1 }), include: { profile: { select: { fullNameEnc: true } } } });
      if (!page.length) break;
      for (const cand of page) {
        await this.notify.send({ templateCode: c.templateCode, lang: cand.language as 'en' | 'hi', mobile: this.crypto.decrypt(cand.mobileEnc), email: this.crypto.decrypt(cand.emailEnc), params: { name: this.crypto.decOpt(cand.profile?.fullNameEnc) ?? '', otrId: cand.otrId ?? '' }, campaignId });
        sent++;
      }
      cursor = page[page.length - 1]!.id;
    }
    return this.prisma.bulkCampaign.update({ where: { id: campaignId }, data: { status: 'DONE', sent, completedAt: new Date() } });
  }
}
