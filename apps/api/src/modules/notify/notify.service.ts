import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import Handlebars from 'handlebars';
import { DEFAULT_TEMPLATES, emailLayout } from '../../../templates/messages';
import { ENV, type Env } from '../../config/env';
import { logger } from '../../infra/logger';
import { PrismaService } from '../../infra/prisma.service';
import { QueueService } from '../../infra/queue.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { FieldCrypto } from '../../security/field-crypto';
import { EMAIL, SMS, type EmailGateway, type SmsGateway } from '../../integrations/types';

export interface NotifyInput {
  templateCode: string;
  lang: 'en' | 'hi';
  mobile?: string | null;
  email?: string | null;
  params: Record<string, string | number>;
  /** storage keys of attachments (email only) */
  attachmentKeys?: Array<{ key: string; filename: string }>;
  campaignId?: string;
}

/** Renders templates and dispatches SMS/email through the queue with retries and an outbound log (target stored as blind index only). */
@Injectable()
export class NotifyService implements OnModuleInit {
  private readonly cache = new Map<string, HandlebarsTemplateDelegate>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly crypto: FieldCrypto,
    @Inject(SMS) private readonly sms: SmsGateway,
    @Inject(EMAIL) private readonly email: EmailGateway,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queue.register('notify', 'send', async (d) => this.deliver(d as unknown as NotifyInput & { encMobile?: string; encEmail?: string }));
  }

  /** Targets are encrypted inside the job payload so plaintext PII never sits in Redis. */
  async send(input: NotifyInput): Promise<void> {
    const { mobile, email, ...rest } = input;
    await this.queue.add('notify', 'send', {
      ...rest,
      encMobile: mobile ? this.crypto.encrypt(mobile) : undefined,
      encEmail: email ? this.crypto.encrypt(email) : undefined,
    }, input.templateCode === 'OTP' ? { priority: 1, attempts: 3 } : {});
  }

  private async template(code: string, channel: 'SMS' | 'EMAIL', lang: 'en' | 'hi'): Promise<{ subject: string; body: string; dlt?: string | null } | null> {
    const row = await this.prisma.messageTemplate.findUnique({ where: { code_channel_language: { code, channel, language: lang } } });
    if (row) return { subject: row.subject, body: row.body, dlt: row.dltTemplateId };
    const d = DEFAULT_TEMPLATES[code]?.[channel]?.[lang] ?? DEFAULT_TEMPLATES[code]?.[channel]?.en;
    return d ? { subject: d.subject, body: d.body, dlt: d.dlt } : null;
  }

  render(src: string, params: Record<string, unknown>, html: boolean): string {
    const key = `${html ? 'h' : 't'}:${src}`;
    let fn = this.cache.get(key);
    if (!fn) {
      fn = Handlebars.compile(src, { noEscape: !html, strict: false });
      this.cache.set(key, fn);
    }
    return fn(params);
  }

  private async deliver(d: NotifyInput & { encMobile?: string; encEmail?: string }): Promise<void> {
    const mobile = d.encMobile ? this.crypto.decrypt(d.encMobile) : null;
    const email = d.encEmail ? this.crypto.decrypt(d.encEmail) : null;
    if (mobile) {
      const t = await this.template(d.templateCode, 'SMS', d.lang);
      if (t) {
        const text = this.render(t.body, d.params, false);
        const log = await this.prisma.outboundMessage.create({ data: { channel: 'SMS', templateCode: d.templateCode, targetIdx: this.crypto.blindIndex('mobile', mobile), campaignId: d.campaignId } });
        try {
          const r = await this.sms.send(mobile, text, { templateCode: d.templateCode, dltTemplateId: t.dlt });
          await this.prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'SENT', providerRef: r.providerRef, attempts: { increment: 1 }, sentAt: new Date() } });
        } catch (e) {
          await this.prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'FAILED', attempts: { increment: 1 }, error: String(e).slice(0, 300) } });
          throw e;
        }
      }
    }
    if (email) {
      const t = await this.template(d.templateCode, 'EMAIL', d.lang);
      if (t) {
        const bodyHtml = this.render(t.body, d.params, true);
        const html = emailLayout(bodyHtml, { logoUrl: `${this.env.CANDIDATE_WEB_URL}/brand/vtl-logo.png`, lang: d.lang });
        const text = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const attachments = await Promise.all((d.attachmentKeys ?? []).map(async (a) => ({ filename: a.filename, content: await this.storage.get(a.key) })));
        const log = await this.prisma.outboundMessage.create({ data: { channel: 'EMAIL', templateCode: d.templateCode, targetIdx: this.crypto.blindIndex('email', email), campaignId: d.campaignId } });
        try {
          const r = await this.email.send({ to: email, subject: this.render(t.subject, d.params, false), html, text, attachments });
          await this.prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'SENT', providerRef: r.providerRef, attempts: { increment: 1 }, sentAt: new Date() } });
        } catch (e) {
          logger.warn({ template: d.templateCode, err: String(e) }, 'email failed');
          await this.prisma.outboundMessage.update({ where: { id: log.id }, data: { status: 'FAILED', attempts: { increment: 1 }, error: String(e).slice(0, 300) } });
          throw e;
        }
      }
    }
  }
}
