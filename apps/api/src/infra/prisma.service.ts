import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
  async nextSeq(name: 'otr_seq' | 'application_seq' | 'ticket_seq'): Promise<number> {
    const rows = await this.$queryRawUnsafe<Array<{ v: bigint }>>(`SELECT nextval('${name}') AS v`);
    return Number(rows[0]!.v);
  }
}
