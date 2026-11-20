import {
  CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '@vtl/shared';
import type { Request } from 'express';
import { authenticator } from 'otplib';
import { FieldCrypto } from '../security/field-crypto';
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
/** Sensitive admin action: requires a fresh TOTP code in X-TOTP-Code (valid for 5 minutes after use). */
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
    private readonly crypto: FieldCrypto,
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
    if (!claims.tv && !allowPartial) throw new ForbiddenException({ code: 'TOTP_REQUIRED', message: 'Two-factor verification required.' });
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [c.getHandler(), c.getClass()]);
    const mine = claims.roles ?? [];
    if (roles?.length && !mine.includes('SUPER_ADMIN') && !roles.some((r) => mine.includes(r))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission for this action.' });
    }
    if (this.reflector.getAllAndOverride<boolean>(STEP_UP_KEY, [c.getHandler(), c.getClass()])) await this.stepUp(req, claims);
    return true;
  }

  private async stepUp(req: Request, claims: AccessClaims): Promise<void> {
    const key = this.redis.key('stepup', claims.sid);
    if (await this.redis.client.exists(key)) return;
    const code = req.get('x-totp-code');
    const admin = await this.prisma.adminUser.findUnique({ where: { id: claims.sub } });
    if (!code || !admin?.totpSecretEnc || !authenticator.check(code, this.crypto.decrypt(admin.totpSecretEnc))) {
      throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', message: 'Enter your current authenticator code to continue.' });
    }
    await this.redis.client.set(key, '1', 'EX', 300);
  }
}
