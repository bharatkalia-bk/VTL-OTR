import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ADMIN_ROLES, adminLoginSchema, decisionSchema, optionalDecisionSchema, paginationSchema, passwordSchema, totpCodeSchema } from '@vtl/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AdminGuard, AllowPartialAdmin, CurrentUser, Roles, StepUp } from '../../common/auth';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { SettingsService, settingsSchema } from '../../infra/settings.service';
import { FieldCrypto } from '../../security/field-crypto';
import { hashPassword, verifyPassword } from '../../security/password';
import { TokensService, type AccessClaims } from '../../security/tokens.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { PaymentsService } from '../payments/payments.service';
import { CorrectionsService } from '../profile/corrections.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminCandidatesService } from './admin-candidates.service';
import { AdminExamsService } from './admin-exams.service';
import { AdmitCardsService } from './admit-cards.service';
import { CampaignsService } from './campaigns.service';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

const READ_ALL = ['EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR'] as const;
const page = (q: unknown) => parseOrThrow(paginationSchema, q);

// ───────────── Auth ─────────────
@ApiTags('Admin auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService, private readonly tokens: TokensService, private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() b: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const x = parseOrThrow(adminLoginSchema, b);
    return this.auth.login(x.email, x.password, req, res);
  }

  @Post('totp/enrol')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @AllowPartialAdmin()
  enrol(@CurrentUser() u: AccessClaims) {
    return this.auth.enrolStart(u);
  }

  @Post('totp/verify')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @AllowPartialAdmin()
  verify(@CurrentUser() u: AccessClaims, @Body() b: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.verify(u, parseOrThrow(totpCodeSchema, b).code, req, res);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.vtl_adm_at as string | undefined;
    if (raw) {
      try { await this.tokens.revokeFamily(this.tokens.verifyAccess(raw).sid); } catch { /* ignore */ }
    }
    this.tokens.clear(res, 'ADMIN');
    return { ok: true };
  }

  /** Change own password (requires current password + step-up TOTP); revokes other sessions. */
  @Post('password')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @StepUp()
  async changePassword(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), b);
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: u.sub } });
    if (!(await verifyPassword(a.passwordHash, x.currentPassword))) throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 400);
    await this.prisma.adminUser.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(x.newPassword) } });
    await this.prisma.refreshToken.updateMany({ where: { subjectType: 'ADMIN', subjectId: a.id, revokedAt: null, familyId: { not: u.sid } }, data: { revokedAt: new Date() } });
    await this.audit.log({ action: 'ADMIN_PASSWORD_CHANGED', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: a.id });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @AllowPartialAdmin()
  me(@CurrentUser() u: AccessClaims) {
    return this.auth.sessionUser(u.sub, !!u.tv);
  }
}

// ───────────── Users (Super Admin) ─────────────
@ApiTags('Admin users')
@Controller('admin/users')
@UseGuards(AdminGuard)
export class AdminUsersController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly tokens: TokensService) {}

  @Get()
  @Roles('AUDITOR')
  async list() {
    const rows = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((a) => ({ id: a.id, name: a.name, email: a.email, roles: a.roles, isActive: a.isActive, totpEnrolled: !!a.totpEnrolledAt, lastLoginAt: a.lastLoginAt, createdAt: a.createdAt }));
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @StepUp()
  async create(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ name: z.string().min(2).max(100), email: z.string().email(), password: passwordSchema, roles: z.array(z.enum(ADMIN_ROLES)).min(1) }), b);
    const a = await this.prisma.adminUser.create({ data: { name: x.name, email: x.email.toLowerCase(), roles: x.roles, passwordHash: await hashPassword(x.password) } });
    await this.audit.log({ action: 'ADMIN_USER_CREATED', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: u.sub, after: { email: a.email, roles: a.roles } });
    return { id: a.id };
  }

  @Put(':id')
  @Roles('SUPER_ADMIN')
  @StepUp()
  async update(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ roles: z.array(z.enum(ADMIN_ROLES)).min(1).optional(), isActive: z.boolean().optional(), name: z.string().min(2).optional() }), b);
    if (id === u.sub && x.isActive === false) throw new AppError('SELF_DEACTIVATE', 'You cannot deactivate yourself.');
    const before = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    await this.prisma.adminUser.update({ where: { id }, data: x });
    if (x.isActive === false || x.roles) await this.tokens.revokeAllFor('ADMIN', id);
    await this.audit.log({ action: 'ADMIN_USER_UPDATED', entity: 'AdminUser', entityId: id, actorType: 'ADMIN', actorId: u.sub, before: { roles: before.roles, isActive: before.isActive }, after: x });
    return { ok: true };
  }

  @Post(':id/reset-totp')
  @HttpCode(200)
  @Roles('SUPER_ADMIN')
  @StepUp()
  async resetTotp(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.adminUser.update({ where: { id }, data: { totpSecretEnc: null, totpEnrolledAt: null, recoveryCodes: [] } });
    await this.tokens.revokeAllFor('ADMIN', id);
    await this.audit.log({ action: 'ADMIN_TOTP_RESET', entity: 'AdminUser', entityId: id, actorType: 'ADMIN', actorId: u.sub });
    return { ok: true };
  }
}

