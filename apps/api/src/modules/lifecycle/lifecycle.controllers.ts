import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RESULT_STAGES, type ResultStage } from '@vtl/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AdminGuard, CurrentUser, Roles, StepUp } from '../../common/auth';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { PrismaService } from '../../infra/prisma.service';
import { TokensService, type AccessClaims } from '../../security/tokens.service';
import { AgencyService } from './agency.service';
import { AssessmentService } from './assessment.service';
import { ChannelsService } from './channels.service';
import { scopeOf } from './common';
import { DebarmentService } from './debarment.service';
import { ExamDayService } from './examday.service';
import { JourneyService } from './journey.service';
import { ObserverService } from './observer.service';
import { ResultsService } from './results.service';
import { SelectionService } from './selection.service';

const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const stageParam = (s: string): ResultStage => {
  if (!(RESULT_STAGES as readonly string[]).includes(s)) throw new AppError('INVALID_STAGE', 'Unknown stage.');
  return s as ResultStage;
};
const pdf = (res: Response, name: string, buf: Buffer) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
};

// ───────────── Exam day: shifts, centre desk, biometric alerts, technical exceptions ─────────────
@ApiTags('Exam day')
@Controller('admin')
@UseGuards(AdminGuard)
export class ExamDayController {
  constructor(private readonly svc: ExamDayService, private readonly prisma: PrismaService) {}

  @Get('exams/:id/shifts') @Roles('EXAM_ADMIN', 'AUDITOR', 'VERIFIER', 'HELPDESK_AGENT') shifts(@Param('id', ParseUUIDPipe) id: string) { return this.svc.listShifts(id); }
  @Post('exams/:id/shifts') @Roles('EXAM_ADMIN') addShift(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.upsertShift(u.sub, id, b); }
  @Put('exams/:id/shifts/:shiftId') @Roles('EXAM_ADMIN') updShift(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('shiftId', ParseUUIDPipe) sid: string, @Body() b: unknown) { return this.svc.upsertShift(u.sub, id, b, sid); }
  @Post('exams/:id/shifts/assign') @HttpCode(200) @Roles('EXAM_ADMIN') assign(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.assignShifts(u.sub, id, b); }

  @Get('centre/centres') @Roles('CENTRE_SUPERINTENDENT', 'EXAM_ADMIN', 'AUDITOR') centres(@CurrentUser() u: AccessClaims, @Query('examId') examId?: string) { return this.svc.centres(u, examId); }
  @Post('centre/lookup') @HttpCode(200) @Roles('CENTRE_SUPERINTENDENT', 'EXAM_ADMIN') lookup(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    return this.svc.lookup(u, parseOrThrow(z.object({ token: z.string().max(800).optional(), rollNo: z.string().max(40).optional(), examId: z.string().uuid().optional() }), b));
  }
  @Post('centre/attendance') @HttpCode(200) @Roles('CENTRE_SUPERINTENDENT') mark(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.markAttendance(u, b); }
  @Get('centre/centres/:centreId/roster') @Roles('CENTRE_SUPERINTENDENT', 'EXAM_ADMIN', 'AUDITOR') roster(@CurrentUser() u: AccessClaims, @Param('centreId', ParseUUIDPipe) c: string, @Query('shiftId') s?: string) { return this.svc.roster(u, c, s || undefined); }
  @Post('centre/centres/:centreId/close') @HttpCode(200) @Roles('CENTRE_SUPERINTENDENT') close(@CurrentUser() u: AccessClaims, @Param('centreId', ParseUUIDPipe) c: string, @Body() b: { shiftId?: string }) { return this.svc.closeAttendance(u, c, b?.shiftId || undefined); }
  @Get('centre/centres/:centreId/roll-sheet') @Roles('CENTRE_SUPERINTENDENT', 'EXAM_ADMIN') async sheet(@CurrentUser() u: AccessClaims, @Param('centreId', ParseUUIDPipe) c: string, @Res() res: Response, @Query('shiftId') s?: string) {
    pdf(res, `roll-sheet-${c.slice(0, 8)}.pdf`, await this.svc.rollSheet(u, c, s || undefined));
  }
  @Post('centre/centres/:centreId/exceptions') @Roles('CENTRE_SUPERINTENDENT') async centreException(@CurrentUser() u: AccessClaims, @Param('centreId', ParseUUIDPipe) c: string, @Body() b: unknown) {
    const centre = await this.prisma.examCentre.findUniqueOrThrow({ where: { id: c }, include: { city: true } });
    return this.svc.reportException(u, centre.city.examId, c, b, 'DESK');
  }
  @Post('centre/biometric-alerts') @Roles('CENTRE_SUPERINTENDENT') async deskAlert(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ examId: z.string().uuid() }).passthrough(), b);
    return this.svc.createAlert(x.examId, b, 'DESK', u.sub);
  }

  @Get('biometric-alerts') @Roles('EXAM_ADMIN', 'AUDITOR') alerts(@Query('examId') e?: string, @Query('status') s?: string) { return this.svc.listAlerts(e || undefined, s || undefined); }
  @Post('biometric-alerts/:id/review') @HttpCode(200) @Roles('EXAM_ADMIN') review(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.reviewAlert(u.sub, id, b); }

  @Get('tech-exceptions') @Roles('EXAM_ADMIN', 'AUDITOR') exceptions(@Query('examId') e?: string, @Query('status') s?: string) { return this.svc.listExceptions(e || undefined, s || undefined); }
  @Post('exams/:id/tech-exceptions') @Roles('EXAM_ADMIN', 'AGENCY') addException(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.reportException(u, id, undefined, b, u.roles?.includes('AGENCY') ? 'AGENCY' : 'ADMIN'); }
  @Post('tech-exceptions/:id/decision') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() decide(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.decideException(u.sub, id, b); }
}

