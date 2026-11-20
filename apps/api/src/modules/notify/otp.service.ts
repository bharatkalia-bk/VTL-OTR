import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { OtpPurpose } from '@vtl/shared';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { RateLimitService } from '../../infra/rate-limit.service';
import { RedisService } from '../../infra/redis.service';
import { SettingsService } from '../../infra/settings.service';
import { FieldCrypto } from '../../security/field-crypto';
import { NotifyService } from './notify.service';

type Channel = 'mobile' | 'email';
interface Challenge {
  purpose: OtpPurpose;
  subject: string;
  codes: Partial<Record<Channel, string>>;
  verified: Partial<Record<Channel, boolean>>;
  attempts: number;
  data?: Record<string, unknown>;
}

const PURPOSE_LABEL: Record<OtpPurpose, { en: string; hi: string }> = {
  REGISTER: { en: 'registration', hi: 'पंजीकरण' },
  LOGIN: { en: 'login', hi: 'लॉगिन' },
  FORGOT_PASSWORD: { en: 'password reset', hi: 'पासवर्ड रीसेट' },
  FORGOT_OTR: { en: 'OTR ID recovery', hi: 'OTR ID पुनः प्राप्ति' },
  CONTACT_CHANGE: { en: 'contact change', hi: 'संपर्क परिवर्तन' },
};

/** OTPs: 6 digits, hashed in Redis, TTL, attempt limits, send rate-limit and resend cooldown per target. */
@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly rl: RateLimitService,
    private readonly settings: SettingsService,
    private readonly notify: NotifyService,
    private readonly crypto: FieldCrypto,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private hash(challengeId: string, code: string) {
    return createHash('sha256').update(`${challengeId}:${code}`).digest('hex');
  }
  private key(id: string) { return this.redis.key('otp', id); }

  async create(purpose: OtpPurpose, subject: string, targets: { mobile?: string | null; email?: string | null }, lang: 'en' | 'hi', data?: Record<string, unknown>): Promise<{ challengeId: string; expiresIn: number; resendIn: number }> {
    const s = await this.settings.get();
    for (const [ch, v] of Object.entries(targets) as Array<[Channel, string | null | undefined]>) {
      if (!v) continue;
      const idx = this.crypto.blindIndex(ch, v);
      await this.rl.hit(`otp-send:${purpose}`, idx, s.otp.maxSendsPer15Min, 15 * 60);
      const cd = this.redis.key('otp-cd', purpose, idx);
      if (await this.redis.client.exists(cd)) {
        const ttl = await this.redis.client.ttl(cd);
        throw new HttpException({ code: 'OTP_COOLDOWN', message: `Please wait ${ttl} seconds before requesting a new code.`, retryAfter: ttl }, HttpStatus.TOO_MANY_REQUESTS);
      }
      await this.redis.client.set(cd, '1', 'EX', s.otp.resendCooldownSeconds);
    }
    const challengeId = randomBytes(16).toString('base64url');
    const ch: Challenge = { purpose, subject, codes: {}, verified: {}, attempts: 0, data };
    const sends: Array<Promise<void>> = [];
    for (const [channel, v] of Object.entries(targets) as Array<[Channel, string | null | undefined]>) {
      if (!v) continue;
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      ch.codes[channel] = this.hash(challengeId, code);
      if (this.env.DEV_EXPOSE_SECRETS) await this.redis.client.set(this.redis.key('dev', 'otp', v.toLowerCase()), code, 'EX', s.otp.ttlSeconds);
      sends.push(this.notify.send({ templateCode: 'OTP', lang, [channel]: v, params: { otp: code, purpose: PURPOSE_LABEL[purpose][lang] } }));
    }
    await this.redis.setJson(this.key(challengeId), ch, s.otp.ttlSeconds);
    await Promise.all(sends);
    return { challengeId, expiresIn: s.otp.ttlSeconds, resendIn: s.otp.resendCooldownSeconds };
  }

  /** Verifies all provided codes; returns the challenge (and deletes it) when every channel is verified. */
  async verify(challengeId: string, codes: Partial<Record<Channel, string>>, purpose: OtpPurpose): Promise<Challenge> {
    const s = await this.settings.get();
    const ch = await this.redis.getJson<Challenge>(this.key(challengeId));
    if (!ch || ch.purpose !== purpose) throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'This code has expired. Please request a new one.' });
    if (ch.attempts >= s.otp.maxVerifyAttempts) {
      await this.redis.client.del(this.key(challengeId));
      throw new HttpException({ code: 'OTP_LOCKED', message: 'Too many wrong attempts. Please request a new code.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const wrong: Channel[] = [];
    for (const channel of Object.keys(ch.codes) as Channel[]) {
      const given = codes[channel];
      if (ch.verified[channel]) continue;
      const expected = Buffer.from(ch.codes[channel]!);
      const got = Buffer.from(given ? this.hash(challengeId, given) : '');
      if (expected.length === got.length && timingSafeEqual(expected, got)) ch.verified[channel] = true;
      else wrong.push(channel);
    }
    if (wrong.length) {
      ch.attempts += 1;
      const ttl = await this.redis.client.ttl(this.key(challengeId));
      await this.redis.setJson(this.key(challengeId), ch, Math.max(ttl, 1));
      throw new BadRequestException({ code: 'OTP_INVALID', message: 'The code entered is incorrect.', channels: wrong, attemptsLeft: s.otp.maxVerifyAttempts - ch.attempts });
    }
    await this.redis.client.del(this.key(challengeId));
    return ch;
  }
}
