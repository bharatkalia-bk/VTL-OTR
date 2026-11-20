import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CandidateGuard, CurrentUser } from '../../common/auth';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import type { AccessClaims } from '../../security/tokens.service';
import { ExamsService } from '../exams/exams.service';
import { PdfDocsService } from '../pdf/pdf-docs.service';
import { ApplicationsService } from './applications.service';

@ApiTags('Exams & applications')
@Controller()
@UseGuards(CandidateGuard)
export class ApplicationsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly apps: ApplicationsService,
    private readonly pdf: PdfDocsService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  @Get('exams')
  list(@CurrentUser() u: AccessClaims) {
    return this.exams.listForCandidate(u.sub);
  }
  @Get('exams/:id')
  exam(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.exams.detailForCandidate(u.sub, id);
  }

  @Get('applications')
  apps_(@CurrentUser() u: AccessClaims) {
    return this.apps.list(u.sub);
  }
  @Post('applications')
  @HttpCode(200)
  draft(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.apps.saveDraft(u.sub, b);
  }
  @Get('applications/:id')
  get(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.get(u.sub, id);
  }
  @Post('applications/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.submit(u.sub, id);
  }
  @Delete('applications/:id')
  discard(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.withdraw(u.sub, id);
  }

  @Get('applications/:id/form.pdf')
  async form(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.apps.get(u.sub, id);
    if (a.status === 'DRAFT') throw new AppError('NOT_SUBMITTED', 'Submit the application first.');
    const buf = await this.pdf.applicationForm(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Application-${a.applicationNo}.pdf"`);
    res.send(buf);
  }

  @Get('applications/:id/admit-card.pdf')
  async admit(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const ac = await this.prisma.admitCard.findFirst({ where: { applicationId: id, application: { candidateId: u.sub } } });
    if (!ac?.releasedAt) throw new AppError('NOT_RELEASED', 'The admit card has not been released yet.', 404);
    const key = await this.pdf.admitCard(ac.id);
    await this.prisma.admitCard.update({ where: { id: ac.id }, data: { downloadedAt: ac.downloadedAt ?? new Date() } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AdmitCard-${ac.rollNo}.pdf"`);
    res.send(await this.storage.get(key));
  }
}
