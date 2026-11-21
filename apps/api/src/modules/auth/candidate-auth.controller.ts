import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  forgotOtrSchema, forgotPasswordRequestSchema, forgotPasswordResetSchema, loginSchema, otpLoginRequestSchema, otpLoginVerifySchema,
  registerStartSchema, registerVerifySchema, setPasswordSchema,
} from '@vtl/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CandidateGuard, CurrentUser } from '../../common/auth';
import { parseOrThrow } from '../../common/zod';
import { CaptchaService } from '../../integrations/captcha';
import type { AccessClaims } from '../../security/tokens.service';
import { TokensService } from '../../security/tokens.service';
import { CandidateAuthService } from './candidate-auth.service';

@ApiTags('Candidate auth')
@Controller('auth')
export class CandidateAuthController {
  constructor(private readonly auth: CandidateAuthService, private readonly tokens: TokensService, private readonly captcha: CaptchaService) {}

  /** Issues the CSRF cookie; call once on app load. */
  @Get('csrf')
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.tokens.setCsrf(res, req.cookies?.vtl_csrf as string | undefined);
    return { csrfToken: token };
  }

  @Post('register/start')
  @HttpCode(200)
  start(@Body() body: unknown, @Req() req: Request) {
    return this.auth.registerStart(parseOrThrow(registerStartSchema, body), req.ip ?? 'unknown');
  }

  @Post('register/resend')
  @HttpCode(200)
  resend(@Body() body: unknown) {
    return this.auth.registerResend(parseOrThrow(z.object({ registrationId: z.string().min(10) }), body).registrationId);
  }

  @Post('register/verify')
  @HttpCode(200)
  verify(@Body() body: unknown, @Req() req: Request) {
    const b = parseOrThrow(registerVerifySchema, body);
    return this.auth.registerVerify(b.registrationId, b.mobileOtp, b.emailOtp, req);
  }

  @Post('register/password')
  @HttpCode(200)
  password(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = parseOrThrow(setPasswordSchema, body);
    return this.auth.setPassword(b.registrationToken, b.password, req, res);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(parseOrThrow(loginSchema, body), req, res);
  }

  @Post('login/otp/request')
  @HttpCode(200)
  async otpRequest(@Body() body: unknown) {
    const b = parseOrThrow(otpLoginRequestSchema, body);
    await this.captcha.verify(b.captchaId, b.captchaText);
    return this.auth.otpChallengeFor(b.identifier, 'LOGIN');
  }

  @Post('login/otp/verify')
  @HttpCode(200)
  otpVerify(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const b = parseOrThrow(otpLoginVerifySchema, body);
    return this.auth.otpLoginVerify(b.challengeId, b.otp, req, res);
  }

  @Post('forgot/otr-id')
  @HttpCode(200)
  async forgotOtr(@Body() body: unknown, @Req() req: Request) {
    const b = parseOrThrow(forgotOtrSchema, body);
    await this.captcha.verify(b.captchaId, b.captchaText);
    return this.auth.forgotOtr(b.identifier, b.dob, req.ip ?? 'unknown');
  }

  @Post('forgot/password/request')
  @HttpCode(200)
  async forgotPw(@Body() body: unknown) {
    const b = parseOrThrow(forgotPasswordRequestSchema, body);
    await this.captcha.verify(b.captchaId, b.captchaText);
    return this.auth.otpChallengeFor(b.identifier, 'FORGOT_PASSWORD');
  }

  @Post('forgot/password/reset')
  @HttpCode(200)
  reset(@Body() body: unknown) {
    const b = parseOrThrow(forgotPasswordResetSchema, body);
    return this.auth.resetPassword(b.challengeId, b.otp, b.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.vtl_at as string | undefined;
    if (raw) {
      try { await this.tokens.revokeFamily(this.tokens.verifyAccess(raw).sid); } catch { /* expired access: still clear cookies */ }
    }
    this.tokens.clear(res, 'CANDIDATE');
    return { ok: true };
  }

  @Get('me')
  @UseGuards(CandidateGuard)
  me(@CurrentUser() u: AccessClaims) {
    return this.auth.sessionUser(u.sub);
  }
}
