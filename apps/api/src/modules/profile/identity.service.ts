import { Inject, Injectable } from '@nestjs/common';
import { maskAadhaar } from '@vtl/shared';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { FieldCrypto } from '../../security/field-crypto';
import { APAAR, DIGILOCKER, EKYC, type AadhaarEkyc, type ApaarClient, type DigiLockerClient } from '../../integrations/types';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { DocumentsService } from './documents.service';

/** Optional identity verification via adapters. Only masked Aadhaar + reference token are stored. */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: FieldCrypto,
    private readonly audit: AuditService,
    private readonly docs: DocumentsService,
    private readonly data: CandidateDataService,
    @Inject(EKYC) private readonly ekyc: AadhaarEkyc,
    @Inject(DIGILOCKER) private readonly digilocker: DigiLockerClient,
    @Inject(APAAR) private readonly apaar: ApaarClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async aadhaarInitiate(candidateId: string, body: unknown) {
    const { aadhaar, consent } = parseOrThrow(z.object({ aadhaar: z.string().regex(/^\d{4}\s?\d{4}\s?\d{4}$/, 'validation.aadhaar'), consent: z.literal(true) }), body);
    try {
      const { txnId } = await this.ekyc.initiate(aadhaar);
      await this.redis.client.set(this.redis.key('ekyc-owner', txnId), candidateId, 'EX', 600);
      await this.audit.log({ action: 'AADHAAR_EKYC_INITIATED', entity: 'Candidate', entityId: candidateId, after: { masked: maskAadhaar(aadhaar), consent } });
      return { txnId, masked: maskAadhaar(aadhaar) };
    } catch {
      throw new AppError('INVALID_AADHAAR', 'Please enter a valid 12-digit Aadhaar number.');
    }
  }

  async aadhaarVerify(candidateId: string, body: unknown) {
    const b = parseOrThrow(z.object({ txnId: z.string().min(8), otp: z.string().regex(/^\d{6}$/) }), body);
    const owner = await this.redis.client.get(this.redis.key('ekyc-owner', b.txnId));
    if (owner !== candidateId) throw new AppError('EKYC_EXPIRED', 'This verification has expired. Please start again.');
    const r = await this.ekyc.verify(b.txnId, b.otp);
    if (!r) throw new AppError('OTP_INVALID', 'The code entered is incorrect.');
    await this.prisma.candidateProfile.update({ where: { candidateId }, data: { aadhaarMasked: `XXXX-XXXX-${r.last4}`, aadhaarRefToken: r.refToken, aadhaarVerifiedAt: new Date() } });
    await this.audit.log({ action: 'AADHAAR_EKYC_VERIFIED', entity: 'Candidate', entityId: candidateId, after: { masked: `XXXX-XXXX-${r.last4}` } });
    return { aadhaarMasked: `XXXX-XXXX-${r.last4}` };
  }

  async digilockerConnect(candidateId: string) {
    const state = randomBytes(16).toString('base64url');
    await this.redis.client.set(this.redis.key('dl-state', state), candidateId, 'EX', 600);
    return { url: this.digilocker.authorizeUrl(state, `${this.env.PUBLIC_API_URL}/api/v1/me/identity/digilocker/callback`) };
  }

  /** OAuth-style callback: fetches class 10/12 certificates and stores them as documents. */
  async digilockerCallback(code: string, state: string): Promise<string> {
    const candidateId = await this.redis.client.getdel(this.redis.key('dl-state', state));
    if (!candidateId) return `${this.env.CANDIDATE_WEB_URL}/profile/education?digilocker=expired`;
    const { accessToken } = await this.digilocker.exchangeCode(code);
    const list = await this.digilocker.listDocuments(accessToken);
    for (const d of list) {
      const buf = await this.digilocker.fetchDocument(accessToken, d.uri);
      await this.docs.upload(candidateId, d.docType === 'CLASS_10' ? 'EDU_CLASS_10' : 'EDU_CLASS_12', { buffer: buf, originalname: `${d.name}.pdf`, size: buf.length } as Express.Multer.File, 'DIGILOCKER');
    }
    await this.prisma.candidateProfile.update({ where: { candidateId }, data: { digilockerLinkedAt: new Date() } });
    await this.audit.log({ action: 'DIGILOCKER_FETCHED', entity: 'Candidate', entityId: candidateId, actorType: 'CANDIDATE', actorId: candidateId, after: { count: list.length } });
    return `${this.env.CANDIDATE_WEB_URL}/profile/education?digilocker=ok`;
  }

  async apaarVerify(candidateId: string, body: unknown) {
    const { apaarId } = parseOrThrow(z.object({ apaarId: z.string().regex(/^\d{12}$/, 'validation.apaar') }), body);
    const v = await this.data.view(candidateId);
    const r = await this.apaar.verify(apaarId, v.personal.dob ?? '');
    if (!r.valid) throw new AppError('APAAR_INVALID', 'APAAR ID could not be verified.');
    await this.prisma.candidateProfile.update({ where: { candidateId }, data: { apaarIdEnc: this.crypto.encrypt(apaarId) } });
    await this.audit.log({ action: 'APAAR_LINKED', entity: 'Candidate', entityId: candidateId });
    return { apaarId };
  }
}
