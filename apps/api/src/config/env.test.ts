import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://x:y@localhost:5432/db', REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
  PII_ENC_KEY: Buffer.alloc(32, 1).toString('base64'), PII_INDEX_KEY: Buffer.alloc(32, 2).toString('base64'), FILE_URL_SECRET: 'c'.repeat(40),
};

describe('DEMO_FIXED_OTP', () => {
  it('is accepted on development and demo servers', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'development', DEMO_FIXED_OTP: '123456' }).DEMO_FIXED_OTP).toBe('123456');
    expect(loadEnv({ ...base, NODE_ENV: 'production', DEMO_MODE: 'true', COOKIE_SECURE: 'true', DEMO_FIXED_OTP: '123456' }).DEMO_FIXED_OTP).toBe('123456');
  });
  it('is refused on a production server that is not in demo mode', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true', DEMO_FIXED_OTP: '123456' })).toThrow(/DEMO_FIXED_OTP/);
  });
  it('treats an empty value as unset and rejects malformed codes', () => {
    expect(loadEnv({ ...base, DEMO_FIXED_OTP: '' }).DEMO_FIXED_OTP).toBeUndefined();
    expect(() => loadEnv({ ...base, DEMO_FIXED_OTP: '12ab' })).toThrow();
  });
});
