import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env';
import type { RedisService } from '../infra/redis.service';
import type { GatewayPaymentStatus, PaymentCallbackResult, PaymentGateway, PaymentOrderInput } from './types';

export function signPayload(secret: string, fields: Record<string, string | number>): string {
  const canonical = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('|');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

interface MockOrder { amount: number; status: GatewayPaymentStatus | 'CREATED'; gatewayTxnId: string | null; returnUrl: string; callbackUrl: string; resolveAt?: number }

/**
 * Mock gateway in the style of Razorpay / PayU / SBI ePay:
 * hosted checkout page (served by the API under /api/v1/mock-gateway), HMAC-signed server-to-server
 * callback, browser redirect, and a status API used by reconciliation. "Pending" resolves to SUCCESS
 * after `pendingResolveSeconds` so reconciliation can be demonstrated.
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';
  pendingResolveSeconds = 60;
  constructor(private readonly redis: RedisService, private readonly env: Env) {}

  private k(id: string) { return this.redis.key('mockpg', id); }

  async createOrder(input: PaymentOrderInput): Promise<{ redirectUrl: string }> {
    const o: MockOrder = { amount: input.amount, status: 'CREATED', gatewayTxnId: null, returnUrl: input.returnUrl, callbackUrl: input.callbackUrl };
    await this.redis.setJson(this.k(input.merchantTxnId), o, 24 * 3600);
    return { redirectUrl: `${this.env.PUBLIC_API_URL}/api/v1/mock-gateway/pay/${encodeURIComponent(input.merchantTxnId)}` };
  }

  async getOrder(merchantTxnId: string): Promise<MockOrder | null> {
    return this.redis.getJson<MockOrder>(this.k(merchantTxnId));
  }

  /** Called by the mock checkout page. Returns the signed payload to deliver. */
  async complete(merchantTxnId: string, outcome: GatewayPaymentStatus): Promise<{ payload: Record<string, string | number>; order: MockOrder } | null> {
    const o = await this.getOrder(merchantTxnId);
    if (!o) return null;
    o.gatewayTxnId ??= `MPG${Date.now()}${randomBytes(3).toString('hex').toUpperCase()}`;
    o.status = outcome;
    if (outcome === 'PENDING') o.resolveAt = Date.now() + this.pendingResolveSeconds * 1000;
    await this.redis.setJson(this.k(merchantTxnId), o, 24 * 3600);
    const fields = { merchantTxnId, gatewayTxnId: o.gatewayTxnId, status: outcome, amount: o.amount };
    return { payload: { ...fields, signature: signPayload(this.env.PAYMENT_WEBHOOK_SECRET, fields) }, order: o };
  }

  parseCallback(body: Record<string, unknown>): PaymentCallbackResult {
    const fields = {
      merchantTxnId: String(body.merchantTxnId ?? ''),
      gatewayTxnId: String(body.gatewayTxnId ?? ''),
      status: String(body.status ?? ''),
      amount: Number(body.amount ?? NaN),
    };
    const expected = Buffer.from(signPayload(this.env.PAYMENT_WEBHOOK_SECRET, fields));
    const got = Buffer.from(String(body.signature ?? ''));
    const signatureValid = expected.length === got.length && timingSafeEqual(expected, got);
    const status = (['SUCCESS', 'FAILED', 'PENDING'] as const).find((s) => s === fields.status) ?? 'FAILED';
    return { merchantTxnId: fields.merchantTxnId, gatewayTxnId: fields.gatewayTxnId || null, status, amount: fields.amount, signatureValid, raw: { ...fields } };
  }

  async fetchStatus(merchantTxnId: string) {
    const o = await this.getOrder(merchantTxnId);
    if (!o || o.status === 'CREATED') return o ? { status: 'PENDING' as const, gatewayTxnId: null, amount: o.amount } : null;
    if (o.status === 'PENDING' && o.resolveAt && Date.now() >= o.resolveAt) {
      o.status = 'SUCCESS';
      await this.redis.setJson(this.k(merchantTxnId), o, 24 * 3600);
    }
    return { status: o.status, gatewayTxnId: o.gatewayTxnId, amount: o.amount };
  }
}
