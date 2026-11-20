import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService, @Inject(STORAGE) private readonly storage: StorageAdapter) {}

  @Get('live')
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const checks: Record<string, string> = {};
    await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => (checks.db = 'ok')).catch(() => (checks.db = 'down')),
      this.redis.client.ping().then(() => (checks.redis = 'ok')).catch(() => (checks.redis = 'down')),
      this.storage.ensureReady().then(() => (checks.storage = 'ok')).catch(() => (checks.storage = 'down')),
    ]);
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({ status: ok ? 'ok' : 'degraded', checks });
  }
}
