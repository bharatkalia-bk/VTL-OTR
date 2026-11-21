import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { AuditService } from '../../infra/audit.service';
import { logger } from '../../infra/logger';
import { PrismaService } from '../../infra/prisma.service';
import { QueueService } from '../../infra/queue.service';
import { SettingsService } from '../../infra/settings.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';

/** DPDP data retention: purge abandoned (never submitted) drafts after the configured inactivity period. */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  onModuleInit(): void {
    this.queue.register('maintenance', 'purge-drafts', async () => this.purgeDrafts());
  }

  async schedule(): Promise<void> {
    await this.queue.addRepeatable('payments', 'reconcile', 5 * 60 * 1000);
    await this.queue.addRepeatable('maintenance', 'purge-drafts', 24 * 3600 * 1000);
  }

  async purgeDrafts(): Promise<{ purged: number }> {
    const { retention } = await this.settings.get();
    const cutoff = new Date(Date.now() - retention.draftDays * 24 * 3600 * 1000);
    const stale = await this.prisma.candidate.findMany({ where: { status: 'DRAFT', updatedAt: { lt: cutoff }, OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }] }, select: { id: true, documents: { select: { objectKey: true } }, media: { select: { objectKey: true } } }, take: 1000 });
    for (const c of stale) {
      await Promise.all([...c.documents, ...c.media].map((o) => this.storage.delete(o.objectKey).catch(() => undefined)));
      await this.prisma.candidate.delete({ where: { id: c.id } });
      await this.audit.log({ action: 'DRAFT_PURGED_RETENTION', entity: 'Candidate', entityId: c.id, actorType: 'SYSTEM' });
    }
    if (stale.length) logger.info({ purged: stale.length }, 'retention purge');
    return { purged: stale.length };
  }
}
