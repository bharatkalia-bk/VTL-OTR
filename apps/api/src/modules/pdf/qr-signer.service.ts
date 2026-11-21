import { Inject, Injectable } from '@nestjs/common';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../infra/prisma.service';
import { FieldCrypto } from '../../security/field-crypto';

export interface AdmitQrPayload {
  v: 1;
  e: string; // exam code
  r: string; // roll no
  o: string; // OTR ID
  a: string; // application no
  p: string; // first 16 hex of photo sha256
  t: number; // issued at (unix)
}

/** Ed25519-signed compact token for admit-card QR codes: base64url(payload).base64url(signature). */
@Injectable()
export class QrSignerService {
  private keys: { priv: KeyObject; pub: KeyObject } | null = null;
  constructor(@Inject(ENV) private readonly env: Env, private readonly prisma: PrismaService, private readonly crypto: FieldCrypto) {}

  private async load() {
    if (this.keys) return this.keys;
    if (this.env.QR_SIGNING_PRIVATE_KEY && this.env.QR_SIGNING_PUBLIC_KEY) {
      this.keys = { priv: createPrivateKey(this.env.QR_SIGNING_PRIVATE_KEY.replace(/\\n/g, '\n')), pub: createPublicKey(this.env.QR_SIGNING_PUBLIC_KEY.replace(/\\n/g, '\n')) };
      return this.keys;
    }
    // Dev: persist a generated keypair (private key encrypted) so QR codes stay verifiable across restarts.
    const row = await this.prisma.systemSetting.findUnique({ where: { key: 'qrKeys' } });
    if (row) {
      const v = row.value as { privEnc: string; pub: string };
      this.keys = { priv: createPrivateKey(this.crypto.decrypt(v.privEnc)), pub: createPublicKey(v.pub) };
      return this.keys;
    }
    const kp = generateKeyPairSync('ed25519');
    const privPem = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const pubPem = kp.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await this.prisma.systemSetting.upsert({ where: { key: 'qrKeys' }, create: { key: 'qrKeys', value: { privEnc: this.crypto.encrypt(privPem), pub: pubPem } }, update: {} });
    const again = await this.prisma.systemSetting.findUniqueOrThrow({ where: { key: 'qrKeys' } });
    const v = again.value as { privEnc: string; pub: string };
    this.keys = { priv: createPrivateKey(this.crypto.decrypt(v.privEnc)), pub: createPublicKey(v.pub) };
    return this.keys;
  }

  async sign(payload: Omit<AdmitQrPayload, 'v' | 't'>): Promise<string> {
    const k = await this.load();
    const body = Buffer.from(JSON.stringify({ v: 1, ...payload, t: Math.floor(Date.now() / 1000) })).toString('base64url');
    const sig = sign(null, Buffer.from(body), k.priv).toString('base64url');
    return `${body}.${sig}`;
  }

  async verify(token: string): Promise<AdmitQrPayload | null> {
    const parts = token.split('.');
    const [body, sig] = parts;
    if (parts.length !== 2 || !body || !sig) return null;
    // Reject non-canonical base64url (e.g. altered padding bits) so one signature has exactly one valid encoding.
    const sigBytes = Buffer.from(sig, 'base64url');
    if (sigBytes.length !== 64 || sigBytes.toString('base64url') !== sig) return null;
    if (Buffer.from(body, 'base64url').toString('base64url') !== body) return null;
    const k = await this.load();
    try {
      if (!verify(null, Buffer.from(body), k.pub, sigBytes)) return null;
      return JSON.parse(Buffer.from(body, 'base64url').toString()) as AdmitQrPayload;
    } catch {
      return null;
    }
  }

  async publicKeyPem(): Promise<string> {
    return (await this.load()).pub.export({ type: 'spki', format: 'pem' }).toString();
  }
}
