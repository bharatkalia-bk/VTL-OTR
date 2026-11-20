import type { NextFunction, Request, Response } from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';
import type { Env } from '../config/env';
import { requestContext } from '../infra/request-context';
import { COOKIES } from './tokens.service';

/** Strict CSP. 'wasm-unsafe-eval' is needed for MediaPipe; no inline scripts anywhere. */
export function securityHeaders(env: Env) {
  const s3 = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', ...(s3 ? [s3] : [])],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  });
}

export function permissionsPolicy(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(self)');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  requestContext.run({ requestId, ip: req.ip, userAgent: req.get('user-agent'), actorType: 'PUBLIC' }, () => next());
}

/** Paths that receive cross-site POSTs by design (gateway callbacks) and are verified by signature instead. */
const CSRF_EXEMPT = [/^\/api\/v1\/payments\/callback\//, /^\/api\/v1\/mock-gateway\//, /^\/api\/v1\/mock-digilocker\//];

/** Double-submit CSRF: mutating requests must echo the vtl_csrf cookie in X-CSRF-Token. */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || CSRF_EXEMPT.some((r) => r.test(req.path))) return next();
  const cookie = req.cookies?.[COOKIES.CSRF] as string | undefined;
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    res.status(403).json({ code: 'CSRF', message: 'Security token missing or invalid. Refresh the page and try again.' });
    return;
  }
  next();
}