// ───────────── Dashboard ─────────────
@ApiTags('Admin dashboard')
@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class AdminDashboardController {
  constructor(private readonly svc: DashboardService) {}
  @Get()
  @Roles(...READ_ALL)
  summary() {
    return this.svc.summary();
  }
}

// ───────────── Exams ─────────────
@ApiTags('Admin exams')
@Controller('admin/exams')
@UseGuards(AdminGuard)
export class AdminExamsController {
  constructor(private readonly svc: AdminExamsService, private readonly admit: AdmitCardsService) {}

  @Get() @Roles(...READ_ALL) list() { return this.svc.list(); }
  @Get(':id') @Roles(...READ_ALL) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Post() @Roles('EXAM_ADMIN') create(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.create(u.sub, b); }
  @Put(':id') @Roles('EXAM_ADMIN') update(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.update(u.sub, id, b); }

  @Post(':id/status')
  @HttpCode(200)
  @Roles('EXAM_ADMIN')
  status(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.svc.setStatus(u.sub, id, parseOrThrow(z.object({ status: z.enum(['PUBLISHED', 'DRAFT', 'CLOSED', 'ARCHIVED']) }), b).status);
  }

  @Post(':id/posts') @Roles('EXAM_ADMIN') addPost(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.upsertPost(u.sub, id, b); }
  @Put(':id/posts/:postId') @Roles('EXAM_ADMIN') updPost(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('postId', ParseUUIDPipe) postId: string, @Body() b: unknown) { return this.svc.upsertPost(u.sub, id, b, postId); }
  @Delete(':id/posts/:postId') @Roles('EXAM_ADMIN') delPost(@CurrentUser() u: AccessClaims, @Param('postId', ParseUUIDPipe) postId: string) { return this.svc.deletePost(u.sub, postId); }
  @Put(':id/fee-rules') @Roles('EXAM_ADMIN') fees(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.setFeeRules(u.sub, id, b); }
  @Post(':id/centre-cities') @Roles('EXAM_ADMIN') addCity(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.upsertCity(u.sub, id, b); }
  @Put(':id/centre-cities/:cityId') @Roles('EXAM_ADMIN') updCity(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Param('cityId', ParseUUIDPipe) cityId: string, @Body() b: unknown) { return this.svc.upsertCity(u.sub, id, b, cityId); }

  // Admit cards
  @Get(':id/admit-cards/summary') @Roles(...READ_ALL) acSummary(@Param('id', ParseUUIDPipe) id: string) { return this.admit.summary(id); }
  @Get(':id/admit-cards') @Roles(...READ_ALL) acList(@Param('id', ParseUUIDPipe) id: string, @Query() q: Record<string, string>) { return this.admit.list(id, { ...page(q), unallocated: q.unallocated === 'true' }); }
  @Post(':id/admit-cards/allocate') @HttpCode(200) @Roles('EXAM_ADMIN') allocate(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.admit.allocate(u.sub, id); }
  @Post(':id/admit-cards/generate') @HttpCode(200) @Roles('EXAM_ADMIN') generate(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.admit.generate(u.sub, id); }
  @Post(':id/admit-cards/release') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() release(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.admit.release(u.sub, id); }
}