// ───────────── Observers ─────────────
@ApiTags('Observers')
@Controller('admin')
@UseGuards(AdminGuard)
export class ObserversController {
  constructor(private readonly svc: ObserverService) {}
  @Get('exams/:id/observers') @Roles('EXAM_ADMIN', 'AUDITOR') list(@Param('id', ParseUUIDPipe) id: string) { return this.svc.list(id); }
  @Post('exams/:id/observers') @Roles('EXAM_ADMIN') assign(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.assign(u.sub, id, b); }
  @Post('observer-assignments/:id/waive') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() waive(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.waive(u.sub, id, parseOrThrow(reason, b).reason); }
  @Delete('observer-assignments/:id') @Roles('EXAM_ADMIN') remove(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u.sub, id); }

  @Get('observer/me') @Roles('OBSERVER') mine(@CurrentUser() u: AccessClaims) { return this.svc.mine(u); }
  @Post('observer/assignments/:id/coi') @HttpCode(200) @Roles('OBSERVER') coi(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.declare(u, id, b); }
  @Post('observer/sync') @HttpCode(200) @Roles('OBSERVER') sync(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.sync(u, b); }
}

// ───────────── Conducting agency (console side) ─────────────
@ApiTags('Agency')
@Controller('admin/agency')
@UseGuards(AdminGuard)
export class AgencyConsoleController {
  constructor(private readonly svc: AgencyService, private readonly prisma: PrismaService) {}
  @Get('exams') @Roles('AGENCY', 'EXAM_ADMIN', 'AUDITOR') async exams(@CurrentUser() u: AccessClaims) {
    const scope = await scopeOf(this.prisma, u);
    return this.prisma.exam.findMany({ where: scope.all || !scope.examIds.length ? { status: { not: 'DRAFT' } } : { id: { in: scope.examIds } }, select: { id: true, code: true, titleEn: true, status: true }, orderBy: { createdAt: 'desc' } });
  }
  @Get('keys') @Roles('AGENCY', 'EXAM_ADMIN', 'AUDITOR') keys(@CurrentUser() u: AccessClaims) { return this.svc.listKeys(u); }
  @Post('keys') @Roles('AGENCY', 'EXAM_ADMIN') @StepUp() createKey(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.createKey(u, b); }
  @Delete('keys/:id') @Roles('AGENCY', 'EXAM_ADMIN') revoke(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revokeKey(u, id); }
  @Post('exams/:id/upload') @HttpCode(200) @Roles('AGENCY', 'EXAM_ADMIN') upload(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.uploadFromConsole(u, id, b); }
  @Get('submissions') @Roles('AGENCY', 'EXAM_ADMIN', 'AUDITOR') subs(@CurrentUser() u: AccessClaims, @Query('examId') e?: string) { return this.svc.submissions(u, e || undefined); }
}

/** Machine-to-machine gateway for agencies. Authenticated by X-Agency-Key, not cookies. */
@ApiTags('Agency gateway (API key)')
@Controller('agency/v1')
export class AgencyGatewayController {
  constructor(private readonly svc: AgencyService) {}
  @Get('ping') async ping(@Headers('x-agency-key') key?: string) {
    const p = await this.svc.authenticate(key);
    return { ok: true, scopes: p.scopes, examId: p.examId };
  }
  @Post('exams/:code/submissions') @HttpCode(200) async submit(@Headers('x-agency-key') key: string | undefined, @Param('code') code: string, @Body() b: unknown) {
    return this.svc.uploadFromApi(await this.svc.authenticate(key), code, b);
  }
}

