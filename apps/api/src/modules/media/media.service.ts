import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { photoMetadataSchema, type PhotoMetadata } from '@vtl/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { SettingsService } from '../../infra/settings.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { isJpeg, isPng, stripJpegMetadata } from './jpeg';

export const attemptSchema = z.object({
  attemptNo: z.number().int().min(1).max(50),
  scores: photoMetadataSchema.shape.scores,
  liveness: photoMetadataSchema.shape.liveness,
  accepted: z.boolean().default(false),
});

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  private unlockKey(cid: string, kind: 'PHOTO' | 'SIGNATURE') { return this.redis.key('media-unlock', cid, kind); }

  /** Photo/signature are locked after OTR submission unless an approved correction unlocked them. */
  async assertEditable(candidateId: string, kind: 'PHOTO' | 'SIGNATURE'): Promise<boolean> {
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, select: { status: true } });
    if (c.status === 'BLOCKED') throw new ForbiddenException({ code: 'BLOCKED', message: 'Your account is blocked. Contact helpdesk.' });
    if (c.status === 'DRAFT') return false;
    if (await this.redis.client.exists(this.unlockKey(candidateId, kind))) return true;
    throw new ForbiddenException({ code: 'LOCKED', message: 'Your photograph and signature are locked after submission. Raise a correction request to change them.' });
  }

  async unlock(candidateId: string, kind: 'PHOTO' | 'SIGNATURE'): Promise<void> {
    await this.redis.client.set(this.unlockKey(candidateId, kind), '1', 'EX', 30 * 24 * 3600);
  }

  async startSession(candidateId: string) {
    await this.assertEditable(candidateId, 'PHOTO');
    const s = await this.settings.get();
    const attemptsUsed = await this.prisma.photoAttempt.count({ where: { candidateId } });
    if (attemptsUsed >= s.photoSpec.maxAttempts && !(await this.redis.client.exists(this.unlockKey(candidateId, 'PHOTO')))) {
      throw new AppError('ATTEMPTS_EXHAUSTED', 'You have used all photo attempts. Please contact helpdesk.', 429);
    }
    const captureSessionId = randomBytes(18).toString('base64url');
    await this.redis.setJson(this.redis.key('capsess', captureSessionId), { candidateId, at: Date.now() }, 15 * 60);
    return { captureSessionId, attemptsUsed, maxAttempts: s.photoSpec.maxAttempts, spec: s.photoSpec, livenessMethods: s.livenessMethods };
  }

  async logAttempt(candidateId: string, body: unknown, userAgent?: string) {
    const a = parseOrThrow(attemptSchema, body);
    const s = await this.settings.get();
    const used = await this.prisma.photoAttempt.count({ where: { candidateId } });
    const unlocked = await this.redis.client.exists(this.unlockKey(candidateId, 'PHOTO'));
    if (used >= s.photoSpec.maxAttempts && !unlocked) throw new AppError('ATTEMPTS_EXHAUSTED', 'You have used all photo attempts.', 429);
    await this.prisma.photoAttempt.create({ data: { candidateId, attemptNo: used + 1, scores: a.scores, liveness: a.liveness, accepted: a.accepted, userAgent: userAgent?.slice(0, 300) } });
    return { attemptsUsed: used + 1, maxAttempts: s.photoSpec.maxAttempts };
  }

  async savePhoto(candidateId: string, file: Express.Multer.File | undefined, metaRaw: unknown) {
    const unlocked = await this.assertEditable(candidateId, 'PHOTO');
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Photo file is required.' });
    let metaObj: unknown;
    try { metaObj = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw; } catch { metaObj = null; }
    const meta: PhotoMetadata = parseOrThrow(photoMetadataSchema, metaObj);
    // Live-capture enforcement: single-use session issued when the camera started.
    const sess = await this.redis.client.getdel(this.redis.key('capsess', meta.captureSessionId));
    const parsed = sess ? (JSON.parse(sess) as { candidateId: string }) : null;
    if (!parsed || parsed.candidateId !== candidateId) throw new AppError('CAPTURE_SESSION_INVALID', 'Photo must be captured live using the camera. Please capture again.');
    if (!meta.liveness.passed) throw new AppError('LIVENESS_FAILED', 'Liveness check was not completed.');
    const s = await this.settings.get();
    const spec = s.photoSpec;
    const clean = await this.validateJpeg(file.buffer, spec.width, spec.height, spec.minBytes, spec.maxBytes);
    const hash = sha256(clean);
    const objectKey = `candidates/${candidateId}/photo/${randomUUID()}.jpg`;
    await this.storage.put(objectKey, clean, 'image/jpeg');

    const dupes = await this.prisma.mediaAsset.findMany({ where: { kind: 'PHOTO', sha256: hash, candidateId: { not: candidateId } }, select: { candidateId: true } });
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { candidateId, kind: 'PHOTO', isCurrent: true }, data: { isCurrent: false } });
      const asset = await tx.mediaAsset.create({
        data: {
          candidateId, kind: 'PHOTO', objectKey, sha256: hash, width: spec.width, height: spec.height, sizeBytes: clean.length, method: 'LIVE',
          capturedAt: new Date(meta.capturedAt), userAgent: meta.userAgent, livenessPassed: true, livenessMethod: meta.liveness.method,
          scores: meta.scores, attemptNo: meta.attemptNo, duplicateFlag: dupes.length > 0,
        },
      });
      const last = await tx.photoAttempt.findFirst({ where: { candidateId }, orderBy: { createdAt: 'desc' } });
      if (last) await tx.photoAttempt.update({ where: { id: last.id }, data: { accepted: true } });
      if (dupes.length) {
        const ids = [...new Set([candidateId, ...dupes.map((d) => d.candidateId)])];
        await tx.duplicateFlag.upsert({ where: { type_key: { type: 'PHOTO_HASH', key: hash } }, create: { type: 'PHOTO_HASH', key: hash, candidateIds: ids }, update: { candidateIds: ids, status: 'OPEN' } });
        await tx.mediaAsset.updateMany({ where: { kind: 'PHOTO', sha256: hash }, data: { duplicateFlag: true } });
      }
      await this.audit.log({ action: unlocked ? 'PHOTO_RECAPTURED_AFTER_CORRECTION' : 'PHOTO_CAPTURED', entity: 'Candidate', entityId: candidateId, after: { sha256: hash, sizeBytes: clean.length, attemptNo: meta.attemptNo, liveness: meta.liveness.method } }, tx);
      return asset;
    });
    if (unlocked) await this.redis.client.del(this.unlockKey(candidateId, 'PHOTO'));
    await this.markMediaStep(candidateId);
    return { id: result.id, sizeBytes: result.sizeBytes, duplicate: dupes.length > 0 };
  }

  async saveSignature(candidateId: string, file: Express.Multer.File | undefined, methodRaw: unknown) {
    const unlocked = await this.assertEditable(candidateId, 'SIGNATURE');
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Signature file is required.' });
    const method = methodRaw === 'UPLOADED' ? 'UPLOADED' : 'DRAWN';
    const spec = (await this.settings.get()).signatureSpec;
    const clean = await this.validateJpeg(file.buffer, spec.width, spec.height, spec.minBytes, spec.maxBytes);
    const hash = sha256(clean);
    const objectKey = `candidates/${candidateId}/signature/${randomUUID()}.jpg`;
    await this.storage.put(objectKey, clean, 'image/jpeg');
    const asset = await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { candidateId, kind: 'SIGNATURE', isCurrent: true }, data: { isCurrent: false } });
      const a = await tx.mediaAsset.create({ data: { candidateId, kind: 'SIGNATURE', objectKey, sha256: hash, width: spec.width, height: spec.height, sizeBytes: clean.length, method } });
      await this.audit.log({ action: 'SIGNATURE_SAVED', entity: 'Candidate', entityId: candidateId, after: { sha256: hash, method } }, tx);
      return a;
    });
    if (unlocked) await this.redis.client.del(this.unlockKey(candidateId, 'SIGNATURE'));
    await this.markMediaStep(candidateId);
    return { id: asset.id, sizeBytes: asset.sizeBytes };
  }

  /**
   * Left-thumb impression and handwritten declaration: scanned uploads are allowed (unlike the photo).
   * JPEG only, metadata stripped, sensible dimension and size ranges.
   */
  async saveAuxiliary(candidateId: string, kind: 'THUMB' | 'DECLARATION', file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Choose a JPEG file.' });
    const profile = await this.prisma.candidateProfile.findUnique({ where: { candidateId }, select: { candidateId: true } });
    const cand = await this.prisma.candidate.findUniqueOrThrow({ where: { id: candidateId } });
    if (!profile || cand.status !== 'DRAFT') {
      const has = await this.prisma.mediaAsset.count({ where: { candidateId, kind, isCurrent: true } });
      if (has) throw new AppError('LOCKED', 'Your OTR is submitted. Request a correction to replace this image.', 409);
    }
    const spec = kind === 'THUMB' ? { min: [200, 200], max: [800, 800], minB: 10 * 1024, maxB: 100 * 1024 } : { min: [600, 300], max: [2400, 1600], minB: 50 * 1024, maxB: 300 * 1024 };
    const buf = file.buffer;
    if (isPng(buf) || !isJpeg(buf)) throw new AppError('INVALID_IMAGE_TYPE', 'Only JPEG images are accepted.');
    let clean: Buffer;
    let meta: sharp.Metadata;
    try { clean = stripJpegMetadata(buf); meta = await sharp(clean).metadata(); await sharp(clean).raw().toBuffer(); } catch { throw new AppError('INVALID_IMAGE', 'The image file is corrupt.'); }
    const [w, h] = [meta.width ?? 0, meta.height ?? 0];
    if (w < spec.min[0]! || h < spec.min[1]! || w > spec.max[0]! || h > spec.max[1]!) throw new AppError('INVALID_DIMENSIONS', `Image must be between ${spec.min.join('x')} and ${spec.max.join('x')} pixels.`, 400, { got: { width: w, height: h } });
    if (clean.length < spec.minB || clean.length > spec.maxB) throw new AppError('INVALID_SIZE', `Image size must be between ${spec.minB / 1024} KB and ${spec.maxB / 1024} KB.`, 400, { sizeBytes: clean.length });
    const hash = sha256(clean);
    const objectKey = `candidates/${candidateId}/${kind.toLowerCase()}/${randomUUID()}.jpg`;
    await this.storage.put(objectKey, clean, 'image/jpeg');
    const asset = await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.updateMany({ where: { candidateId, kind, isCurrent: true }, data: { isCurrent: false } });
      const a = await tx.mediaAsset.create({ data: { candidateId, kind, objectKey, sha256: hash, width: w, height: h, sizeBytes: clean.length, method: 'UPLOADED' } });
      await this.audit.log({ action: `${kind}_SAVED`, entity: 'Candidate', entityId: candidateId, after: { sha256: hash, sizeBytes: clean.length } }, tx);
      return a;
    });
    return { id: asset.id, sizeBytes: asset.sizeBytes };
  }

  /** Real JPEG check, exact dimensions, metadata stripped, size range checked on the stored bytes. */
  async validateJpeg(buf: Buffer, width: number, height: number, minBytes: number, maxBytes: number): Promise<Buffer> {
    if (isPng(buf) || !isJpeg(buf)) throw new AppError('INVALID_IMAGE_TYPE', 'Only JPEG images are accepted.');
    let clean: Buffer;
    try { clean = stripJpegMetadata(buf); } catch { throw new AppError('INVALID_IMAGE', 'The image file is corrupt.'); }
    let meta: sharp.Metadata;
    try {
      meta = await sharp(clean).metadata();
      await sharp(clean).raw().toBuffer({ resolveWithObject: false }); // full decode
    } catch {
      throw new AppError('INVALID_IMAGE', 'The image file is corrupt.');
    }
    if (meta.format !== 'jpeg') throw new AppError('INVALID_IMAGE_TYPE', 'Only JPEG images are accepted.');
    if (meta.width !== width || meta.height !== height) throw new AppError('INVALID_DIMENSIONS', `Image must be exactly ${width}x${height} pixels.`, 400, { expected: { width, height }, got: { width: meta.width, height: meta.height } });
    if (clean.length < minBytes || clean.length > maxBytes) throw new AppError('INVALID_SIZE', `Image size must be between ${Math.round(minBytes / 1024)} KB and ${Math.round(maxBytes / 1024)} KB.`, 400, { sizeBytes: clean.length });
    return clean;
  }

  private async markMediaStep(candidateId: string) {
    const [photo, sig] = await Promise.all([
      this.prisma.mediaAsset.count({ where: { candidateId, kind: 'PHOTO', isCurrent: true } }),
      this.prisma.mediaAsset.count({ where: { candidateId, kind: 'SIGNATURE', isCurrent: true } }),
    ]);
    if (photo && sig) {
      const p = await this.prisma.candidateProfile.findUnique({ where: { candidateId }, select: { completedSteps: true } });
      if (p && !p.completedSteps.includes('photo')) await this.prisma.candidateProfile.update({ where: { candidateId }, data: { completedSteps: { push: 'photo' } } });
    }
  }

  read(objectKey: string): Promise<Buffer> {
    return this.storage.get(objectKey);
  }

  async signedUrl(objectKey: string): Promise<string> {
    return this.storage.signedUrl(objectKey, 600);
  }
}
