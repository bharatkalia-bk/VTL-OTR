import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../infra/prisma.service';

export type SubjectType = 'CANDIDATE' | 'ADMIN';
export interface AccessClaims {
  sub: string;
  typ: SubjectType;
  sid: string;
  roles?: string[];
  /** admin: TOTP verified in this session */
  tv?: boolean;
}

export const COOKIES = {
  CANDIDATE: { access: 'vtl_at', refresh: 'vtl_rt', refreshPath: '/api/v1/auth' },
  ADMIN: { access: 'vtl_adm_at', refresh: 'vtl_adm_rt', refreshPath: '/api/v1/admin/auth' },
  CSRF: 'vtl_csrf',
} as const;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** JWT access (short) + opaque rotating refresh token (hashed in DB) with reuse detection. */
@Injectable()
export class TokensService {
  constructor(@Inject(ENV) private readonly env: Env, private readonly prisma: PrismaService) {}

  private cookieBase(): CookieOptions {
    return { httpOnly: true, secure: this.env.COOKIE_SECURE, sameSite: 'strict', domain: this.env.COOKIE_DOMAIN };
  }

  signAccess(claims: AccessClaims): string {
    return jwt.sign(claims, this.env.JWT_ACCESS_SECRET, { expiresIn: this.env.ACCESS_TTL_SECONDS, algorithm: 'HS256', issuer: 'vtl-otr' });
  }
  verifyAccess(token: string): AccessClaims {
    try {
      return jwt.verify(token, this.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'vtl-otr' }) as AccessClaims;
    } catch {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Your session has expired. Please log in again.' });
    }
  }

  async issue(res: Response, req: Request, claims: Omit<AccessClaims, 'sid'> & { sid?: string }): Promise<string> {
    const sid = claims.sid ?? randomUUID();
    const access = this.signAccess({ ...claims, sid });
    const refresh = randomBytes(32).toString('base64url');
    const ttl = claims.typ === 'ADMIN' ? this.env.ADMIN_REFRESH_TTL_SECONDS : this.env.CANDIDATE_REFRESH_TTL_SECONDS;
    await this.prisma.refreshToken.create({
      data: { subjectType: claims.typ, subjectId: claims.sub, familyId: sid, tokenHash: sha(refresh), expiresAt: new Date(Date.now() + ttl * 1000), ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) },
    });
    this.setCookies(res, claims.typ, access, refresh, ttl, req);
    return sid;
  }

  private setCookies(res: Response, typ: SubjectType, access: string, refresh: string, refreshTtl: number, req: Request) {
    const c = COOKIES[typ];
    res.cookie(c.access, access, { ...this.cookieBase(), path: '/', maxAge: this.env.ACCESS_TTL_SECONDS * 1000 });
    res.cookie(c.refresh, refresh, { ...this.cookieBase(), path: c.refreshPath, maxAge: refreshTtl * 1000 });
    this.setCsrf(res, req.cookies?.[COOKIES.CSRF] as string | undefined);
  }

  setCsrf(res: Response, existing?: string): string {
    const token = existing ?? randomBytes(24).toString('base64url');
    res.cookie(COOKIES.CSRF, token, { httpOnly: false, secure: this.env.COOKIE_SECURE, sameSite: 'strict', path: '/', domain: this.env.COOKIE_DOMAIN });
    return token;
  }

  /** Rotate refresh token. A reused (already rotated) token revokes the whole family. */
  async rotate(req: Request, res: Response, typ: SubjectType, buildClaims: (subjectId: string, familyId: string) => Promise<Omit<AccessClaims, 'sid'> | null>): Promise<AccessClaims> {
    const raw = req.cookies?.[COOKIES[typ].refresh] as string | undefined;
    if (!raw) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Please log in.' });
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha(raw) } });
    if (!row || row.subjectType !== typ) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Please log in.' });
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      this.clear(res, typ);
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session ended for your security. Please log in again.' });
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Please log in again.' });
    const claims = await buildClaims(row.subjectId, row.familyId);
    if (!claims) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Please log in.' });
    const refresh = randomBytes(32).toString('base64url');
    const ttl = typ === 'ADMIN' ? this.env.ADMIN_REFRESH_TTL_SECONDS : this.env.CANDIDATE_REFRESH_TTL_SECONDS;
    const next = await this.prisma.refreshToken.create({
      data: { subjectType: typ, subjectId: row.subjectId, familyId: row.familyId, tokenHash: sha(refresh), expiresAt: new Date(Date.now() + ttl * 1000), ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) },
    });
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedById: next.id } });
    const full: AccessClaims = { ...claims, sid: row.familyId };
    this.setCookies(res, typ, this.signAccess(full), refresh, ttl, req);
    return full;
  }

  async revokeFamily(sid: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId: sid, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  async revokeAllFor(typ: SubjectType, subjectId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { subjectType: typ, subjectId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  clear(res: Response, typ: SubjectType): void {
    const c = COOKIES[typ];
    res.clearCookie(c.access, { path: '/' });
    res.clearCookie(c.refresh, { path: c.refreshPath });
  }
}
