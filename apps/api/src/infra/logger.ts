import pino from 'pino';

/** Structured JSON logs with PII redaction. Never log request bodies. */
export const REDACT_PATHS = [
  'req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]',
  '*.mobile', '*.email', '*.password', '*.otp', '*.dob', '*.fullName', '*.fatherName', '*.motherName', '*.aadhaar',
  '*.address', '*.token', '*.refreshToken', '*.accessToken', '*.secret',
];
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'vtl-otr-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
