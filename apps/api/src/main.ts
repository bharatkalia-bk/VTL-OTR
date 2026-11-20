import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pinoHttp from 'pino-http';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors';
import { loadEnv } from './config/env';
import { logger } from './infra/logger';
import { QueueService } from './infra/queue.service';
import { MaintenanceService } from './modules/maintenance/maintenance.service';
import { csrfMiddleware, permissionsPolicy, requestContextMiddleware, securityHeaders } from './security/http-security';

export async function createApp(): Promise<NestExpressApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'], bodyParser: true });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '64kb' });
  app.use(requestContextMiddleware);
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false }, customProps: (req) => ({ requestId: (req as unknown as { id?: string }).id }), serializers: { req: (r: { method: string; url: string }) => ({ method: r.method, url: r.url.split('?')[0] }) } }));
  app.use(securityHeaders(env));
  app.use(permissionsPolicy);
  app.use(cookieParser());
  app.use(csrfMiddleware);
  app.enableCors({ origin: env.CORS_ORIGINS.split(','), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  if (env.SWAGGER_ENABLED) {
    const cfg = new DocumentBuilder()
      .setTitle('VTL OTR API')
      .setDescription('VTL One Time Registration Platform. A product of Vensysco Technologies Limited.\n\nAuth: httpOnly cookies. Mutating requests require the `X-CSRF-Token` header matching the `vtl_csrf` cookie (GET /api/v1/auth/csrf).')
      .setVersion('1.0.0')
      .addCookieAuth('vtl_at')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, cfg), { jsonDocumentUrl: 'api/docs/openapi.json' });
  }
  return app;
}

async function bootstrap() {
  const env = loadEnv();
  const app = await createApp();
  if (env.RUN_WORKER_IN_API) {
    app.get(QueueService).startWorkers();
    await app.get(MaintenanceService).schedule();
  }
  await app.listen(env.PORT, '0.0.0.0');
  logger.info({ port: env.PORT }, 'VTL OTR API listening');
}

if (require.main === module) {
  bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
