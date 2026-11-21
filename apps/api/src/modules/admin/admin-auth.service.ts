import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SessionUser } from '@vtl/shared';
import type { Request, Response } from 'express';
import { maskEmail } from '@vtl/shared';
import { createHash } from 'node:crypto';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { RateLimitService } from '../../infra/rate-limit.service';
import { SettingsService } from '../../infra/settings.service';
import { FieldCrypto } from '../../security/field-crypto';
import { dummyVerify, verifyPassword } from '../../security/password';
import { TokensService, type AccessClaims } from '../../security/tokens.service';
import { OtpService } from '../notify/otp.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Staff login: password, then a one-time code emailed to the staff member. Sessions stay "partial" (tv=false) until the code is verified. */
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
    private readonly otp: OtpService,
  ) {}

  async login(email: string, password: string, req: Request, res: Response): Promise<{ next: 'OTP_VERIFY'; challengeId: string; sentTo: string }> {
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
    const c = await this.challenge({ sub: a.id } as AccessClaims);
    return { next: 'OTP_VERIFY' as const, ...c };
  }

  private pendingKey(adminId: string) { return this.redis.key('staff-otp', adminId); }

  /** Returns the pending sign-in code challenge for this staff member, sending a new code only when none is pending. */
  async challenge(claims: AccessClaims, fresh = false): Promise<{ challengeId: string; sentTo: string }> {
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: claims.sub } });
    const key = this.pendingKey(a.id);
    const pending = fresh ? null : await this.redis.client.get(key);
    if (pending) return { challengeId: pending, sentTo: maskEmail(a.email) };
    const c = await this.otp.create('STAFF_LOGIN', a.id, { email: a.email }, 'en', undefined, { cooldown: false, maxSends: 30 });
    await this.redis.client.set(key, c.challengeId, 'EX', c.expiresIn);
    return { challengeId: c.challengeId, sentTo: maskEmail(a.email) };
  }

  /** Second sign-in step: the 6-digit code emailed to the staff member. Upgrades the session to verified. */
  async verify(claims: AccessClaims, challengeId: string, code: string, req: Request, res: Response): Promise<SessionUser> {
    await this.rl.hit('admin-otp', claims.sub, 10, 15 * 60);
    let ch;
    try {
      ch = await this.otp.verify(challengeId, { email: code }, 'STAFF_LOGIN');
    } catch (e) {
      await this.audit.log({ action: 'ADMIN_OTP_FAILED', entity: 'AdminUser', entityId: claims.sub, actorType: 'ADMIN', actorId: claims.sub });
      throw e;
    }
    if (ch.subject !== claims.sub) throw new UnauthorizedException({ code: 'OTP_INVALID', message: 'The code entered is incorrect.' });
    await this.redis.client.del(this.pendingKey(claims.sub));
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: claims.sub } });
    await this.tokens.revokeFamily(claims.sid);
    const sid = await this.tokens.issue(res, req, { sub: a.id, typ: 'ADMIN', roles: a.roles, tv: true });
    await this.redis.client.set(this.redis.key('admtv', sid), '1', 'EX', 12 * 3600);
    await this.prisma.adminUser.update({ where: { id: a.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ action: 'ADMIN_LOGIN', entity: 'AdminUser', entityId: a.id, actorType: 'ADMIN', actorId: a.id });
    return this.sessionUser(a.id, true);
  }

  async sessionUser(id: string, tv: boolean): Promise<SessionUser & { totpEnrolled: boolean; email: string }> {
    const a = await this.prisma.adminUser.findUniqueOrThrow({ where: { id } });
    return { id: a.id, type: 'ADMIN', name: a.name, roles: a.roles, totpVerified: tv, totpEnrolled: true, email: a.email };
  }

  async refresh(req: Request, res: Response) {
    // Verified state is bound to the session family (Redis); a partial session never becomes verified via refresh.
    const claims = await this.tokens.rotate(req, res, 'ADMIN', async (id, familyId) => {
      const a = await this.prisma.adminUser.findUnique({ where: { id } });
      const tv = (await this.redis.client.exists(this.redis.key('admtv', familyId))) === 1;
      return a?.isActive ? { sub: id, typ: 'ADMIN', roles: a.roles, tv } : null;
    });
    return this.sessionUser(claims.sub, !!claims.tv);
  }
}
