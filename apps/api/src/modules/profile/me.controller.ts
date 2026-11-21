import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CandidateGuard, CurrentUser } from '../../common/auth';
import { parseOrThrow } from '../../common/zod';
import { PrismaService } from '../../infra/prisma.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import type { AccessClaims } from '../../security/tokens.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { MediaService } from '../media/media.service';
import { PdfDocsService } from '../pdf/pdf-docs.service';
import { CorrectionsService } from './corrections.service';
import { DocumentsService } from './documents.service';
import { IdentityService } from './identity.service';
import { ProfileService } from './profile.service';
import { Inject } from '@nestjs/common';

const stepBody = z.object({ data: z.unknown(), final: z.boolean().default(false) });
const upload = (maxMb: number) => FileInterceptor('file', { limits: { fileSize: maxMb * 1024 * 1024, files: 1 } });

@ApiTags('Candidate profile')
@Controller('me')
@UseGuards(CandidateGuard)
export class MeController {
  constructor(
    private readonly data: CandidateDataService,
    private readonly profile: ProfileService,
    private readonly docs: DocumentsService,
    private readonly media: MediaService,
    private readonly identity: IdentityService,
    private readonly corrections: CorrectionsService,
    private readonly pdfDocs: PdfDocsService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  @Get('profile')
  get(@CurrentUser() u: AccessClaims) {
    return this.data.publicView(u.sub);
  }

  @Put('profile/personal')
  personal(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.profile.savePersonal(u.sub, parseOrThrow(stepBody, b));
  }
  @Put('profile/category')
  category(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.profile.saveCategory(u.sub, parseOrThrow(stepBody, b));
  }
  @Put('profile/address')
  address(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.profile.saveAddress(u.sub, parseOrThrow(stepBody, b));
  }
  @Put('profile/education')
  education(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.profile.saveEducation(u.sub, parseOrThrow(stepBody, b));
  }
  @Put('profile/declaration')
  declaration(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.profile.saveDeclaration(u.sub, b);
  }

  @Post('documents')
  @UseInterceptors(upload(5))
  uploadDoc(@CurrentUser() u: AccessClaims, @UploadedFile() file: Express.Multer.File, @Body('kind') kind: string) {
    return this.docs.upload(u.sub, kind, file);
  }
  @Get('documents/:id/url')
  docUrl(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.docs.ownedUrl(u.sub, id);
  }
  @Delete('documents/:id')
  delDoc(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.docs.remove(u.sub, id);
  }

  /** Issued when the camera starts. Required for photo upload (live-capture enforcement). */
  @Post('photo/session')
  @HttpCode(200)
  photoSession(@CurrentUser() u: AccessClaims) {
    return this.media.startSession(u.sub);
  }
  @Post('photo/attempts')
  @HttpCode(200)
  attempt(@CurrentUser() u: AccessClaims, @Body() b: unknown, @Req() req: Request) {
    return this.media.logAttempt(u.sub, b, req.get('user-agent'));
  }
  @Post('photo')
  @UseInterceptors(upload(1))
  photo(@CurrentUser() u: AccessClaims, @UploadedFile() file: Express.Multer.File, @Body('meta') meta: string) {
    return this.media.savePhoto(u.sub, file, meta);
  }
  @Post('signature')
  @UseInterceptors(upload(1))
  signature(@CurrentUser() u: AccessClaims, @UploadedFile() file: Express.Multer.File, @Body('method') method: string) {
    return this.media.saveSignature(u.sub, file, method);
  }

  @Post('identity/aadhaar/initiate')
  @HttpCode(200)
  aadhaarInit(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.identity.aadhaarInitiate(u.sub, b);
  }
  @Post('identity/aadhaar/verify')
  @HttpCode(200)
  aadhaarVerify(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.identity.aadhaarVerify(u.sub, b);
  }
  @Post('identity/digilocker/connect')
  @HttpCode(200)
  dlConnect(@CurrentUser() u: AccessClaims) {
    return this.identity.digilockerConnect(u.sub);
  }
  @Post('identity/apaar')
  @HttpCode(200)
  apaar(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.identity.apaarVerify(u.sub, b);
  }

  @Post('submit')
  @HttpCode(200)
  submit(@CurrentUser() u: AccessClaims) {
    return this.profile.submit(u.sub);
  }

  @Get('otr-slip.pdf')
  async slip(@CurrentUser() u: AccessClaims, @Res() res: Response) {
    const key = await this.pdfDocs.otrSlip(u.sub);
    const buf = await this.storage.get(key);
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id: u.sub }, select: { otrId: true } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OTR-Slip-${c.otrId}.pdf"`);
    res.send(buf);
  }

  @Post('contact/change/request')
  @HttpCode(200)
  contactReq(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.corrections.contactChangeRequest(u.sub, b);
  }
  @Post('contact/change/verify')
  @HttpCode(200)
  contactVerify(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.corrections.contactChangeVerify(u.sub, b);
  }

  @Get('corrections')
  myCorrections(@CurrentUser() u: AccessClaims) {
    return this.corrections.listMine(u.sub);
  }
  @Post('corrections')
  createCorrection(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.corrections.create(u.sub, b);
  }

  @Get('notifications')
  async notifications(@CurrentUser() u: AccessClaims, @Query('limit') limit?: string) {
    const items = await this.prisma.notification.findMany({ where: { candidateId: u.sub }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 20, 50) });
    const unread = await this.prisma.notification.count({ where: { candidateId: u.sub, readAt: null } });
    return { items, unread };
  }
  @Post('notifications/read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() u: AccessClaims) {
    await this.prisma.notification.updateMany({ where: { candidateId: u.sub, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('language')
  @HttpCode(200)
  async language(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    const { language } = parseOrThrow(z.object({ language: z.enum(['en', 'hi']) }), b);
    await this.prisma.candidate.update({ where: { id: u.sub }, data: { language } });
    return { language };
  }
}
