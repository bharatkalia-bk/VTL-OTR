import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FieldCrypto } from '../security/field-crypto';
import { PrismaService } from './prisma.service';
import { ctx } from './request-context';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  actorType?: string;
  actorId?: string | null;
}

/** Every candidate and admin action with actor, IP, timestamp and encrypted before/after values. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: FieldCrypto) {}

  async log(e: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const c = ctx();
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorType: e.actorType ?? c?.actorType ?? 'SYSTEM',
        actorId: e.actorId ?? c?.actorId ?? null,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        beforeEnc: e.before === undefined ? null : this.crypto.encJson(e.before),
        afterEnc: e.after === undefined ? null : this.crypto.encJson(e.after),
        ip: c?.ip ?? null,
        userAgent: c?.userAgent?.slice(0, 300) ?? null,
        requestId: c?.requestId ?? null,
      },
    });
  }

  decode(row: { beforeEnc: string | null; afterEnc: string | null }): { before: unknown; after: unknown } {
    return { before: this.crypto.decJson(row.beforeEnc), after: this.crypto.decJson(row.afterEnc) };
  }
}
