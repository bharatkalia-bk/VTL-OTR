import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import { ENV, type Env } from '../config/env';
import { logger } from './logger';

export const QUEUES = ['notify', 'pdf', 'reports', 'campaigns', 'payments', 'admit-cards', 'maintenance'] as const;
export type QueueName = (typeof QUEUES)[number];
export type JobHandler = (data: Record<string, unknown>) => Promise<unknown>;

/**
 * BullMQ wrapper. Handlers are registered by feature modules; the worker process consumes them.
 * QUEUE_INLINE=true runs handlers synchronously (tests and single-process dev).
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();
  private readonly handlers = new Map<string, JobHandler>();
  private readonly workers: Worker[] = [];
  private readonly connection: { url: string };

  constructor(@Inject(ENV) private readonly env: Env) {
    this.connection = { url: env.REDIS_URL };
  }

  register(queue: QueueName, name: string, handler: JobHandler): void {
    this.handlers.set(`${queue}:${name}`, handler);
  }

  private queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: { url: this.connection.url } as never, prefix: `${this.env.REDIS_PREFIX}-bull` });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(queue: QueueName, name: string, data: Record<string, unknown>, opts: JobsOptions = {}): Promise<unknown> {
    if (this.env.QUEUE_INLINE) {
      const h = this.handlers.get(`${queue}:${name}`);
      if (!h) throw new Error(`No handler for ${queue}:${name}`);
      return h(data);
    }
    await this.queue(queue).add(name, data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 24 * 3600, count: 10000 },
      removeOnFail: { age: 7 * 24 * 3600 },
      ...opts,
    });
    return undefined;
  }

  async addRepeatable(queue: QueueName, name: string, everyMs: number): Promise<void> {
    if (this.env.QUEUE_INLINE) return;
    await this.queue(queue).upsertJobScheduler(`${queue}:${name}`, { every: everyMs }, { name, data: {} });
  }

  /** Start consumers for all queues (worker process, or API with RUN_WORKER_IN_API). */
  startWorkers(concurrency = 4): void {
    for (const q of QUEUES) {
      const w = new Worker(q, async (job) => {
        const h = this.handlers.get(`${q}:${job.name}`);
        if (!h) throw new Error(`No handler for ${q}:${job.name}`);
        return h(job.data as Record<string, unknown>);
      }, { connection: { url: this.connection.url } as never, prefix: `${this.env.REDIS_PREFIX}-bull`, concurrency: q === 'pdf' ? 2 : concurrency });
      w.on('failed', (job, err) => logger.warn({ queue: q, job: job?.name, attempts: job?.attemptsMade, err: err.message }, 'job failed'));
      this.workers.push(w);
    }
    logger.info({ queues: QUEUES }, 'workers started');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
