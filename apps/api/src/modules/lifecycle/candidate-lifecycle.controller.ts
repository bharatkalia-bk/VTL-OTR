import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CandidateGuard, CurrentUser } from '../../common/auth';
import { AppError } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { FieldCrypto } from '../../security/field-crypto';
import type { AccessClaims } from '../../security/tokens.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { MediaService } from '../media/media.service';
import { PaymentsService } from '../payments/payments.service';
import { PdfService } from '../pdf/pdf.service';
import { AssessmentService } from './assessment.service';
import { notFound, snapshotOf } from './common';
import { DebarmentService } from './debarment.service';
import { ResultsService } from './results.service';
import { SelectionService } from './selection.service';

const upload = (maxMb: number) => FileInterceptor('file', { limits: { fileSize: maxMb * 1024 * 1024, files: 1 } });
const IST = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

@ApiTags('Candidate: exam, results and selection')
@Controller('me')
@UseGuards(CandidateGuard)
export class CandidateLifecycleController {
  constructor(
    private readonly assess: AssessmentService,
    private readonly results: ResultsService,
    private readonly selection: SelectionService,
    private readonly debar: DebarmentService,
    private readonly payments: PaymentsService,
    private readonly media: MediaService,
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly data: CandidateDataService,
    private readonly pdf: PdfService,
  ) {}

  @Post('media/thumb') @UseInterceptors(upload(1)) thumb(@CurrentUser() u: AccessClaims, @UploadedFile() f?: Express.Multer.File) { return this.media.saveAuxiliary(u.sub, 'THUMB', f); }
  @Post('media/declaration') @UseInterceptors(upload(1)) decl(@CurrentUser() u: AccessClaims, @UploadedFile() f?: Express.Multer.File) { return this.media.saveAuxiliary(u.sub, 'DECLARATION', f); }

  @Get('applications/:id/response-sheet') sheet(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.assess.responseSheet(u.sub, id); }
  @Post('applications/:id/omr-carbon') @HttpCode(200) @UseInterceptors(upload(6)) carbon(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() f?: Express.Multer.File) { return this.assess.uploadCarbon(u.sub, id, f); }
  @Post('applications/:id/objections') objection(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.assess.createObjection(u.sub, id, b); }
  @Delete('objections/:id') withdraw(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.assess.withdrawObjection(u.sub, id); }
  @Post('objections/:id/pay') @HttpCode(200) pay(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.payments.initiateObjection(u.sub, id); }

  @Get('results') mine(@CurrentUser() u: AccessClaims) { return this.results.mine(u.sub); }
  @Get('applications/:id/results') one(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.results.mine(u.sub, id); }

  @Get('applications/:id/selection') sel(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.selection.mine(u.sub, id); }
  @Get('applications/:id/preferences') prefs(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.selection.preferenceOptions(u.sub, id); }
  @Put('applications/:id/preferences') savePrefs(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.selection.savePreferences(u.sub, id, b); }
  @Post('applications/:id/allotment/accept') @HttpCode(200) accept(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.selection.respond(u.sub, id, true); }
  @Post('applications/:id/allotment/decline') @HttpCode(200) decline(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.selection.respond(u.sub, id, false); }

  @Get('debarments') debarments(@CurrentUser() u: AccessClaims) { return this.debar.mine(u.sub); }

  /** Call letter for a later stage (Tier 2 / interview) or the document verification day. */
  @Get('applications/:id/call-letter/:stage')
  async letter(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('stage') stage: string, @Res() res: Response) {
    const app = await this.prisma.application.findFirst({ where: { id, candidateId: u.sub }, include: { exam: true, admitCard: true } });
    if (!app) notFound('Application');
    const v = await snapshotOf(this.crypto, this.data, app);
    let rows: Array<[string, string]>;
    let title: string;
    if (stage === 'DV') {
      const dv = await this.prisma.dvSession.findUnique({ where: { applicationId: id } });
      const al = await this.prisma.allotment.findUnique({ where: { applicationId: id } });
      if (!dv) throw new AppError('NOT_CALLED', 'No document verification is scheduled for you.', 404);
      title = 'Document Verification Call Letter';
      rows = [['Date', dv.date], ['Reporting slot', `${dv.slot} IST`], ['Venue', dv.venue], ['Allotted', al ? `${al.orgName} (${al.category} seat)` : '-']];
    } else {
      const call = await this.prisma.stageCall.findUnique({ where: { applicationId_stage: { applicationId: id, stage } } });
      if (!call?.letterReleasedAt) throw new AppError('NOT_CALLED', 'No call letter has been issued for this stage.', 404);
      title = stage === 'INTERVIEW' ? 'Interview Call Letter' : `${stage} Call Letter`;
      rows = [['Stage', stage], ['Reporting time', call.slotAt ? `${IST(call.slotAt)} IST` : 'As notified'], ['Venue', call.venue ?? 'As notified']];
    }
    const photo = app.photoKey ? `data:image/jpeg;base64,${(await this.mediaBytes(app.photoKey)).toString('base64')}` : '';
    const buf = await this.pdf.render('call-letter', {
      assets: this.pdf.assets, title, exam: { title: app.exam.titleEn }, rollNo: app.admitCard?.rollNo ?? '', name: v.personal.fullName, father: v.personal.fatherName, otrId: v.otrId, applicationNo: app.applicationNo, rows: rows.map(([k, val]) => ({ k, v: val })), photo,
      instructions: stage === 'DV'
        ? ['Bring originals and one self-attested copy of every certificate uploaded online.', 'Bring this letter and an original photo ID.', 'Category, PwD and ex-serviceman benefits are confirmed only on production of valid originals.']
        : ['Report 30 minutes before your slot with this letter and an original photo ID.', 'Mobile phones and electronic devices are not allowed in the interview area.'],
      generatedAt: IST(new Date()), ref: app.applicationNo,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="call-letter-${stage.toLowerCase()}.pdf"`);
    res.end(buf);
  }

  private mediaBytes(key: string) { return this.media.read(key); }
}
