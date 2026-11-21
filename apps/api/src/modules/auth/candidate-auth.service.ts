import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  CONSENT_NOTICE_VERSION, isValidOtrId, maskEmail, maskMobile, normaliseName,
  type LoginInput, type RegisterStartInput, type SessionUser,
} from '@vtl/shared';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { AppError } from '../../common/errors';
import { CaptchaService } from '../../integrations/captcha';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RateLimitService } from '../../infra/rate-limit.service';
import { RedisService } from '../../infra/redis.service';
import { SettingsService } from '../../infra/settings.service';
import { FieldCrypto } from '../../security/field-crypto';
import { dummyVerify, hashPassword, verifyPassword } from '../../security/password';
import { TokensService } from '../../security/tokens.service';
import { NotifyService } from '../notify/notify.service';
import { OtpService } from '../notify/otp.service';

interface PendingRegistration {
  enc: string; // encrypted RegisterStartInput (sans captcha)
  mobileIdx: string;
  emailIdx: string;
  dedupeKey: string;
}

@Injectable()
export class CandidateAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: FieldCrypto,
    private readonly otp: OtpService,
    private readonly captcha: CaptchaService,
    private readonly tokens: TokensService,
    private readonly rl: RateLimitService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notify: NotifyService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  dedupeKey(fullName: string, dob: string, fatherName: string): string {
    return this.crypto.blindIndex('identity', `${normaliseName(fullName)}|${dob}|${normaliseName(fatherName)}`);
  }
  nameTokens(fullName: string): string[] {
    return [...new Set(normaliseName(fullName).split(' ').filter((t) => t.length >= 2).map((t) => this.crypto.blindIndex('name', t)))];
  }

  async registerStart(input: RegisterStartInput, ip: string) {
    await this.rl.hit('register-ip', ip, 30, 3600);
    await this.captcha.verify(input.captchaId, input.captchaText);
    const mobileIdx = this.crypto.blindIndex('mobile', input.mobile);
    const emailIdx = this.crypto.blindIndex('email', input.email);
    const dedupeKey = this.dedupeKey(input.fullName, input.dob, input.fatherName);
    const [m, e, id] = await Promise.all([
      this.prisma.candidate.findUnique({ where: { mobileIdx }, select: { id: true } }),
      this.prisma.candidate.findUnique({ where: { emailIdx }, select: { id: true } }),
      this.prisma.candidate.findFirst({ where: { dedupeKey }, select: { id: true } }),
    ]);
    if (m) throw new ConflictException({ code: 'MOBILE_EXISTS', message: 'This mobile number is already registered. Please log in or use Forgot OTR ID.' });
    if (e) throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'This email is already registered. Please log in or use Forgot OTR ID.' });
    if (id) throw new ConflictException({ code: 'IDENTITY_EXISTS', message: 'A registration with the same name, date of birth and father’s name already exists. Use Forgot OTR ID, or contact the helpdesk.' });
    const { captchaId: _c, captchaText: _t, ...data } = input;
    const pending: PendingRegistration = { enc: this.crypto.encJson(data), mobileIdx, emailIdx, dedupeKey };
    const ch = await this.otp.create('REGISTER', 'new', { mobile: input.mobile, email: input.email }, input.language);
    await this.redis.setJson(this.redis.key('reg', ch.challengeId), pending, ch.expiresIn);
    return { registrationId: ch.challengeId, maskedMobile: maskMobile(input.mobile), maskedEmail: maskEmail(input.email), expiresIn: ch.expiresIn, resendIn: ch.resendIn };
  }

  async registerResend(registrationId: string) {
    const pending = await this.redis.getJson<PendingRegistration>(this.redis.key('reg', registrationId));
    if (!pending) throw new AppError('REGISTRATION_EXPIRED', 'Your registration session expired. Please start again.');
    const data = this.crypto.decJson<Omit<RegisterStartInput, 'captchaId' | 'captchaText'>>(pending.enc)!;
    const ch = await this.otp.create('REGISTER', 'new', { mobile: data.mobile, email: data.email }, data.language);
    await this.redis.setJson(this.redis.key('reg', ch.challengeId), pending, ch.expiresIn);
    await this.redis.client.del(this.redis.key('reg', registrationId));
    return { registrationId: ch.challengeId, expiresIn: ch.expiresIn, resendIn: ch.resendIn };
  }

  async registerVerify(registrationId: string, mobileOtp: string, emailOtp: string, req: Request) {
    const key = this.redis.key('reg', registrationId);
    const pending = await this.redis.getJson<PendingRegistration>(key);
    if (!pending) throw new AppError('REGISTRATION_EXPIRED', 'Your registration session expired. Please start again.');
    await this.otp.verify(registrationId, { mobile: mobileOtp, email: emailOtp }, 'REGISTER');
    await this.redis.client.del(key);
    const d = this.crypto.decJson<Omit<RegisterStartInput, 'captchaId' | 'captchaText'>>(pending.enc)!;
    const now = new Date();
    const cand = await this.prisma.$transaction(async (tx) => {
      const c = await tx.candidate.create({
        data: {
          mobileEnc: this.crypto.encrypt(d.mobile), mobileIdx: pending.mobileIdx, emailEnc: this.crypto.encrypt(d.email), emailIdx: pending.emailIdx,
          mobileVerifiedAt: now, emailVerifiedAt: now, language: d.language, dedupeKey: pending.dedupeKey, nameTokens: this.nameTokens(d.fullName),
          profile: { create: { fullNameEnc: this.crypto.encrypt(d.fullName.toUpperCase()), fatherNameEnc: this.crypto.encrypt(d.fatherName.toUpperCase()), dobEnc: this.crypto.encrypt(d.dob), gender: d.gender, nationality: 'INDIAN' } },
          consents: { create: [
            { purposeCode: 'OTR_REGISTRATION', noticeVersion: d.consentNoticeVersion ?? CONSENT_NOTICE_VERSION, language: d.language, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) },
            { purposeCode: 'EXAM_APPLICATION_PROCESSING', noticeVersion: d.consentNoticeVersion ?? CONSENT_NOTICE_VERSION, language: d.language, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) },
          ] },
        },
      });
      await this.audit.log({ action: 'CANDIDATE_REGISTERED', entity: 'Candidate', entityId: c.id, actorType: 'CANDIDATE', actorId: c.id, after: { mobileVerified: true, emailVerified: true } }, tx);
      return c;
    });
    const registrationToken = randomBytes(24).toString('base64url');
    await this.redis.client.set(this.redis.key('regtok', registrationToken), cand.id, 'EX', 30 * 60);
    return { registrationToken };
  }

  async setPassword(registrationToken: string, password: string, req: Request, res: Response): Promise<SessionUser> {
    const id = await this.redis.client.getdel(this.redis.key('regtok', registrationToken));
    if (!id) throw new AppError('TOKEN_EXPIRED', 'This link has expired. Please log in using OTP to continue.');
    await this.prisma.candidate.update({ where: { id }, data: { passwordHash: await hashPassword(password), lastLoginAt: new Date() } });
    await this.audit.log({ action: 'PASSWORD_SET', entity: 'Candidate', entityId: id, actorType: 'CANDIDATE', actorId: id });
    await this.tokens.issue(res, req, { sub: id, typ: 'CANDIDATE' });
    return this.sessionUser(id);
  }

  /** Identifier may be OTR ID, mobile or email. */
  async findByIdentifier(identifier: string) {
    const id = identifier.trim();
    if (isValidOtrId(id, (await this.settings.get()).otrIdFormat)) return this.prisma.candidate.findUnique({ where: { otrId: id.toUpperCase() } });
    if (/^[6-9]\d{9}$/.test(id)) return this.prisma.candidate.findUnique({ where: { mobileIdx: this.crypto.blindIndex('mobile', id) } });
    if (id.includes('@')) return this.prisma.candidate.findUnique({ where: { emailIdx: this.crypto.blindIndex('email', id.toLowerCase()) } });
    return null;
  }

  async login(input: LoginInput, req: Request, res: Response): Promise<SessionUser> {
    const ip = req.ip ?? 'unknown';
    await this.rl.hit('login-ip', ip, 50, 15 * 60);
    await this.rl.hit('login-id', this.crypto.blindIndex('login', input.identifier), 20, 15 * 60);
    await this.captcha.verify(input.captchaId, input.captchaText);
    const c = await this.findByIdentifier(input.identifier);
    const generic = () => new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'The login details are incorrect.' });
    if (!c || !c.passwordHash) {
      await dummyVerify(input.password);
      throw generic();
    }
    if (c.lockedUntil && c.lockedUntil > new Date()) {
      throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', message: 'Your account is temporarily locked due to repeated failed logins. Try again later or reset your password.', lockedUntil: c.lockedUntil });
    }
    if (c.status === 'BLOCKED') throw new ForbiddenException({ code: 'BLOCKED', message: 'Your account has been blocked. Please contact the helpdesk.' });
    const ok = await verifyPassword(c.passwordHash, input.password);
    if (!ok) {
      const s = await this.settings.get();
      const failed = c.failedLogins + 1;
      const lock = failed >= s.lockout.maxFailures ? new Date(Date.now() + s.lockout.lockMinutes * 60000) : null;
      await this.prisma.candidate.update({ where: { id: c.id }, data: { failedLogins: lock ? 0 : failed, lockedUntil: lock } });
      await this.audit.log({ action: lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', entity: 'Candidate', entityId: c.id, actorType: 'CANDIDATE', actorId: c.id });
      throw generic();
    }
    await this.prisma.candidate.update({ where: { id: c.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log({ action: 'LOGIN', entity: 'Candidate', entityId: c.id, actorType: 'CANDIDATE', actorId: c.id });
    await this.tokens.issue(res, req, { sub: c.id, typ: 'CANDIDATE' });
    return this.sessionUser(c.id);
  }

  /** OTP is sent to the channel matching the identifier type (mobile for OTR ID / mobile). Response is generic. */
  async otpChallengeFor(identifier: string, purpose: 'LOGIN' | 'FORGOT_PASSWORD') {
    const c = await this.findByIdentifier(identifier);
    if (!c || c.status === 'BLOCKED') {
      return { challengeId: randomBytes(16).toString('base64url'), sentTo: 'registered contact', expiresIn: 600, resendIn: 30 };
    }
    const viaEmail = identifier.includes('@');
    const target = viaEmail ? { email: this.crypto.decrypt(c.emailEnc) } : { mobile: this.crypto.decrypt(c.mobileEnc) };
    const ch = await this.otp.create(purpose, c.id, target, c.language as 'en' | 'hi');
    return { challengeId: ch.challengeId, sentTo: viaEmail ? maskEmail(target.email!) : maskMobile(target.mobile!), expiresIn: ch.expiresIn, resendIn: ch.resendIn };
  }

  async otpLoginVerify(challengeId: string, code: string, req: Request, res: Response): Promise<SessionUser> {
    const ch = await this.verifySingle(challengeId, code, 'LOGIN');
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id: ch.subject } });
    if (c.status === 'BLOCKED') throw new ForbiddenException({ code: 'BLOCKED', message: 'Your account has been blocked. Please contact the helpdesk.' });
    await this.prisma.candidate.update({ where: { id: c.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log({ action: 'LOGIN_OTP', entity: 'Candidate', entityId: c.id, actorType: 'CANDIDATE', actorId: c.id });
    await this.tokens.issue(res, req, { sub: c.id, typ: 'CANDIDATE' });
    return this.sessionUser(c.id);
  }

  async resetPassword(challengeId: string, code: string, password: string) {
    const ch = await this.verifySingle(challengeId, code, 'FORGOT_PASSWORD');
    await this.prisma.candidate.update({ where: { id: ch.subject }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } });
    await this.tokens.revokeAllFor('CANDIDATE', ch.subject);
    await this.audit.log({ action: 'PASSWORD_RESET', entity: 'Candidate', entityId: ch.subject, actorType: 'CANDIDATE', actorId: ch.subject });
    return { ok: true };
  }

  private async verifySingle(challengeId: string, code: string, purpose: 'LOGIN' | 'FORGOT_PASSWORD') {
    const raw = await this.redis.getJson<{ codes: Record<string, string> }>(this.redis.key('otp', challengeId));
    const channel = raw && 'email' in raw.codes ? 'email' : 'mobile';
    return this.otp.verify(challengeId, { [channel]: code }, purpose);
  }

  /** Always returns a generic message; sends OTR ID to registered mobile+email only on exact match with DOB. */
  async forgotOtr(identifier: string, dob: string, ip: string) {
    await this.rl.hit('forgot-otr-ip', ip, 20, 3600);
    const c = await this.findByIdentifier(identifier);
    if (c?.otrId) {
      const p = await this.prisma.candidateProfile.findUnique({ where: { candidateId: c.id } });
      if (p?.dobEnc && this.crypto.decrypt(p.dobEnc) === dob) {
        await this.notify.send({ templateCode: 'FORGOT_OTR', lang: c.language as 'en' | 'hi', mobile: this.crypto.decrypt(c.mobileEnc), email: this.crypto.decrypt(c.emailEnc), params: { otrId: c.otrId } });
        await this.audit.log({ action: 'FORGOT_OTR_SENT', entity: 'Candidate', entityId: c.id });
      }
    }
    return { ok: true, message: 'If the details match a submitted registration, the OTR ID has been sent to the registered mobile and email.' };
  }

  async sessionUser(id: string): Promise<SessionUser> {
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id }, include: { profile: { select: { fullNameEnc: true } } } });
    return { id: c.id, type: 'CANDIDATE', otrId: c.otrId, name: this.crypto.decOpt(c.profile?.fullNameEnc) ?? '', status: c.status, language: c.language as 'en' | 'hi' };
  }

  async refresh(req: Request, res: Response) {
    const claims = await this.tokens.rotate(req, res, 'CANDIDATE', async (id) => {
      const c = await this.prisma.candidate.findUnique({ where: { id }, select: { status: true } });
      return c && c.status !== 'BLOCKED' ? { sub: id, typ: 'CANDIDATE' } : null;
    });
    return this.sessionUser(claims.sub);
  }
}
