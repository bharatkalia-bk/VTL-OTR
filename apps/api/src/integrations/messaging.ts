import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Env } from '../config/env';
import { logger } from '../infra/logger';
import type { RedisService } from '../infra/redis.service';
import type { EmailGateway, SmsGateway } from './types';

/** Mock SMS: logs a masked line; with DEV_EXPOSE_SECRETS keeps the last messages in Redis for local testing. */
export class MockSms implements SmsGateway {
  constructor(private readonly redis: RedisService, private readonly env: Env) {}
  async send(to: string, text: string, meta: { templateCode: string }): Promise<{ providerRef: string }> {
    const ref = `MOCKSMS-${randomUUID()}`;
    logger.info({ template: meta.templateCode, to: `XXXXXX${to.slice(-4)}`, ref }, 'sms sent (mock)');
    if (this.env.DEV_EXPOSE_SECRETS) {
      const k = this.redis.key('dev', 'sms', to);
      await this.redis.client.lpush(k, JSON.stringify({ text, at: new Date().toISOString(), template: meta.templateCode }));
      await this.redis.client.ltrim(k, 0, 19);
      await this.redis.client.expire(k, 3600);
    }
    return { providerRef: ref };
  }
}

export class SmtpEmail implements EmailGateway {
  private readonly transport;
  constructor(private readonly redis: RedisService, private readonly env: Env) {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' }, requireTLS: !env.SMTP_SECURE } : { ignoreTLS: true }),
    });
  }
  async send(msg: Parameters<EmailGateway['send']>[0]): Promise<{ providerRef: string }> {
    const info = await this.transport.sendMail({ from: this.env.EMAIL_FROM, ...msg });
    await devStore(this.redis, this.env, msg.to, msg.subject, msg.text);
    return { providerRef: info.messageId };
  }
}

export class MockEmail implements EmailGateway {
  constructor(private readonly redis: RedisService, private readonly env: Env) {}
  async send(msg: Parameters<EmailGateway['send']>[0]): Promise<{ providerRef: string }> {
    const ref = `MOCKMAIL-${randomUUID()}`;
    logger.info({ subject: msg.subject, ref }, 'email sent (mock)');
    await devStore(this.redis, this.env, msg.to, msg.subject, msg.text);
    return { providerRef: ref };
  }
}

async function devStore(redis: RedisService, env: Env, to: string, subject: string, text: string) {
  if (!env.DEV_EXPOSE_SECRETS) return;
  const k = redis.key('dev', 'email', to.toLowerCase());
  await redis.client.lpush(k, JSON.stringify({ subject, text, at: new Date().toISOString() }));
  await redis.client.ltrim(k, 0, 19);
  await redis.client.expire(k, 3600);
}

/**
 * Generic HTTP SMS gateway adapter. Most Indian DLT-registered gateways accept a templated GET/POST.
 * Example: SMS_HTTP_URL=https://api.example-sms.in/send?apikey=XXXX&sender=VTLOTR&to=91{to}&msg={text}&dlt={dlt}
 */
export class HttpSms implements SmsGateway {
  constructor(private readonly env: Env) {}
  async send(to: string, text: string, meta: { templateCode: string; dltTemplateId?: string | null }): Promise<{ providerRef: string }> {
    const fill = (tpl: string, enc: (s: string) => string) => tpl.replace(/\{to\}/g, enc(to)).replace(/\{text\}/g, enc(text)).replace(/\{dlt\}/g, enc(meta.dltTemplateId ?? ''));
    const url = fill(this.env.SMS_HTTP_URL!, encodeURIComponent);
    const body = this.env.SMS_HTTP_BODY ? fill(this.env.SMS_HTTP_BODY, (s) => JSON.stringify(s).slice(1, -1)) : undefined;
    const res = await fetch(url, { method: this.env.SMS_HTTP_METHOD, headers: body ? { 'Content-Type': 'application/json' } : undefined, body, signal: AbortSignal.timeout(10_000) });
    const out = await res.text();
    if (!res.ok || (this.env.SMS_HTTP_SUCCESS_REGEX && !new RegExp(this.env.SMS_HTTP_SUCCESS_REGEX).test(out))) {
      throw new Error(`SMS gateway error ${res.status}`);
    }
    logger.info({ template: meta.templateCode, to: `XXXXXX${to.slice(-4)}` }, 'sms sent');
    return { providerRef: out.slice(0, 120) };
  }
}
