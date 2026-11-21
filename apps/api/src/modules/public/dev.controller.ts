import { Controller, ForbiddenException, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ENV, type Env } from '../../config/env';
import { RedisService } from '../../infra/redis.service';

/** Local/E2E helpers. Only active with DEV_EXPOSE_SECRETS=true (refused in production by config validation). */
@ApiExcludeController()
@Controller('dev')
export class DevController {
  constructor(private readonly redis: RedisService, @Inject(ENV) private readonly env: Env) {}

  private guard() {
    if (!this.env.DEV_EXPOSE_SECRETS || (this.env.NODE_ENV === 'production' && !this.env.DEMO_MODE)) throw new ForbiddenException();
  }

  @Get('otp')
  async otp(@Query('target') target: string) {
    this.guard();
    return { otp: await this.redis.client.get(this.redis.key('dev', 'otp', (target ?? '').toLowerCase())) };
  }

  @Get('captcha/:id')
  async captcha(@Param('id') id: string) {
    this.guard();
    return { text: await this.redis.client.get(this.redis.key('dev', 'captcha', id)) };
  }

  @Get('ekyc/:txn')
  async ekyc(@Param('txn') txn: string) {
    this.guard();
    return { otp: await this.redis.client.get(this.redis.key('dev', 'ekyc', txn)) };
  }

  @Get('messages')
  async messages(@Query('mobile') mobile?: string, @Query('email') email?: string) {
    this.guard();
    const read = async (k: string) => (await this.redis.client.lrange(k, 0, 19)).map((x) => JSON.parse(x) as unknown);
    return {
      sms: mobile ? await read(this.redis.key('dev', 'sms', mobile)) : [],
      email: email ? await read(this.redis.key('dev', 'email', email.toLowerCase())) : [],
    };
  }
}
