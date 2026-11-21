import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CandidateGuard } from '../../common/auth';
import { IdentityService } from './identity.service';

/** Mock DigiLocker consent screen + OAuth callback. */
@ApiExcludeController()
@Controller()
export class DigiLockerMockController {
  constructor(private readonly identity: IdentityService) {}

  @Get('mock-digilocker/authorize')
  authorize(@Query('state') state: string, @Query('redirect_uri') redirect: string, @Res() res: Response) {
    const code = `DLCODE-${randomBytes(8).toString('hex')}`;
    const target = `${redirect}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DigiLocker (mock)</title>
<style>body{font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:24px;color:#07102d}main{max-width:420px;margin:auto;background:#fff;border:1px solid #e3e6ef;border-radius:8px;padding:24px}a{display:block;text-align:center;background:#07102d;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px}</style></head>
<body><main><h1 style="font-size:20px">DigiLocker (sandbox)</h1><p>VTL OTR is requesting access to your <b>Class X</b> and <b>Class XII</b> marksheets.</p><a href="${esc(target)}" data-testid="dl-allow">Allow</a></main></body></html>`);
  }

  @Get('me/identity/digilocker/callback')
  @UseGuards(CandidateGuard)
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    res.redirect(303, await this.identity.digilockerCallback(code, state));
  }
}
