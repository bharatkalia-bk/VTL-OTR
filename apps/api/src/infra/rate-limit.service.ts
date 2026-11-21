import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Fixed-window counter. Throws 429 with Retry-After when exceeded. */
  async hit(bucket: string, id: string, limit: number, windowSeconds: number): Promise<void> {
    const key = this.redis.key('rl', bucket, id);
    const n = await this.redis.client.incr(key);
    if (n === 1) await this.redis.client.expire(key, windowSeconds);
    if (n > limit) {
      const ttl = await this.redis.client.ttl(key);
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.', retryAfter: ttl }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
  async reset(bucket: string, id: string): Promise<void> {
    await this.redis.client.del(this.redis.key('rl', bucket, id));
  }
}
