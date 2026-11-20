import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestCtx {
  requestId: string;
  ip?: string;
  userAgent?: string;
  actorType?: 'CANDIDATE' | 'ADMIN' | 'SYSTEM' | 'PUBLIC';
  actorId?: string;
}
export const requestContext = new AsyncLocalStorage<RequestCtx>();
export function ctx(): RequestCtx | undefined {
  return requestContext.getStore();
}