@ApiTags('Admin admit cards')
@Controller('admin/admit-cards')
@UseGuards(AdminGuard)
export class AdminAdmitCardController {
  constructor(private readonly admit: AdmitCardsService) {}
  @Put(':id/centre')
  @Roles('EXAM_ADMIN')
  override(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    return this.admit.override(u.sub, id, parseOrThrow(z.object({ centreId: z.string().uuid() }), b).centreId);
  }
}

// ───────────── Candidates & verification ─────────────
@ApiTags('Admin candidates')
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminCandidatesController {
  constructor(private readonly svc: AdminCandidatesService, private readonly corrections: CorrectionsService, private readonly prisma: PrismaService, private readonly crypto: FieldCrypto) {}

  @Get('candidates')
  @Roles(...READ_ALL)
  search(@CurrentUser() u: AccessClaims, @Query() q: Record<string, string>) {
    return this.svc.search({ ...page(q), q: q.q, status: q.status }, u.sub);
  }
  @Get('candidates/:id') @Roles(...READ_ALL) detail(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.detail(id, u.sub); }
  @Post('candidates/:id/block') @HttpCode(200) @Roles('VERIFIER') block(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.setBlocked(id, u.sub, true, parseOrThrow(decisionSchema, b).reason); }
  @Post('candidates/:id/unblock') @HttpCode(200) @Roles('VERIFIER') unblock(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.setBlocked(id, u.sub, false); }

  @Get('documents') @Roles('VERIFIER', 'AUDITOR') docs(@Query() q: Record<string, string>) { return this.svc.pendingDocuments({ ...page(q), status: q.status }); }
  @Get('documents/:id/url') @Roles(...READ_ALL) docUrl(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.documentUrl(id, u.sub); }
  @Post('documents/:id/approve') @HttpCode(200) @Roles('VERIFIER') approve(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.verifyDocument(id, u.sub, true); }
  @Post('documents/:id/reject') @HttpCode(200) @Roles('VERIFIER') reject(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.verifyDocument(id, u.sub, false, parseOrThrow(decisionSchema, b).reason); }

  @Get('duplicates') @Roles('VERIFIER', 'AUDITOR') dups(@Query('status') status?: string) { return this.svc.duplicates(status); }
  @Post('duplicates/:id/resolve')
  @HttpCode(200)
  @Roles('VERIFIER')
  resolve(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ status: z.enum(['CLEARED', 'CONFIRMED']), notes: z.string().max(1000).optional() }), b);
    return this.svc.resolveDuplicate(id, u.sub, x.status, x.notes);
  }

  @Get('corrections')
  @Roles('VERIFIER', 'AUDITOR')
  async correctionList(@Query() q: Record<string, string>) {
    const p = page(q);
    const rows = await this.prisma.correctionRequest.findMany({ where: { status: (q.status as never) ?? 'PENDING' }, orderBy: { createdAt: 'asc' }, take: p.limit + 1, ...(p.cursor && { cursor: { id: p.cursor }, skip: 1 }), include: { candidate: { select: { otrId: true } } } });
    return {
      items: rows.slice(0, p.limit).map((r) => ({ id: r.id, candidateId: r.candidateId, otrId: r.candidate.otrId, field: r.field, currentValue: this.crypto.decOpt(r.currentValueEnc), requestedValue: this.crypto.decrypt(r.requestedValueEnc), reason: r.reason, documentId: r.documentId, status: r.status, decisionReason: r.decisionReason, createdAt: r.createdAt })),
      nextCursor: rows.length > p.limit ? rows[p.limit - 1]!.id : null,
    };
  }
  @Post('corrections/:id/approve') @HttpCode(200) @Roles('VERIFIER') @StepUp() cApprove(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.corrections.decide(id, u.sub, true, parseOrThrow(optionalDecisionSchema, b ?? {}).reason); }
  @Post('corrections/:id/reject') @HttpCode(200) @Roles('VERIFIER') cReject(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.corrections.decide(id, u.sub, false, parseOrThrow(decisionSchema, b).reason); }
}

