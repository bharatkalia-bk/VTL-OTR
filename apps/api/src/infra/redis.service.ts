import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV, type Env } from '../config/env';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  readonly prefix: string;
  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
    this.prefix = env.REDIS_PREFIX;
  }
  key(...parts: string[]): string {
    return [this.prefix, ...parts].join(':');
  }
  async getJson<T>(key: string): Promise<T | null> {
    const v = await this.client.get(key);
    return v ? (JSON.parse(v) as T) : null;
  }
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }
  /** Cache-aside helper. */
  async cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.getJson<T>(key);
    if (hit !== null) return hit;
    const v = await load();
    await this.setJson(key, v, ttlSeconds);
    return v;
  }
  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
