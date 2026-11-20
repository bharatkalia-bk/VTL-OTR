import { Injectable } from '@nestjs/common';
import { DEFAULT_OTR_ID_FORMAT, DEFAULT_PHOTO_SPEC, DEFAULT_SIGNATURE_SPEC, photoSpecSchema, signatureSpecSchema } from '@vtl/shared';
import { z } from 'zod';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

export const settingsSchema = z.object({
  otrIdFormat: z.object({ prefix: z.string().regex(/^[A-Z][A-Z0-9-]{1,15}$/), seqWidth: z.number().int().min(5).max(10) }).default(DEFAULT_OTR_ID_FORMAT),
  photoSpec: photoSpecSchema.default(DEFAULT_PHOTO_SPEC),
  signatureSpec: signatureSpecSchema.default(DEFAULT_SIGNATURE_SPEC),
  livenessMethods: z.array(z.enum(['BLINK', 'HEAD_TURN'])).min(1).default(['BLINK', 'HEAD_TURN']),
  otp: z.object({ ttlSeconds: z.number().int().default(600), maxVerifyAttempts: z.number().int().default(5), maxSendsPer15Min: z.number().int().default(3), resendCooldownSeconds: z.number().int().default(30) }).default({}),
  lockout: z.object({ maxFailures: z.number().int().default(5), lockMinutes: z.number().int().default(30) }).default({}),
  retention: z.object({ draftDays: z.number().int().default(180), auditYears: z.number().int().default(7) }).default({}),
  documentMaxBytes: z.number().int().default(500 * 1024),
  helpdesk: z.object({ phone: z.string().default('1800-000-0000'), email: z.string().default('helpdesk@vtl-otr.local'), hours: z.string().default('10:00 to 18:00 IST, Monday to Saturday') }).default({}),
  faqs: z.array(z.object({ qEn: z.string(), qHi: z.string(), aEn: z.string(), aHi: z.string() })).default([]),
});
export type Settings = z.infer<typeof settingsSchema>;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async get(): Promise<Settings> {
    return this.redis.cached(this.redis.key('settings'), 60, async () => {
      const rows = await this.prisma.systemSetting.findMany();
      const obj: Record<string, unknown> = {};
      for (const r of rows) obj[r.key] = r.value;
      return settingsSchema.parse(obj);
    });
  }

  async update(patch: Partial<Settings>, actorId?: string): Promise<Settings> {
    const merged = settingsSchema.parse({ ...(await this.get()), ...patch });
    for (const [key, value] of Object.entries(patch)) {
      await this.prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: merged[key as keyof Settings] as object, updatedById: actorId },
        update: { value: merged[key as keyof Settings] as object, updatedById: actorId },
      });
    }
    await this.redis.client.del(this.redis.key('settings'));
    return merged;
  }
}
