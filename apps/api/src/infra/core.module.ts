import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv, type Env } from '../config/env';
import { AdminGuard, CandidateGuard } from '../common/auth';
import { CaptchaService } from '../integrations/captcha';
import { MockAadhaarEkyc, MockApaar, MockDigiLocker } from '../integrations/identity';
import { MockEmail, MockSms, SmtpEmail } from '../integrations/messaging';
import { MockPaymentGateway } from '../integrations/payment';
import { APAAR, DIGILOCKER, EKYC, EMAIL, PAYMENT, SMS } from '../integrations/types';
import { NotifyService } from '../modules/notify/notify.service';
import { OtpService } from '../modules/notify/otp.service';
import { FieldCrypto } from '../security/field-crypto';
import { TokensService } from '../security/tokens.service';
import { AuditService } from './audit.service';
import { PrismaService } from './prisma.service';
import { QueueService } from './queue.service';
import { RateLimitService } from './rate-limit.service';
import { RedisService } from './redis.service';
import { SettingsService } from './settings.service';
import { createStorage, STORAGE } from './storage';

const providers = [
  { provide: ENV, useFactory: () => loadEnv() },
  { provide: FieldCrypto, inject: [ENV], useFactory: (e: Env) => new FieldCrypto(e.PII_ENC_KEY, e.PII_INDEX_KEY) },
  { provide: STORAGE, inject: [ENV], useFactory: async (e: Env) => { const s = createStorage(e); await s.ensureReady(); return s; } },
  { provide: SMS, inject: [RedisService, ENV], useFactory: (r: RedisService, e: Env) => new MockSms(r, e) },
  { provide: EMAIL, inject: [RedisService, ENV], useFactory: (r: RedisService, e: Env) => (e.EMAIL_DRIVER === 'smtp' ? new SmtpEmail(r, e) : new MockEmail(r, e)) },
  { provide: PAYMENT, inject: [RedisService, ENV], useFactory: (r: RedisService, e: Env) => new MockPaymentGateway(r, e) },
  { provide: EKYC, inject: [RedisService, ENV], useFactory: (r: RedisService, e: Env) => new MockAadhaarEkyc(r, e) },
  { provide: DIGILOCKER, inject: [ENV], useFactory: (e: Env) => new MockDigiLocker(e) },
  { provide: APAAR, useFactory: () => new MockApaar() },
  PrismaService, RedisService, RateLimitService, AuditService, SettingsService, QueueService, CaptchaService,
  TokensService, CandidateGuard, AdminGuard, NotifyService, OtpService,
];

@Global()
@Module({ providers, exports: providers.map((p) => ('provide' in p ? p.provide : p)) })
export class CoreModule {}
