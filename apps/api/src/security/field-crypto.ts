import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for PII at rest (AES-256-GCM) and HMAC-SHA256 blind indexes
 * for exact-match lookups. Key material comes from a KeyProvider (env in dev; KMS/HSM in prod).
 * Ciphertext format: v1.<iv b64>.<tag b64>.<ct b64>
 */
export class FieldCrypto {
  private readonly encKey: Buffer;
  private readonly idxKey: Buffer;

  constructor(encKeyB64: string, idxKeyB64: string) {
    this.encKey = Buffer.from(encKeyB64, 'base64');
    this.idxKey = Buffer.from(idxKeyB64, 'base64');
    if (this.encKey.length !== 32 || this.idxKey.length !== 32) throw new Error('PII keys must be 32 bytes (base64)');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
  }

  decrypt(token: string): string {
    const [v, iv, tag, ct] = token.split('.');
    if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unsupported ciphertext');
    const d = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  }

  encOpt(v: string | null | undefined): string | null {
    return v === null || v === undefined || v === '' ? null : this.encrypt(v);
  }
  decOpt(v: string | null | undefined): string | null {
    return v ? this.decrypt(v) : null;
  }
  encJson(v: unknown): string {
    return this.encrypt(JSON.stringify(v));
  }
  decJson<T>(v: string | null | undefined): T | null {
    return v ? (JSON.parse(this.decrypt(v)) as T) : null;
  }

  /** Deterministic blind index. `purpose` domain-separates indexes (mobile vs email). */
  blindIndex(purpose: string, value: string): string {
    return createHmac('sha256', this.idxKey).update(`${purpose}:${value.trim().toLowerCase()}`).digest('base64url');
  }
}
