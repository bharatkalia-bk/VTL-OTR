import { Body, Controller, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { CandidateGuard, CurrentUser } from '../../common/auth';
import { parseOrThrow } from '../../common/zod';
import { PAYMENT, type PaymentGateway } from '../../integrations/types';
import { MockPaymentGateway } from '../../integrations/payment';
import type { AccessClaims } from '../../security/tokens.service';
import { PdfDocsService } from '../pdf/pdf-docs.service';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly pdf: PdfDocsService, @Inject(PAYMENT) private readonly gateway: PaymentGateway, @Inject(ENV) private readonly env: Env) {}

  @Post('applications/:id/payments')
  @UseGuards(CandidateGuard)
  @HttpCode(200)
  initiate(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.initiate(u.sub, id);
  }

  @Get('payments/by-txn/:txn')
  @UseGuards(CandidateGuard)
  status(@CurrentUser() u: AccessClaims, @Param('txn') txn: string) {
    return this.payments.status(u.sub, txn);
  }

  @Get('payments/:id/receipt.pdf')
  @UseGuards(CandidateGuard)
  async receipt(@CurrentUser() u: AccessClaims, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const p = await this.payments.assertOwned(u.sub, id);
    const buf = await this.pdf.receipt(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt-${p.merchantTxnId}.pdf"`);
    res.send(buf);
  }

  /** Server-to-server gateway callback (signature-verified, idempotent). CSRF-exempt by design. */
  @Post('payments/callback/:gateway')
  @HttpCode(200)
  callback(@Param('gateway') gateway: string, @Body() body: Record<string, unknown>, @Headers() headers: Record<string, string>) {
    return this.payments.handleCallback(gateway, body, headers);
  }

  // ─── Mock gateway hosted checkout (dev only behaviour of the mock adapter) ───
  @Get('mock-gateway/pay/:txn')
  @ApiExcludeEndpoint()
  async mockPage(@Param('txn') txn: string, @Res() res: Response) {
    if (!(this.gateway instanceof MockPaymentGateway)) { res.status(404).end(); return; }
    const o = await this.gateway.getOrder(txn);
    if (!o) { res.status(404).send('Unknown transaction'); return; }
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock Payment Gateway</title>
<style>body{font-family:Inter,Arial,sans-serif;background:#f6f7fb;color:#07102d;margin:0;padding:24px}main{max-width:420px;margin:0 auto;background:#fff;border:1px solid #e3e6ef;border-radius:8px;padding:24px}
h1{font-size:20px;margin:0 0 4px}.amt{font-size:32px;font-weight:700;margin:16px 0}.muted{color:#4a5272;font-size:13px}button{display:block;width:100%;height:48px;border-radius:8px;border:0;font-size:16px;font-weight:600;margin-top:10px;cursor:pointer}
.s{background:#16803c;color:#fff}.f{background:#b91c1c;color:#fff}.p{background:#b45309;color:#fff}.tag{display:inline-block;background:#fdede8;color:#a82a0c;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:700}</style></head>
<body><main><span class="tag">TEST MODE</span><h1>Mock Payment Gateway</h1><p class="muted">Simulates Razorpay / PayU / SBI ePay style checkout for development.</p>
<p class="muted">Transaction <b>${esc(txn)}</b></p><div class="amt">₹ ${o.amount}</div>
<form method="post" action="/api/v1/mock-gateway/complete"><input type="hidden" name="txn" value="${esc(txn)}">
<button class="s" name="outcome" value="SUCCESS" data-testid="pg-success">Pay successfully</button>
<button class="f" name="outcome" value="FAILED" data-testid="pg-failure">Simulate failure</button>
<button class="p" name="outcome" value="PENDING" data-testid="pg-pending">Simulate pending (bank delay)</button></form></main></body></html>`);
  }

  @Post('mock-gateway/complete')
  @ApiExcludeEndpoint()
  async mockComplete(@Body() body: unknown, @Res() res: Response) {
    if (!(this.gateway instanceof MockPaymentGateway)) { res.status(404).end(); return; }
    const b = parseOrThrow(z.object({ txn: z.string().min(5), outcome: z.enum(['SUCCESS', 'FAILED', 'PENDING']) }), body);
    const r = await this.gateway.complete(b.txn, b.outcome);
    if (!r) { res.status(404).send('Unknown transaction'); return; }
    // Simulated server-to-server webhook (SUCCESS / FAILED only; PENDING resolves via reconciliation).
    if (b.outcome !== 'PENDING') await this.payments.handleCallback('mock', r.payload, {}).catch(() => undefined);
    else await this.payments.applyGatewayResult(this.gateway.parseCallback(r.payload), 'CALLBACK').catch(() => undefined);
    res.redirect(303, r.order.returnUrl);
  }
}
