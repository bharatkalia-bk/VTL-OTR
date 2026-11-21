import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env';

export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Short-lived signed URL; never public. */
  signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string>;
  ensureReady(): Promise<void>;
}

/** S3 / MinIO, private bucket, pre-signed GET URLs. */
export class S3Storage implements StorageAdapter {
  private readonly s3: S3Client;
  private readonly signer: S3Client;
  constructor(private readonly env: Env) {
    const cfg = {
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY ?? '', secretAccessKey: env.S3_SECRET_KEY ?? '' },
    };
    this.s3 = new S3Client(cfg);
    this.signer = new S3Client({ ...cfg, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
  }
  async ensureReady(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.env.S3_BUCKET }));
    }
  }
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: undefined }));
  }
  async get(key: string): Promise<Buffer> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }
  signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
    return getSignedUrl(this.signer, new GetObjectCommand({
      Bucket: this.env.S3_BUCKET, Key: key,
      ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
    }), { expiresIn: ttlSeconds });
  }
}

/** Local filesystem with HMAC-signed URLs served by the API (/api/v1/files). For dev/test without MinIO. */
export class FsStorage implements StorageAdapter {
  private readonly root: string;
  constructor(private readonly env: Env) {
    this.root = path.resolve(env.STORAGE_FS_ROOT);
  }
  private p(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid key');
    return full;
  }
  async ensureReady(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }
  async put(key: string, body: Buffer): Promise<void> {
    const f = this.p(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  get(key: string): Promise<Buffer> {
    return readFile(this.p(key));
  }
  async delete(key: string): Promise<void> {
    await rm(this.p(key), { force: true });
  }
  async signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = FsStorage.sign(this.env.FILE_URL_SECRET, key, exp, downloadName);
    const q = new URLSearchParams({ key, exp: String(exp), sig });
    if (downloadName) q.set('dl', downloadName);
    return `/api/v1/files?${q.toString()}`;
  }
  static sign(secret: string, key: string, exp: number, dl?: string): string {
    return createHmac('sha256', secret).update(`${key}|${exp}|${dl ?? ''}`).digest('base64url');
  }
  static verify(secret: string, key: string, exp: number, sig: string, dl?: string): boolean {
    if (exp < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(FsStorage.sign(secret, key, exp, dl));
    const got = Buffer.from(sig);
    return expected.length === got.length && timingSafeEqual(expected, got);
  }
}

export const STORAGE = Symbol('STORAGE');
export function createStorage(env: Env): StorageAdapter {
  return env.STORAGE_DRIVER === 's3' ? new S3Storage(env) : new FsStorage(env);
}
