import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@vtl/shared';
import type { Request } from 'express';
import { OtpService } from '../modules/notify/otp.service';
import { COOKIES, TokensService, type AccessClaims } from '../security/tokens.service';
import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';
import { requestContext } from '../infra/request-context';

export interface AuthedRequest extends Request {
  user: AccessClaims;
}

export const ROLES_KEY = 'roles';
/** Restrict an admin route to roles. SUPER_ADMIN always passes. */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
export const ALLOW_PARTIAL_KEY = 'allowPartialAdmin';
/** Admin route reachable before TOTP verification (enrolment / verify). */
export const AllowPartialAdmin = () => SetMetadata(ALLOW_PARTIAL_KEY, true);
export const STEP_UP_KEY = 'stepUp';
/** Sensitive admin action: requires a fresh emailed one-time code in X-OTP-Code (valid for 5 minutes after use). */
export const StepUp = () => SetMetadata(STEP_UP_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, c: ExecutionContext) => c.switchToHttp().getRequest<AuthedRequest>().user);

function bindActor(claims: AccessClaims) {
  const store = requestContext.getStore();
  if (store) {
    store.actorType = claims.typ;
    store.actorId = claims.sub;
  }
}

@Injectable()
export class CandidateGuard implements CanActivate {
  constructor(private readonly tokens: TokensService) {}
  canActivate(c: ExecutionContext): boolean {
    const req = c.switchToHttp().getRequest<AuthedRequest>();
    const raw = req.cookies?.[COOKIES.CANDIDATE.access] as string | undefined;
    if (!raw) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please log in.' });
    const claims = this.tokens.verifyAccess(raw);
    if (claims.typ !== 'CANDIDATE') throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please log in.' });
    req.user = claims;
    bindActor(claims);
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly otp: OtpService,
  ) {}

  async canActivate(c: ExecutionContext): Promise<boolean> {
    const req = c.switchToHttp().getRequest<AuthedRequest>();
    const raw = req.cookies?.[COOKIES.ADMIN.access] as string | undefined;
    if (!raw) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please log in.' });
    const claims = this.tokens.verifyAccess(raw);
    if (claims.typ !== 'ADMIN') throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please log in.' });
    req.user = claims;
    bindActor(claims);
    const allowPartial = this.reflector.getAllAndOverride<boolean>(ALLOW_PARTIAL_KEY, [c.getHandler(), c.getClass()]);
    if (!claims.tv && !allowPartial) throw new ForbiddenException({ code: 'TOTP_REQUIRED', message: 'Enter the sign-in code sent to your email.' });
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [c.getHandler(), c.getClass()]);
    const mine = claims.roles ?? [];
    if (roles?.length && !mine.includes('SUPER_ADMIN') && !roles.some((r) => mine.includes(r))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission for this action.' });
    }
    if (this.reflector.getAllAndOverride<boolean>(STEP_UP_KEY, [c.getHandler(), c.getClass()])) await this.stepUp(req, claims);
    return true;
  }

  /**
   * Sensitive actions need a fresh one-time code emailed to the staff member (valid for 5 minutes once confirmed).
   * The first attempt sends the code; the client retries with it in X-OTP-Code.
   */
  private async stepUp(req: Request, claims: AccessClaims): Promise<void> {
    const key = this.redis.key('stepup', claims.sid);
    if (await this.redis.client.exists(key)) return;
    const pendingKey = this.redis.key('stepup-ch', claims.sid);
    const pending = await this.redis.client.get(pendingKey);
    const code = req.get('x-otp-code');
    if (code && pending) {
      try {
        await this.otp.verify(pending, { email: code }, 'STAFF_STEP_UP');
      } catch {
        throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', message: 'That code is incorrect or has expired. Enter the latest code sent to your email.' });
      }
      await this.redis.client.del(pendingKey);
      await this.redis.client.set(key, '1', 'EX', 300);
      return;
    }
    if (!pending) {
      const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: claims.sub } });
      const c = await this.otp.create('STAFF_STEP_UP', claims.sid, { email: admin.email }, 'en', undefined, { cooldown: false, maxSends: 30 });
      await this.redis.client.set(pendingKey, c.challengeId, 'EX', c.expiresIn);
    }
    throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', message: 'For this action, enter the 6-digit code sent to your email.' });
  }
}
