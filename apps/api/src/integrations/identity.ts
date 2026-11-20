import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Env } from '../config/env';
import type { RedisService } from '../infra/redis.service';
import { buildSimplePdf } from '../modules/pdf/simple-pdf';
import type { AadhaarEkyc, ApaarClient, DigiLockerClient } from './types';

/**
 * Mock Aadhaar e-KYC. Only a salted hash of the number (for the transaction) and the last 4 digits are kept,
 * in Redis for 10 minutes. The full Aadhaar number never reaches the database.
 */
export class MockAadhaarEkyc implements AadhaarEkyc {
  constructor(private readonly redis: RedisService, private readonly env: Env) {}
  async initiate(aadhaar: string): Promise<{ txnId: string }> {
    const digits = aadhaar.replace(/\D/g, '');
    if (!/^[2-9]\d{11}$/.test(digits)) throw new Error('INVALID_AADHAAR');
    const txnId = randomBytes(12).toString('hex');
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.setJson(this.redis.key('ekyc', txnId), { last4: digits.slice(-4), ref: createHash('sha256').update(`${txnId}:${digits}`).digest('hex'), otp }, 600);
    if (this.env.DEV_EXPOSE_SECRETS) await this.redis.client.set(this.redis.key('dev', 'ekyc', txnId), otp, 'EX', 600);
    return { txnId };
  }
  async verify(txnId: string, otp: string) {
    const s = await this.redis.getJson<{ last4: string; ref: string; otp: string }>(this.redis.key('ekyc', txnId));
    if (!s || s.otp !== otp) return null;
    await this.redis.client.del(this.redis.key('ekyc', txnId));
    return { refToken: `UIDREF-${s.ref.slice(0, 24)}`, last4: s.last4, name: '', dob: '', gender: 'MALE' as const };
  }
}

/** Mock DigiLocker: consent page is simulated by the API; documents are generated PDFs. */
export class MockDigiLocker implements DigiLockerClient {
  constructor(private readonly env: Env) {}
  authorizeUrl(state: string, redirectUri: string): string {
    const q = new URLSearchParams({ state, redirect_uri: redirectUri });
    return `${this.env.PUBLIC_API_URL}/api/v1/mock-digilocker/authorize?${q.toString()}`;
  }
  async exchangeCode(code: string) {
    if (!code.startsWith('DLCODE-')) throw new Error('INVALID_CODE');
    return { accessToken: `DLTOKEN-${code.slice(7)}` };
  }
  async listDocuments() {
    return [
      { uri: 'in.gov.cbse-HSCER-10', docType: 'CLASS_10' as const, issuer: 'Central Board of Secondary Education', name: 'Class X Marksheet' },
      { uri: 'in.gov.cbse-SSCER-12', docType: 'CLASS_12' as const, issuer: 'Central Board of Secondary Education', name: 'Class XII Marksheet' },
    ];
  }
  async fetchDocument(_token: string, uri: string): Promise<Buffer> {
    return buildSimplePdf([`DigiLocker document (mock)`, `URI: ${uri}`, `Issued via DigiLocker sandbox`]);
  }
}

export class MockApaar implements ApaarClient {
  async verify(apaarId: string) {
    return { valid: /^\d{12}$/.test(apaarId) };
  }
}