// ───────────── Payments ─────────────
@ApiTags('Admin payments')
@Controller('admin/payments')
@UseGuards(AdminGuard)
export class AdminPaymentsController {
  constructor(private readonly prisma: PrismaService, private readonly payments: PaymentsService, private readonly audit: AuditService) {}

  @Get()
  @Roles('EXAM_ADMIN', 'AUDITOR')
  async list(@Query() q: Record<string, string>) {
    const p = page(q);
    const where = { ...(q.status && { status: q.status as never }), ...(q.examId && { application: { examId: q.examId } }), ...(q.txn && { OR: [{ merchantTxnId: q.txn }, { gatewayTxnId: q.txn }] }) };
    const [rows, totals] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, take: p.limit + 1, ...(p.cursor && { cursor: { id: p.cursor }, skip: 1 }), include: { application: { select: { applicationNo: true, exam: { select: { code: true } }, candidate: { select: { otrId: true } } } } } }),
      this.prisma.payment.groupBy({ by: ['status'], where, _count: true, _sum: { amount: true } }),
    ]);
    return { items: rows.slice(0, p.limit), nextCursor: rows.length > p.limit ? rows[p.limit - 1]!.id : null, totals };
  }

  @Get(':id')
  @Roles('EXAM_ADMIN', 'AUDITOR')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.payment.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { at: 'asc' } }, application: { select: { applicationNo: true, status: true } } } });
  }

  @Post('reconcile')
  @HttpCode(200)
  @Roles('EXAM_ADMIN')
  async reconcile(@CurrentUser() u: AccessClaims) {
    const r = await this.payments.reconcile(0);
    await this.audit.log({ action: 'PAYMENT_RECON_MANUAL', entity: 'Payment', actorType: 'ADMIN', actorId: u.sub, after: r });
    return r;
  }

  /** Manual verification against bank statement (e.g. challan / offline proof). */
  @Post(':id/verify')
  @HttpCode(200)
  @Roles('EXAM_ADMIN')
  @StepUp()
  async verify(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ gatewayTxnId: z.string().min(4).max(60), note: z.string().min(5).max(500) }), b);
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    const r = await this.payments.applyGatewayResult({ merchantTxnId: p.merchantTxnId, gatewayTxnId: x.gatewayTxnId, status: 'SUCCESS', amount: p.amount, signatureValid: true, raw: { manual: true, by: u.sub, note: x.note } }, 'RECON');
    await this.prisma.payment.update({ where: { id }, data: { manualVerifiedById: u.sub, reconciliationNote: `MANUAL: ${x.note}` } });
    await this.audit.log({ action: 'PAYMENT_MANUAL_VERIFIED', entity: 'Payment', entityId: id, actorType: 'ADMIN', actorId: u.sub, before: { status: p.status }, after: { status: r.status, note: x.note } });
    return r;
  }

  @Post(':id/refund-marker')
  @HttpCode(200)
  @Roles('EXAM_ADMIN')
  @StepUp()
  async refund(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) {
    const { reason } = parseOrThrow(decisionSchema, b);
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    if (p.status !== 'SUCCESS') throw new AppError('INVALID_STATE', 'Only successful payments can be marked for refund.');
    const u2 = await this.prisma.payment.update({ where: { id }, data: { status: 'REFUND_MARKED', refundMarkedAt: new Date(), refundNote: reason } });
    await this.audit.log({ action: 'PAYMENT_REFUND_MARKED', entity: 'Payment', entityId: id, actorType: 'ADMIN', actorId: u.sub, after: { reason } });
    return u2;
  }
}

// ───────────── Communication & reports ─────────────
@ApiTags('Admin communication')
@Controller('admin/comms')
@UseGuards(AdminGuard)
export class AdminCommsController {
  constructor(private readonly svc: CampaignsService) {}
  @Get('templates') @Roles('EXAM_ADMIN', 'AUDITOR') templates() { return this.svc.templates(); }
  @Put('templates') @Roles('EXAM_ADMIN') saveTemplate(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.upsertTemplate(u.sub, b); }
  @Get('campaigns') @Roles('EXAM_ADMIN', 'AUDITOR') campaigns() { return this.svc.list(); }
  @Post('campaigns') @HttpCode(200) @Roles('EXAM_ADMIN') @StepUp() create(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.create(u.sub, b); }
  @Post('campaigns/preview') @HttpCode(200) @Roles('EXAM_ADMIN') preview(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.create(u.sub, { ...(b as object), dryRun: true }); }
}

