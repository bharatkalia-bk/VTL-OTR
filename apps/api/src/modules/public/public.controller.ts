import { BadRequestException, Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ENV, type Env } from '../../config/env';
import { CaptchaService } from '../../integrations/captcha';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { SettingsService } from '../../infra/settings.service';
import { FsStorage, STORAGE, type StorageAdapter } from '../../infra/storage';
import { QrSignerService } from '../pdf/qr-signer.service';

@ApiTags('Public')
@Controller()
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly captcha: CaptchaService,
    private readonly qr: QrSignerService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('captcha')
  newCaptcha() {
    return this.captcha.create();
  }

  @Get('public/config')
  async config() {
    const s = await this.settings.get();
    return { helpdesk: s.helpdesk, faqs: s.faqs, photoSpec: s.photoSpec, signatureSpec: s.signatureSpec, documentMaxBytes: s.documentMaxBytes, otrIdFormat: s.otrIdFormat };
  }

  @Get('public/exams')
  exams() {
    return this.redis.cached(this.redis.key('cache', 'public-exams'), 60, async () => {
      const rows = await this.prisma.exam.findMany({ where: { status: { in: ['PUBLISHED', 'CLOSED'] } }, orderBy: { createdAt: 'desc' }, include: { posts: { select: { code: true, titleEn: true, titleHi: true, vacancies: true } } } });
      return rows.map((e) => ({ id: e.id, code: e.code, titleEn: e.titleEn, titleHi: e.titleHi, notificationNo: e.notificationNo, conductingBody: e.conductingBody, status: e.status, dates: e.dates, posts: e.posts, descriptionEn: e.descriptionEn, descriptionHi: e.descriptionHi }));
    });
  }

  @Get('public/masters/:type')
  masters(@Param('type') type: string, @Query('state') state?: string) {
    const key = this.redis.key('cache', 'masters', type, state ?? '');
    return this.redis.cached(key, 300, async () => {
      switch (type) {
        case 'states': return this.prisma.state.findMany({ orderBy: { nameEn: 'asc' } });
        case 'districts':
          if (!state) throw new BadRequestException({ code: 'STATE_REQUIRED', message: 'state is required' });
          return this.prisma.district.findMany({ where: { stateCode: state }, orderBy: { name: 'asc' } });
        case 'boards': return this.prisma.board.findMany({ orderBy: { name: 'asc' } });
        case 'universities': return this.prisma.university.findMany({ orderBy: { name: 'asc' } });
        case 'qualifications': return this.prisma.qualification.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }] });
        default: throw new BadRequestException({ code: 'UNKNOWN_MASTER', message: 'Unknown master type' });
      }
    });
  }

  /** QR verification for admit cards (used by centre staff by scanning the QR). */
  @Get('verify/admit/:token')
  async verifyAdmit(@Param('token') token: string) {
    const p = await this.qr.verify(token);
    if (!p) return { valid: false };
    const ac = await this.prisma.admitCard.findFirst({ where: { rollNo: p.r, application: { applicationNo: p.a } }, include: { application: { include: { exam: true } }, centre: true } });
    if (!ac || !ac.releasedAt) return { valid: false };
    const photoUrl = ac.application.photoKey ? await this.storage.signedUrl(ac.application.photoKey, 300) : null;
    return { valid: true, rollNo: p.r, otrId: p.o, applicationNo: p.a, exam: ac.application.exam.titleEn, centre: ac.centre?.name ?? null, photoUrl, issuedAt: new Date(p.t * 1000) };
  }

  @Get('verify/public-key')
  async publicKey() {
    return { algorithm: 'Ed25519', pem: await this.qr.publicKeyPem() };
  }

  /** Signed-URL file serving for the filesystem storage driver (S3/MinIO serves its own signed URLs). */
  @Get('files')
  async file(@Query('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Query('dl') dl: string | undefined, @Res() res: Response) {
    if (!(this.storage instanceof FsStorage) || !key || !FsStorage.verify(this.env.FILE_URL_SECRET, key, Number(exp), sig ?? '', dl)) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Link expired or invalid.' });
      return;
    }
    const buf = await this.storage.get(key).catch(() => null);
    if (!buf) { res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' }); return; }
    const type = key.endsWith('.pdf') ? 'application/pdf' : key.endsWith('.png') ? 'image/png' : key.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : key.endsWith('.csv') ? 'text/csv' : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (dl) res.setHeader('Content-Disposition', `attachment; filename="${dl.replace(/[^\w.\- ]/g, '_')}"`);
    res.send(buf);
  }
}
