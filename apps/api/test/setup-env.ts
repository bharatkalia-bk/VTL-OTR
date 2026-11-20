// Test environment: isolated DB, inline queues, exposed dev secrets for OTP/captcha.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://vtl:vtl@localhost:5432/vtl_otr_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/3';
process.env.REDIS_PREFIX = 'vtltest';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-0001';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-01';
process.env.PII_ENC_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PII_INDEX_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.FILE_URL_SECRET = 'test-file-url-secret-test-file-url-secret';
process.env.STORAGE_DRIVER = 'fs';
process.env.STORAGE_FS_ROOT = '/tmp/vtl-otr-test-storage';
process.env.DEV_EXPOSE_SECRETS = 'true';
process.env.QUEUE_INLINE = 'true';
process.env.SWAGGER_ENABLED = 'false';
process.env.LOG_LEVEL = 'error';
process.env.EMAIL_DRIVER = 'mock';
