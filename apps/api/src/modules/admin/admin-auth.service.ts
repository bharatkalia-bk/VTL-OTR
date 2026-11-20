import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SessionUser } from '@vtl/shared';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { AppError } from '../../common/errors';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { RateLimitService } from '../../infra/rate-limit.service';
import { SettingsService } from '../../infra/settings.service';
import { FieldCrypto } from '../../security/field-crypto';
import { dummyVerify, verifyPassword } from '../../security/password';
import { TokensService, type AccessClaims } from '../../security/tokens.service';

authenticator.options = { window: 1, step: 30, digits: 6 };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Admin login with mandatory TOTP. Sessions start "partial" (tv=false) until TOTP is enrolled/verified. */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly rl: RateLimitService,
    private readonly settings: SettingsService,
    private readonly redis: RedisService,
  ) {}

  async login(email: string, password: string, req: Request, res: Response) {
    await this.rl.hit('admin-login-ip', req.ip ?? 'x', 30, 15 * 60);
    await this.rl.hit('admin-login-id', sha(email.toLowerCase()), 10, 15 * 60);
    const a = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
    if (!a || !a.isActive) {
      await dummyVerify(password);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The login details are incorrect.' });
    }
    if (a.lockedUntil && a.lockedUntil > new Date()) throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', message: 'Account temporarily locked. Try again later.' });
    if (!(await verifyPassword(a.passwordHash, password))) {
      const s = await this.settings.get();
      const failed = a.failedLogins + 1;
      const lock = failed >= s.lockout.maxFailures ? new Date(Date.now() + s.lockout.lockMinutes * 60000) : null;
      await this.prisma.adminUser.update({ where: { id: a.id }, data: { failedLogins: lock ? 0 : failed, lockedUntil: lock } });
      await this.audit.log({ action: lock ? 'ADMIN_LOCKED' : 'ADMIN_LOGIN_FAILED', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: a.id });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The login details are incorrect.' });
    }
    await this.prisma.adminUser.update({ where: { id: a.id }, data: { failedLogins: 0, lockedUntil: null } });
    await this.tokens.issue(res, req, { sub: a.id, typ: 'ADMIN', roles: a.roles, tv: false });
    await this.audit.log({ action: 'ADMIN_PASSWORD_OK', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: a.id });
    return { totpEnrolled: !!a.totpEnrolledAt, next: a.totpEnrolledAt ? 'TOTP_VERIFY' : 'TOTP_ENROL' };
  }

  async enrolStart(claims: AccessClaims) {
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: claims.sub } });
    if (a.totpEnrolledAt) throw new AppError('ALREADY_ENROLLED', 'Authenticator already set up.', 409);
    const secret = authenticator.generateSecret(20);
    await this.prisma.adminUser.update({ where: { id: a.id }, data: { totpSecretEnc: this.crypto.encrypt(secret) } });
    const otpauth = authenticator.keyuri(a.email, 'VTL OTR Admin', secret);
    return { secret, otpauth, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220, color: { dark: '#07102D', light: '#FFFFFF' } }) };
  }

  /** Verifies a TOTP (or a single-use recovery code). Completes enrolment if pending. Upgrades session to tv=true. */
  async verify(claims: AccessClaims, code: string, req: Request, res: Response): Promise<SessionUser & { recoveryCodes?: string[] }> {
    await this.rl.hit('admin-totp', claims.sub, 10, 15 * 60);
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: claims.sub } });
    if (!a.totpSecretEnc) throw new AppError('ENROL_FIRST', 'Set up your authenticator first.');
    const secret = this.crypto.decrypt(a.totpSecretEnc);
    let ok = /^\d{6}$/.test(code) && authenticator.check(code, secret);
    let usedRecovery = false;
    if (!ok && a.totpEnrolledAt && /^[A-Z0-9]{10}$/.test(code)) {
      const h = sha(code);
      if (a.recoveryCodes.includes(h)) {
        ok = true;
        usedRecovery = true;
        await this.prisma.adminUser.update({ where: { id: a.id }, data: { recoveryCodes: a.recoveryCodes.filter((x) => x !== h) } });
      }
    }
    if (!ok) {
      await this.audit.log({ action: 'ADMIN_TOTP_FAILED', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: a.id });
      throw new UnauthorizedException({ code: 'TOTP_INVALID', message: 'The authenticator code is incorrect.' });
    }
    let recoveryCodes: string[] | undefined;
    if (!a.totpEnrolledAt) {
      recoveryCodes = Array.from({ length: 8 }, () => randomBytes(8).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(10, 'X').slice(0, 10));
      await this.prisma.adminUser.update({ where: { id: a.id }, data: { totpEnrolledAt: new Date(), recoveryCodes: recoveryCodes.map(sha) } });
      await this.audit.log({ action: 'ADMIN_TOTP_ENROLLED', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: a.id });
    }
    await this.tokens.revokeFamily(claims.sid);
    const sid = await this.tokens.issue(res, req, { sub: a.id, typ: 'ADMIN', roles: a.roles, tv: true });
    await this.redis.client.set(this.redis.key('admtv', sid), '1', 'EX', 12 * 3600);
    await this.prisma.adminUser.update({ where: { id: a.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ action: usedRecovery ? 'ADMIN_LOGIN_RECOVERY_CODE' : 'ADMIN_LOGIN', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: a.id });
    return { ...(await this.sessionUser(a.id, true)), recoveryCodes };
  }

  async sessionUser(id: string, tv: boolean): Promise<SessionUser & { totpEnrolled: boolean; email: string }> {
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    return { id: a.id, type: 'ADMIN', name: a.name, roles: a.roles, totpVerified: tv, totpEnrolled: !!a.totpEnrolledAt, email: a.email };
  }

  async refresh(req: Request, res: Response) {
    // TOTP state is bound to the session family (Redis); a partial session never becomes verified via refresh.
    const claims = await this.tokens.rotate(req, res, 'ADMIN', async (id, familyId) => {
      const a = await this.prisma.adminUser.findUnique({ where: { id } });
      const tv = (await this.redis.client.exists(this.redis.key('admtv', familyId))) === 1;
      return a?.isActive ? { sub: id, typ: 'ADMIN', roles: a.roles, tv } : null;
    });
    return this.sessionUser(claims.sub, !!claims.tv);
  }
}
