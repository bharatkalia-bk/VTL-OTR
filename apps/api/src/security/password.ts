import { hash, verify } from '@node-rs/argon2';

// Algorithm.Argon2id = 2 (const enum not usable with isolated builds)
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(p: string): Promise<string> {
  return hash(p, OPTS);
}
export async function verifyPassword(hashStr: string, p: string): Promise<boolean> {
  try {
    return await verify(hashStr, p);
  } catch {
    return false;
  }
}
/** Constant-ish time dummy verification to avoid user enumeration via timing. */
let dummy: string | null = null;
export async function dummyVerify(p: string): Promise<void> {
  dummy ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(dummy, p);
}