@ApiTags('Admin reports')
@Controller('admin/reports')
@UseGuards(AdminGuard)
export class AdminReportsController {
  constructor(private readonly svc: ReportsService) {}
  @Get() @Roles('EXAM_ADMIN', 'AUDITOR') list(@CurrentUser() u: AccessClaims) { return this.svc.list(u.sub); }
  @Post() @HttpCode(200) @Roles('EXAM_ADMIN', 'AUDITOR') @StepUp() create(@CurrentUser() u: AccessClaims, @Body() b: unknown) { return this.svc.create(u.sub, b); }
  @Get(':id/download') @Roles('EXAM_ADMIN', 'AUDITOR') download(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) { return this.svc.download(u.sub, id); }
}

// ───────────── Audit ─────────────
@ApiTags('Admin audit')
@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @Roles('AUDITOR')
  async list(@Query() q: Record<string, string>) {
    const limit = Math.min(Number(q.limit) || 50, 200);
    const where = {
      ...(q.entity && { entity: q.entity }), ...(q.entityId && { entityId: q.entityId }), ...(q.actorId && { actorId: q.actorId }),
      ...(q.action && { action: { contains: q.action.toUpperCase() } }),
      ...((q.from || q.to) && { at: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(q.before && { id: { lt: BigInt(q.before) } }),
    };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: limit + 1 });
    const decode = q.decode === 'true';
    return {
      items: rows.slice(0, limit).map((r) => ({ ...r, id: r.id.toString(), beforeEnc: undefined, afterEnc: undefined, ...(decode ? this.audit.decode(r) : { hasBefore: !!r.beforeEnc, hasAfter: !!r.afterEnc }) })),
      nextBefore: rows.length > limit ? rows[limit - 1]!.id.toString() : null,
    };
  }

  @Get(':id')
  @Roles('AUDITOR')
  async get(@Param('id') id: string) {
    const r = await this.prisma.auditLog.findUniqueOrThrow({ where: { id: BigInt(id) } });
    return { ...r, id: r.id.toString(), beforeEnc: undefined, afterEnc: undefined, ...this.audit.decode(r) };
  }
}

// ───────────── Masters & settings ─────────────
const MASTER_TYPES = ['states', 'districts', 'boards', 'universities', 'qualifications'] as const;
@ApiTags('Admin masters')
@Controller('admin/masters')
@UseGuards(AdminGuard)
export class AdminMastersController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly redis: RedisService) {}

  private async bust() {
    const keys = await this.redis.client.keys(this.redis.key('cache', 'masters', '*'));
    if (keys.length) await this.redis.client.del(...keys);
  }

  @Post(':type')
  @Roles('SUPER_ADMIN')
  async create(@CurrentUser() u: AccessClaims, @Param('type') type: string, @Body() b: unknown) {
    const t = parseOrThrow(z.enum(MASTER_TYPES), type);
    let row: unknown;
    switch (t) {
      case 'states': row = await this.prisma.state.create({ data: parseOrThrow(z.object({ code: z.string().regex(/^[A-Z]{2,3}$/), nameEn: z.string().min(2), nameHi: z.string().min(2), isUT: z.boolean().default(false) }), b) }); break;
      case 'districts': row = await this.prisma.district.create({ data: parseOrThrow(z.object({ stateCode: z.string(), name: z.string().min(2) }), b) }); break;
      case 'boards': row = await this.prisma.board.create({ data: parseOrThrow(z.object({ name: z.string().min(2), stateCode: z.string().optional() }), b) }); break;
      case 'universities': row = await this.prisma.university.create({ data: parseOrThrow(z.object({ name: z.string().min(2), stateCode: z.string().optional() }), b) }); break;
      case 'qualifications': row = await this.prisma.qualification.create({ data: parseOrThrow(z.object({ level: z.string(), name: z.string().min(2) }), b) }); break;
    }
    await this.audit.log({ action: 'MASTER_CREATED', entity: `Master:${t}`, actorType: 'ADMIN', actorId: u.sub, after: row });
    await this.bust();
    return row;
  }

  @Delete(':type/:id')
  @Roles('SUPER_ADMIN')
  async remove(@CurrentUser() u: AccessClaims, @Param('type') type: string, @Param('id') id: string) {
    const t = parseOrThrow(z.enum(MASTER_TYPES), type);
    switch (t) {
      case 'states': await this.prisma.state.delete({ where: { code: id } }); break;
      case 'districts': await this.prisma.district.delete({ where: { id: Number(id) } }); break;
      case 'boards': await this.prisma.board.delete({ where: { id: Number(id) } }); break;
      case 'universities': await this.prisma.university.delete({ where: { id: Number(id) } }); break;
      case 'qualifications': await this.prisma.qualification.delete({ where: { id: Number(id) } }); break;
    }
    await this.audit.log({ action: 'MASTER_DELETED', entity: `Master:${t}`, entityId: id, actorType: 'ADMIN', actorId: u.sub });
    await this.bust();
    return { ok: true };
  }
}

