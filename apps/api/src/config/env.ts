import { z } from 'zod';

const bool = z.preprocess((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v), z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  CANDIDATE_WEB_URL: z.string().url().default('http://localhost:5173'),
  ADMIN_WEB_URL: z.string().url().default('http://localhost:5174'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PREFIX: z.string().default('vtl'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TTL_SECONDS: z.coerce.number().default(900),
  CANDIDATE_REFRESH_TTL_SECONDS: z.coerce.number().default(7 * 24 * 3600),
  ADMIN_REFRESH_TTL_SECONDS: z.coerce.number().default(8 * 3600),
  COOKIE_SECURE: bool.default(false),
  COOKIE_DOMAIN: z.string().optional(),

  /** base64 32-byte keys */
  PII_ENC_KEY: z.string().min(40),
  PII_INDEX_KEY: z.string().min(40),
  FILE_URL_SECRET: z.string().min(32),
  /** Ed25519 keys (PEM, \n-escaped) for admit-card QR signing; generated on boot in dev if absent */
  QR_SIGNING_PRIVATE_KEY: z.string().optional(),
  QR_SIGNING_PUBLIC_KEY: z.string().optional(),

  STORAGE_DRIVER: z.enum(['s3', 'fs']).default('fs'),
  STORAGE_FS_ROOT: z.string().default('./.storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string().default('vtl-otr'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),

  SMS_DRIVER: z.enum(['mock', 'http']).default('mock'),
  /** Generic HTTP SMS gateway (MSG91 / Gupshup / NIC style). Placeholders: {to} {text} {dlt} (URL-encoded). */
  SMS_HTTP_URL: z.string().optional(),
  SMS_HTTP_METHOD: z.enum(['GET', 'POST']).default('GET'),
  SMS_HTTP_BODY: z.string().optional(),
  SMS_HTTP_SUCCESS_REGEX: z.string().optional(),
  EMAIL_DRIVER: z.enum(['smtp', 'mock']).default('mock'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('VTL OTR <no-reply@vtl-otr.local>'),
  PAYMENT_DRIVER: z.enum(['mock']).default('mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('mock-gateway-webhook-secret'),
  EKYC_DRIVER: z.enum(['mock']).default('mock'),
  DIGILOCKER_DRIVER: z.enum(['mock']).default('mock'),
  APAAR_DRIVER: z.enum(['mock']).default('mock'),
  CAPTCHA_DRIVER: z.enum(['svg', 'disabled']).default('svg'),

  /** Expose OTPs/captcha answers via /dev endpoints (never in production). */
  DEV_EXPOSE_SECRETS: bool.default(false),
  /** Public demo server: mock SMS/email, demo inbox and seeded test data, with a visible banner. Never for real candidates. */
  DEMO_MODE: bool.default(false),
  QUEUE_INLINE: bool.default(false),
  RUN_WORKER_IN_API: bool.default(false),
  SWAGGER_ENABLED: bool.default(true),
  CHROMIUM_PATH: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DEV_EXPOSE_SECRETS && !parsed.data.DEMO_MODE) {
    throw new Error('DEV_EXPOSE_SECRETS must be false in production (allowed only with DEMO_MODE=true on a demo server)');
  }
  if (parsed.data.SMS_DRIVER === 'http' && !parsed.data.SMS_HTTP_URL) throw new Error('SMS_HTTP_URL is required when SMS_DRIVER=http');
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
export function resetEnvCache(): void {
  cached = null;
}

export const ENV = Symbol('ENV');