// ───────────── Answer keys, objections ─────────────
@ApiTags('Answer keys')
@Controller('admin')
@UseGuards(AdminGuard)
export class AssessmentController {
  constructor(private readonly svc: AssessmentService) {}
  @Get('exams/:id/papers') @Roles('EXAM_ADMIN', 'AUDITOR') papers(@Param('id', ParseUUIDPipe) id: string) { return this.svc.papers(id); }
  @Put('shifts/:shiftId/paper') @Roles('EXAM_ADMIN') paper(@CurrentUser() u: AccessClaims, @Param('shiftId', ParseUUIDPipe) s: string, @Body() b: unknown) { return this.svc.upsertPaper(u.sub, s, b); }
  @Post('papers/:id/provisional-key') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() prov(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.publishProvisionalKey(u.sub, id, b); }
  @Post('papers/:id/final-key') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() fin(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.publishFinalKey(u.sub, id); }
  @Get('exams/:id/objections') @Roles('EXAM_ADMIN', 'AUDITOR') objections(@Param('id', ParseUUIDPipe) id: string) { return this.svc.objectionSummary(id); }
  @Post('papers/:id/questions/:qno/pre-review') @HttpCode(200) @Roles('EXAM_ADMIN') pre(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('qno', ParseIntPipe) q: number) { return this.svc.preReview(u.sub, id, q); }
  @Post('papers/:id/questions/:qno/decision') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() dec(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('qno', ParseIntPipe) q: number, @Body() b: unknown) { return this.svc.decide(u.sub, id, q, b); }
}

// ───────────── Results ─────────────
@ApiTags('Results')
@Controller('admin/exams/:id')
@UseGuards(AdminGuard)
export class ResultsController {
  constructor(private readonly svc: ResultsService) {}
  @Get('result-runs') @Roles('EXAM_ADMIN', 'AUDITOR') runs(@Param('id', ParseUUIDPipe) id: string) { return this.svc.runs(id); }
  @Get('result-runs/:stage') @Roles('EXAM_ADMIN', 'AUDITOR') get(@Param('id', ParseUUIDPipe) id: string, @Param('stage') s: string) { return this.svc.get(id, stageParam(s)); }
  @Post('result-runs') @HttpCode(200) @Roles('EXAM_ADMIN') compute(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.compute(u.sub, id, b); }
  @Post('result-runs/:stage/submit') @HttpCode(200) @Roles('EXAM_ADMIN') submit(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('stage') s: string) { return this.svc.submit(u.sub, id, stageParam(s)); }
  @Post('result-runs/:stage/decision') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() decide(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('stage') s: string, @Body() b: unknown) { return this.svc.decide(u.sub, id, stageParam(s), b); }
  @Post('result-runs/:stage/publish') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() publish(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('stage') s: string) { return this.svc.publish(u.sub, id, stageParam(s)); }
  @Post('stage-marks/TIER2') @HttpCode(200) @Roles('EXAM_ADMIN') marks(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.uploadStageMarks(u.sub, id, 'TIER2', b); }
}

// ───────────── Debarment ─────────────
@ApiTags('Debarment')
@Controller('admin/debarments')
@UseGuards(AdminGuard)
export class DebarmentController {
  constructor(private readonly svc: DebarmentService) {}
  @Get() @Roles('EXAM_ADMIN', 'VERIFIER', 'AUDITOR') list(@Query('status') s?: string) { return this.svc.list(s || undefined); }
  @Post() @Roles('EXAM_ADMIN', 'VERIFIER') propose(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.propose(u.sub, b); }
  @Post(':id/decision') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() decide(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.decide(u.sub, id, b); }
  @Post(':id/revoke') @HttpCode(200) @Roles('SUPER_ADMIN') @StepUp() revoke(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.revoke(u.sub, id, parseOrThrow(reason, b).reason); }
}

// ───────────── Selection: shortlist, interviews, vacancies, allotment, DV ─────────────
@ApiTags('Selection')
@Controller('admin')
@UseGuards(AdminGuard)
export class SelectionController {
  constructor(private readonly svc: SelectionService) {}
  @Post('exams/:id/shortlist') @HttpCode(200) @Roles('EXAM_ADMIN') shortlist(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.shortlist(u.sub, id, b); }
  @Get('exams/:id/stage-calls') @Roles('EXAM_ADMIN', 'AUDITOR') calls(@Param('id', ParseUUIDPipe) id: string, @Query('stage') s = 'INTERVIEW') { return this.svc.calls(id, s); }
  @Post('exams/:id/stage-calls/:stage/release') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() release(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('stage') s: string) { return this.svc.releaseLetters(u.sub, id, s); }
  @Get('exams/:id/panels') @Roles('EXAM_ADMIN', 'AUDITOR') panels(@Param('id', ParseUUIDPipe) id: string) { return this.svc.panels(id); }
  @Post('exams/:id/panels') @Roles('EXAM_ADMIN') panel(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.createPanel(u.sub, id, b); }
  @Post('exams/:id/panels/schedule') @HttpCode(200) @Roles('EXAM_ADMIN') schedule(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.scheduleInterviews(u.sub, id); }

