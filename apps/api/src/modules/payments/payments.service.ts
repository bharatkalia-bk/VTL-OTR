import { Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { Prisma, type Payment, type PaymentStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { AppError } from '../../common/errors';
import { AuditService } from '../../infra/audit.service';
import { logger } from '../../infra/logger';
import { PrismaService } from '../../infra/prisma.service';
import { QueueService } from '../../infra/queue.service';
import { PAYMENT, type PaymentCallbackResult, type PaymentGateway } from '../../integrations/types';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { applyWindow } from '../exams/exam-rules';
import { NotifyService } from '../notify/notify.service';

/** Allowed transitions. SUCCESS is terminal except for the admin refund marker. */
const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  INITIATED: ['PENDING', 'SUCCESS', 'FAILED'],
  PENDING: ['SUCCESS', 'FAILED'],
  FAILED: ['SUCCESS'], // late success reported by gateway/reconciliation
  SUCCESS: ['REFUND_MARKED'],
  REFUND_MARKED: [],
};

@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly notify: NotifyService,
    private readonly data: CandidateDataService,
    @Inject(PAYMENT) private readonly gateway: PaymentGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.queue.register('payments', 'reconcile', async () => this.reconcile());
  }

  async initiate(candidateId: string, applicationId: string) {
    const app = await this.prisma.application.findFirst({ where: { id: applicationId, candidateId }, include: { exam: true, payments: true } });
    if (!app) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Application not found.' });
    if (app.status !== 'PAYMENT_PENDING') throw new AppError('PAYMENT_NOT_DUE', app.status === 'PAID' ? 'Fee already paid.' : 'No payment is due for this application.', 409);
    if (!applyWindow(app.exam).feeOpen) throw new AppError('FEE_CLOSED', 'The last date for fee payment has passed.');
    const inFlight = app.payments.find((p) => p.status === 'PENDING');
    if (inFlight) throw new AppError('PAYMENT_PENDING', 'A previous payment is still being confirmed by the bank. Please check again in a few minutes.', 409, { paymentId: inFlight.id });
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const merchantTxnId = `VTLP${ymd}${randomBytes(5).toString('hex').toUpperCase()}`;
    const p = await this.prisma.payment.create({ data: { applicationId, merchantTxnId, gateway: this.gateway.name, amount: app.feeAmount, events: { create: { source: 'INITIATE', idempotencyKey: `INITIATE:${merchantTxnId}`, payload: { amount: app.feeAmount } } } } });
    const { redirectUrl } = await this.gateway.createOrder({
      merchantTxnId, amount: app.feeAmount, description: `${app.exam.code} application fee ${app.applicationNo}`,
      returnUrl: `${this.env.CANDIDATE_WEB_URL}/applications/${applicationId}/payment?txn=${merchantTxnId}`,
      callbackUrl: `${this.env.PUBLIC_API_URL}/api/v1/payments/callback/${this.gateway.name}`,
    });
    await this.audit.log({ action: 'PAYMENT_INITIATED', entity: 'Payment', entityId: p.id, after: { amount: p.amount, merchantTxnId } });
    return { paymentId: p.id, merchantTxnId, redirectUrl };
  }

  /** Idempotent: the same (source, txn, status, gatewayTxn) is applied once; replays return current state. */
  async applyGatewayResult(r: PaymentCallbackResult, source: 'CALLBACK' | 'RECON'): Promise<Payment> {
    if (!r.signatureValid) {
      logger.warn({ txn: r.merchantTxnId, source }, 'payment callback signature invalid');
      throw new AppError('INVALID_SIGNATURE', 'Invalid signature.', 400);
    }
    const p = await this.prisma.payment.findUnique({ where: { merchantTxnId: r.merchantTxnId } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Unknown transaction.' });
    const key = `${source}:${r.merchantTxnId}:${r.status}:${r.gatewayTxnId ?? ''}`;
    try {
      await this.prisma.paymentEvent.create({ data: { paymentId: p.id, source, idempotencyKey: key, payload: r.raw as Prisma.InputJsonValue } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return p; // duplicate delivery
      throw e;
    }
    let next: PaymentStatus = r.status;
    let note: string | null = null;
    if (r.status === 'SUCCESS' && r.amount !== p.amount) {
      next = 'FAILED';
      note = `AMOUNT_MISMATCH expected ${p.amount} got ${r.amount}`;
    }
    if (next === p.status || !TRANSITIONS[p.status].includes(next)) return p;

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.payment.update({
        where: { id: p.id },
        data: { status: next, gatewayTxnId: r.gatewayTxnId ?? p.gatewayTxnId, rawCallback: r.raw as Prisma.InputJsonValue, ...(source === 'RECON' && { reconciledAt: new Date(), reconciliationNote: note ?? `Reconciled: ${next}` }), ...(note && { reconciliationNote: note }) },
      });
      const app = await tx.application.findUniqueOrThrow({ where: { id: p.applicationId }, include: { exam: true } });
      if (next === 'SUCCESS') {
        if (app.status === 'PAYMENT_PENDING') {
          await tx.application.update({ where: { id: app.id }, data: { status: 'PAID', events: { create: { status: 'PAID', note: `Fee received. Ref ${u.gatewayTxnId}` } } } });
          await tx.notification.create({ data: { candidateId: app.candidateId, titleKey: 'notifications.paymentSuccess', params: { applicationNo: app.applicationNo, amount: u.amount }, link: `/applications/${app.id}` } });
        } else if (app.status === 'PAID') {
          await tx.payment.update({ where: { id: p.id }, data: { reconciliationNote: 'DUPLICATE_PAYMENT: application already paid; eligible for refund' } });
        }
      } else if (next === 'FAILED') {
        await tx.applicationEvent.create({ data: { applicationId: app.id, status: 'PAYMENT_FAILED', note: note ?? `Payment ${u.merchantTxnId} failed` } });
      } else if (next === 'PENDING') {
        await tx.applicationEvent.create({ data: { applicationId: app.id, status: 'PAYMENT_PENDING_CONFIRMATION', note: `Awaiting bank confirmation for ${u.merchantTxnId}` } });
      }
      await this.audit.log({ action: `PAYMENT_${next}`, entity: 'Payment', entityId: p.id, actorType: 'SYSTEM', before: { status: p.status }, after: { status: next, source, gatewayTxnId: r.gatewayTxnId } }, tx);
      return u;
    });
    if (next === 'SUCCESS' || next === 'FAILED') {
      const app = await this.prisma.application.findUniqueOrThrow({ where: { id: p.applicationId } });
      const v = await this.data.view(app.candidateId);
      await this.notify.send({ templateCode: 'PAYMENT_RESULT', lang: v.language as 'en' | 'hi', mobile: v.mobile, email: v.email, params: { amount: p.amount, applicationNo: app.applicationNo, status: next === 'SUCCESS' ? 'successful' : 'failed', txn: updated.gatewayTxnId ?? updated.merchantTxnId } });
    }
    return updated;
  }

  async handleCallback(gatewayName: string, body: Record<string, unknown>, headers: Record<string, string | string[] | undefined>) {
    if (gatewayName !== this.gateway.name) throw new NotFoundException();
    const r = this.gateway.parseCallback(body, headers);
    const p = await this.applyGatewayResult(r, 'CALLBACK');
    return { ok: true, status: p.status };
  }

  /** Reconciliation: query gateway for INITIATED/PENDING payments older than 2 minutes. */
  async reconcile(olderThanMs = 2 * 60 * 1000): Promise<{ checked: number; updated: number }> {
    const due = await this.prisma.payment.findMany({ where: { status: { in: ['INITIATED', 'PENDING'] }, createdAt: { lt: new Date(Date.now() - olderThanMs) } }, take: 500, orderBy: { createdAt: 'asc' } });
    let updated = 0;
    for (const p of due) {
      try {
        const s = await this.gateway.fetchStatus(p.merchantTxnId);
        if (!s) continue;
        const ageH = (Date.now() - p.createdAt.getTime()) / 3600000;
        // Abandoned checkouts (never completed at the gateway) are failed after 24 hours.
        const status = s.status === 'PENDING' && p.status === 'INITIATED' && ageH > 24 ? 'FAILED' : s.status;
        if (status === p.status) continue;
        const fields = { merchantTxnId: p.merchantTxnId, gatewayTxnId: s.gatewayTxnId, status, amount: s.amount };
        const res = await this.applyGatewayResult({ ...fields, signatureValid: true, raw: { ...fields, via: 'status-api' } }, 'RECON');
        if (res.status !== p.status) updated++;
      } catch (e) {
        logger.warn({ txn: p.merchantTxnId, err: String(e) }, 'reconcile failed');
      }
    }
    await this.prisma.payment.updateMany({ where: { id: { in: due.map((d) => d.id) }, reconciledAt: null }, data: { reconciledAt: new Date() } });
    return { checked: due.length, updated };
  }

  async status(candidateId: string, merchantTxnId: string) {
    const p = await this.prisma.payment.findFirst({ where: { merchantTxnId, application: { candidateId } }, include: { application: { select: { id: true, status: true, applicationNo: true } } } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found.' });
    return { id: p.id, merchantTxnId: p.merchantTxnId, gatewayTxnId: p.gatewayTxnId, amount: p.amount, status: p.status, application: p.application, updatedAt: p.updatedAt };
  }

  async assertOwned(candidateId: string, paymentId: string) {
    const p = await this.prisma.payment.findFirst({ where: { id: paymentId, application: { candidateId } } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found.' });
    if (p.status !== 'SUCCESS' && p.status !== 'REFUND_MARKED') throw new AppError('NO_RECEIPT', 'Receipt is available only for successful payments.');
    return p;
  }
}
