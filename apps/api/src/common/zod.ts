import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';

export function parseOrThrow<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid.',
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return r.data;
}

/** @ZBody(schema) validates the JSON body with a shared Zod schema. */
export const ZBody = createParamDecorator((schema: ZodTypeAny, c: ExecutionContext) => parseOrThrow(schema, c.switchToHttp().getRequest<Request>().body));
export const ZQuery = createParamDecorator((schema: ZodTypeAny, c: ExecutionContext) => parseOrThrow(schema, c.switchToHttp().getRequest<Request>().query));
