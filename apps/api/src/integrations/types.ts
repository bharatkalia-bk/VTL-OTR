/** Adapter interfaces for every external integration. Mock implementations are default (env-selectable). */

export interface SmsGateway {
  send(to: string, text: string, meta: { templateCode: string; dltTemplateId?: string | null }): Promise<{ providerRef: string }>;
}

export interface EmailGateway {
  send(msg: { to: string; subject: string; html: string; text: string; attachments?: Array<{ filename: string; content: Buffer }> }): Promise<{ providerRef: string }>;
}

export type GatewayPaymentStatus = 'SUCCESS' | 'FAILED' | 'PENDING';
export interface PaymentOrderInput {
  merchantTxnId: string;
  amount: number;
  description: string;
  returnUrl: string;
  callbackUrl: string;
}
export interface PaymentCallbackResult {
  merchantTxnId: string;
  gatewayTxnId: string | null;
  status: GatewayPaymentStatus;
  amount: number;
  signatureValid: boolean;
  raw: Record<string, unknown>;
}
export interface PaymentGateway {
  readonly name: string;
  createOrder(input: PaymentOrderInput): Promise<{ redirectUrl: string }>;
  parseCallback(body: Record<string, unknown>, headers: Record<string, string | string[] | undefined>): PaymentCallbackResult;
  fetchStatus(merchantTxnId: string): Promise<{ status: GatewayPaymentStatus; gatewayTxnId: string | null; amount: number } | null>;
}

export interface AadhaarEkyc {
  /** Starts OTP-based e-KYC. Implementations must never persist the full Aadhaar number. */
  initiate(aadhaar: string): Promise<{ txnId: string }>;
  verify(txnId: string, otp: string): Promise<{ refToken: string; last4: string; name: string; dob: string; gender: 'MALE' | 'FEMALE' | 'TRANSGENDER' } | null>;
}

export interface DigiLockerClient {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string): Promise<{ accessToken: string }>;
  listDocuments(accessToken: string): Promise<Array<{ uri: string; docType: 'CLASS_10' | 'CLASS_12'; issuer: string; name: string }>>;
  fetchDocument(accessToken: string, uri: string): Promise<Buffer>;
}

export interface ApaarClient {
  verify(apaarId: string, dob: string): Promise<{ valid: boolean; name?: string }>;
}

export const SMS = Symbol('SMS');
export const EMAIL = Symbol('EMAIL');
export const PAYMENT = Symbol('PAYMENT');
export const EKYC = Symbol('EKYC');
export const DIGILOCKER = Symbol('DIGILOCKER');
export const APAAR = Symbol('APAAR');