@ApiTags('Admin settings')
@Controller('admin/settings')
@UseGuards(AdminGuard)
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService, private readonly audit: AuditService) {}
  @Get() @Roles('AUDITOR', 'EXAM_ADMIN') get() { return this.settings.get(); }

  @Put()
  @Roles('SUPER_ADMIN')
  @StepUp()
  async update(@CurrentUser() u: AccessClaims, @Body() b: unknown) {
    const patch = parseOrThrow(settingsSchema.partial(), b);
    const before = await this.settings.get();
    const after = await this.settings.update(patch, u.sub);
    await this.audit.log({ action: 'SETTINGS_UPDATED', entity: 'SystemSetting', actorType: 'ADMIN', actorId: u.sub, before, after: patch });
    return after;
  }
}

// ───────────── Helpdesk (agents) ─────────────
@ApiTags('Admin helpdesk')
@Controller('admin/tickets')
@UseGuards(AdminGuard)
export class AdminTicketsController {
  constructor(private readonly svc: HelpdeskService) {}
  @Get() @Roles('HELPDESK_AGENT', 'AUDITOR') list(@Query() q: Record<string, string>) { return this.svc.adminList({ ...page(q), status: q.status }); }
  @Get(':id') @Roles('HELPDESK_AGENT', 'AUDITOR') get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Post(':id/reply') @HttpCode(200) @Roles('HELPDESK_AGENT') reply(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.reply(id, { type: 'ADMIN', id: u.sub }, b); }
  @Post(':id/status') @HttpCode(200) @Roles('HELPDESK_AGENT') status(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.setStatus(id, u.sub, b); }
  @Post(':id/assign') @HttpCode(200) @Roles('HELPDESK_AGENT') assign(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Body() b: unknown) { return this.svc.assign(id, u.sub, b); }
}

// ───────────── Results (basic publish) ─────────────
@ApiTags('Admin results')
@Controller('admin/exams/:id/results')
@UseGuards(AdminGuard)
export class AdminResultsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Post()
  @HttpCode(200)
  @Roles('EXAM_ADMIN')
  @StepUp()
  async publish(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) examId: string, @Body() b: unknown) {
    const x = parseOrThrow(z.object({ results: z.array(z.object({ rollNo: z.string(), status: z.enum(['QUALIFIED', 'NOT_QUALIFIED', 'ABSENT', 'WITHHELD']), score: z.number().optional(), rank: z.number().int().optional() })).min(1).max(50000) }), b);
    let count = 0;
    for (const r of x.results) {
      const ac = await this.prisma.admitCard.findUnique({ where: { examId_rollNo: { examId, rollNo: r.rollNo } } });
      if (!ac) continue;
      await this.prisma.result.upsert({ where: { applicationId: ac.applicationId }, create: { applicationId: ac.applicationId, status: r.status, score: r.score, rank: r.rank }, update: { status: r.status, score: r.score, rank: r.rank, publishedAt: new Date() } });
      count++;
    }
    await this.prisma.exam.update({ where: { id: examId }, data: { resultsPublishedAt: new Date() } });
    await this.audit.log({ action: 'RESULTS_PUBLISHED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: u.sub, after: { count } });
    return { published: count };
  }
}
