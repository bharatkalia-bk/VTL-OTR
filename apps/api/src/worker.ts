import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './infra/logger';
import { QueueService } from './infra/queue.service';
import { MaintenanceService } from './modules/maintenance/maintenance.service';

/** Background worker: SMS/email, PDFs, reports, campaigns, payment reconciliation, retention. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  app.enableShutdownHooks();
  app.get(QueueService).startWorkers(Number(process.env.WORKER_CONCURRENCY ?? 8));
  await app.get(MaintenanceService).schedule();
  logger.info('VTL OTR worker started');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