  @Get('panel/me') @Roles('INTERVIEW_PANEL') mine(@CurrentUser() u: AccessClaims) { return this.svc.myPanels(u); }
  @Post('panel/calls/:id/marks') @HttpCode(200) @Roles('INTERVIEW_PANEL') marks(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.submitMarks(u, id, b); }
  @Post('panel/calls/:id/absent') @HttpCode(200) @Roles('INTERVIEW_PANEL') absent(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.markAbsent(u, id); }
  @Get('panel/calls/:id/brief') @Roles('INTERVIEW_PANEL') brief(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.interviewBrief(u, id); }

  @Get('exams/:id/vacancies') @Roles('EXAM_ADMIN', 'AUDITOR') vac(@Param('id', ParseUUIDPipe) id: string) { return this.svc.vacancies(id); }
  @Put('exams/:id/vacancies') @Roles('EXAM_ADMIN') setVac(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.setVacancies(u.sub, id, b); }
  @Post('exams/:id/allotment/run') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() allot(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.runAllotment(u.sub, id); }
  @Get('exams/:id/allotments') @Roles('EXAM_ADMIN', 'AUDITOR') allotments(@Param('id', ParseUUIDPipe) id: string) { return this.svc.allotments(id); }

  @Post('exams/:id/dv/schedule') @HttpCode(200) @Roles('EXAM_ADMIN') dvSchedule(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.scheduleDv(u.sub, id, b); }
  @Get('exams/:id/dv') @Roles('VERIFIER', 'EXAM_ADMIN', 'AUDITOR') dv(@Param('id', ParseUUIDPipe) id: string, @Query('date') d?: string) { return this.svc.dvList(id, d || undefined); }
  @Post('dv/:id/checks') @HttpCode(200) @Roles('VERIFIER') checks(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.dvChecks(u.sub, id); }
  @Put('dv/:id') @Roles('VERIFIER') dvUpdate(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.dvUpdate(u.sub, id, b); }
}

// ───────────── Helpdesk channels and journey trace (staff) ─────────────
@ApiTags('Helpdesk channels')
@Controller('admin')
@UseGuards(AdminGuard)
export class ChannelsAdminController {
  constructor(private readonly svc: ChannelsService, private readonly journey: JourneyService) {}
  @Get('ivr-calls') @Roles('HELPDESK_AGENT', 'AUDITOR') ivr() { return this.svc.ivrCalls(); }
  @Post('tickets/phone') @Roles('HELPDESK_AGENT') phone(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.phoneTicket(u.sub, b); }
  @Get('journey/:term') @Roles('EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR') trace(@Param('term') t: string) { return this.journey.trace(t); }
}

/** Public helpdesk channels: chat assistant (logged in or not) and the IVR endpoint the telephony provider calls. */
@ApiTags('Helpdesk channels')
@Controller()
export class ChannelsPublicController {
  constructor(private readonly svc: ChannelsService, private readonly tokens: TokensService) {}
  private candidate(req: Request): string | null {
    const raw = req.cookies?.vtl_at as string | undefined;
    if (!raw) return null;
    try { const c = this.tokens.verifyAccess(raw); return c.typ === 'CANDIDATE' ? c.sub : null; } catch { return null; }
  }
  @Post('chat') @HttpCode(200) chat(@Req() req: Request, @Body() b: unknown) { return this.svc.chat(this.candidate(req), req.ip ?? '', b); }
  @Post('chat/:id/escalate') @HttpCode(200) escalate(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ name: z.string().max(80).optional(), mobile: z.string().regex(/^[6-9]\d{9}$/).optional(), email: z.string().email().optional() }), b ?? {});
    return this.svc.escalate(this.candidate(req), id, x);
  }
  @Post('ivr') @HttpCode(200) ivr(@Body() b: unknown) { return this.svc.ivr(b); }
}

/** Staff directory for assignment pickers (observers, panel members). No contact details beyond email. */
@ApiTags('Staff directory')
@Controller('admin/staff')
@UseGuards(AdminGuard)
export class StaffDirectoryController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() @Roles('EXAM_ADMIN', 'AUDITOR') async list(@Query('role') role?: string) {
    const rows = await this.prisma.adminUser.findMany({ where: { isActive: true, ...(role && { roles: { has: role as never } }) }, select: { id: true, name: true, email: true, roles: true, scope: true }, orderBy: { name: 'asc' } });
    return rows;
  }
}
