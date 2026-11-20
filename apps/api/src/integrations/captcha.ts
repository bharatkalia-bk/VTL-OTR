import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { ENV, type Env } from '../config/env';
import { RedisService } from '../infra/redis.service';

/** Self-hosted captcha (no third-party calls). Single use, 5 minute TTL. */
@Injectable()
export class CaptchaService {
  constructor(private readonly redis: RedisService, @Inject(ENV) private readonly env: Env) {}

  async create(): Promise<{ captchaId: string; svg: string }> {
    const c = svgCaptcha.create({ size: 5, noise: 2, color: false, ignoreChars: '0oO1ilI', background: '#f6f7fb', width: 160, height: 56 });
    const captchaId = randomBytes(12).toString('base64url');
    await this.redis.client.set(this.redis.key('captcha', captchaId), c.text.toLowerCase(), 'EX', 300);
    if (this.env.DEV_EXPOSE_SECRETS) await this.redis.client.set(this.redis.key('dev', 'captcha', captchaId), c.text, 'EX', 300);
    return { captchaId, svg: c.data };
  }

  async verify(captchaId: string, text: string): Promise<void> {
    if (this.env.CAPTCHA_DRIVER === 'disabled') return;
    const key = this.redis.key('captcha', captchaId);
    const expected = await this.redis.client.getdel(key);
    if (!expected || expected !== text.trim().toLowerCase()) {
      throw new BadRequestException({ code: 'CAPTCHA_INVALID', message: 'The captcha did not match. Please try again.' });
    }
  }
}
