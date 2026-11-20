import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { logger } from '../infra/logger';
import { ctx } from '../infra/request-context';

export class AppError extends HttpException {
  constructor(code: string, message: string, status = HttpStatus.BAD_REQUEST, extra: Record<string, unknown> = {}) {
    super({ code, message, ...extra }, status);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = ctx()?.requestId;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload = typeof body === 'string' ? { code: 'ERROR', message: body } : (body as Record<string, unknown>);
      if (!('code' in payload)) payload.code = status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHENTICATED' : 'ERROR';
      res.status(status).json({ ...payload, requestId });
      return;
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { res.status(409).json({ code: 'CONFLICT', message: 'Record already exists.', requestId }); return; }
      if (exception.code === 'P2025') { res.status(404).json({ code: 'NOT_FOUND', message: 'Not found.', requestId }); return; }
    }
    logger.error({ err: exception instanceof Error ? { message: exception.message, stack: exception.stack } : String(exception), requestId }, 'unhandled error');
    res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong. Please try again.', requestId });
  }
}
