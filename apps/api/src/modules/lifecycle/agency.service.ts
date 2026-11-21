import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { agencyKeySchema, agencyRecordSchemas, agencyUploadSchema, type AgencyScope } from '@vtl/shared';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import type { AccessClaims } from '../../security/tokens.service';
import { assertExam, csvToResponseRecords, notFound, parseCsv, scopeOf } from './common';
import { ExamDayService } from './examday.service';

export interface AgencyPrincipal { keyId: string; ownerId: string; examId: string | null; scopes: string[] }

/**
 * Data gateway for conducting agencies (CBT vendors, OMR scanning partners, biometric vendors).
 * Same ingestion path for the API (X-Agency-Key) and the console upload, with idempotent submissions:
 * re-sending the same file returns the earlier result instead of importing twice.
 */
@Injectable()
export class AgencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly examDay: ExamDayService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private hash(secret: string): string {
    return createHmac('sha256', this.env.AGENCY_KEY_PEPPER ?? this.env.JWT_ACCESS_SECRET).update(secret).digest('hex');
  }

  async createKey(u: AccessClaims, body: unknown) {
    const x = parseOrThrow(agencyKeySchema, body);
    if (x.examId) assertExam(await scopeOf(this.prisma, u), x.examId);
    const prefix = randomBytes(5).toString('hex');
    const secret = randomBytes(24).toString('base64url');
    const plain = `vtl_ak_${prefix}_${secret}`;
    const k = await this.prisma.agencyKey.create({ data: { name: x.name, ownerId: u.sub, examId: x.examId, prefix, keyHash: this.hash(plain), scopes: x.scopes } });
    await this.audit.log({ action: 'AGENCY_KEY_CREATED', entity: 'AgencyKey', entityId: k.id, actorType: 'ADMIN', actorId: u.sub, after: { name: x.name, prefix, scopes: x.scopes } });
    return { id: k.id, name: k.name, prefix, scopes: k.scopes, key: plain, note: 'Copy this key now. It is shown only once.' };
  }

  async listKeys(u: AccessClaims) {
    const scope = await scopeOf(this.prisma, u);
    return this.prisma.agencyKey.findMany({ where: scope.all ? {} : { ownerId: u.sub }, select: { id: true, name: true, prefix: true, examId: true, scopes: true, revokedAt: true, lastUsedAt: true, createdAt: true, ownerId: true }, orderBy: { createdAt: 'desc' } });
  }

  async revokeKey(u: AccessClaims, id: string) {
    const scope = await scopeOf(this.prisma, u);
    const k = await this.prisma.agencyKey.findFirst({ where: { id, ...(scope.all ? {} : { ownerId: u.sub }) } });
    if (!k) notFound('Key');
    await this.prisma.agencyKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.log({ action: 'AGENCY_KEY_REVOKED', entity: 'AgencyKey', entityId: id, actorType: 'ADMIN', actorId: u.sub });
    return { ok: true };
  }

  async authenticate(header: string | undefined): Promise<AgencyPrincipal> {
    const m = /^vtl_ak_([0-9a-f]{10})_[A-Za-z0-9_-]{20,}$/.exec(header ?? '');
    const fail = () => { throw new UnauthorizedException({ code: 'INVALID_AGENCY_KEY', message: 'Missing, invalid or revoked agency key.' }); };
    if (!m) return fail();
    const k = await this.prisma.agencyKey.findUnique({ where: { prefix: m[1] } });
    if (!k || k.revokedAt) return fail();
    const a = Buffer.from(this.hash(header!), 'hex'), b = Buffer.from(k.keyHash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return fail();
    await this.prisma.agencyKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
    return { keyId: k.id, ownerId: k.ownerId, examId: k.examId, scopes: k.scopes };
  }

  /** Console upload by an AGENCY / EXAM_ADMIN user. */
  async uploadFromConsole(u: AccessClaims, examId: string, body: unknown) {
    assertExam(await scopeOf(this.prisma, u), examId);
    return this.ingest(examId, body, { source: 'UI', userId: u.sub });
  }

  /** API upload with an agency key. */
  async uploadFromApi(p: AgencyPrincipal, examCode: string, body: unknown) {
    const exam = await this.prisma.exam.findUnique({ where: { code: examCode } });
    if (!exam) notFound('Exam');
    if (p.examId && p.examId !== exam.id) throw new AppError('OUT_OF_SCOPE', 'This key is not valid for this exam.', 403);
    const kind = (body as { kind?: string })?.kind;
    if (!kind || !p.scopes.includes(kind)) throw new AppError('SCOPE_MISSING', `This key does not allow ${kind ?? 'this'} uploads.`, 403);
    return this.ingest(exam.id, body, { source: 'API', keyId: p.keyId, userId: p.ownerId });
  }

  private async ingest(examId: string, body: unknown, by: { source: 'UI' | 'API'; keyId?: string; userId?: string }) {
    const x = parseOrThrow(agencyUploadSchema, body);
    const checksum = createHash('sha256').update(`${x.kind}\n${x.csv ?? JSON.stringify(x.records)}`).digest('hex');
    const dup = await this.prisma.agencySubmission.findUnique({ where: { examId_kind_checksum: { examId, kind: x.kind, checksum } } });
    if (dup) return { ...dup, duplicate: true };

    const raw: unknown[] = x.csv ? (x.kind === 'CBT_RESPONSES' || x.kind === 'OMR_READS' ? csvToResponseRecords(parseCsv(x.csv)) : parseCsv(x.csv)) : x.records!;
    if (raw.length === 0) throw new AppError('EMPTY_FILE', 'The file has no data rows.');
    const schema = agencyRecordSchemas[x.kind as AgencyScope];
    const errors: Array<{ row: number; rollNo?: string; error: string }> = [];
    const cards = new Map((await this.prisma.admitCard.findMany({ where: { examId }, select: { id: true, rollNo: true, shiftId: true } })).map((c) => [c.rollNo, c]));
    let accepted = 0;
    for (let i = 0; i < raw.length; i++) {
      const p = schema.safeParse(raw[i]);
      if (!p.success) { errors.push({ row: i + 2, error: p.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ') }); continue; }
      const rec = p.data as { rollNo: string } & Record<string, unknown>;
      const card = cards.get(rec.rollNo);
      if (!card) { errors.push({ row: i + 2, rollNo: rec.rollNo, error: 'Unknown roll number' }); continue; }
      try {
        if (x.kind === 'CBT_RESPONSES' || x.kind === 'OMR_READS') {
          if (!card.shiftId) throw new Error('Candidate has no shift');
          const r = rec as unknown as { responses: Record<string, string | null>; activeMinutes?: number; scanRef?: string };
          const source = x.kind === 'CBT_RESPONSES' ? 'CBT' : 'OMR';
          const data = { shiftId: card.shiftId, source, responses: r.responses, timings: r.activeMinutes !== undefined ? { activeMinutes: r.activeMinutes } : undefined, omrScanKey: r.scanRef } as const;
          await this.prisma.responseSheet.upsert({ where: { admitCardId: card.id }, create: { admitCardId: card.id, ...data, timings: data.timings as Prisma.InputJsonValue | undefined }, update: { ...data, timings: data.timings as Prisma.InputJsonValue | undefined, receivedAt: new Date() } });
          await this.prisma.attendance.upsert({ where: { admitCardId: card.id }, create: { admitCardId: card.id, status: 'PRESENT', method: 'AGENCY' }, update: {} });
        } else if (x.kind === 'ATTENDANCE') {
          const status = (rec as unknown as { status: string }).status;
          await this.prisma.attendance.upsert({ where: { admitCardId: card.id }, create: { admitCardId: card.id, status, method: 'AGENCY' }, update: { status, method: 'AGENCY', markedAt: new Date() } });
        } else {
          await this.examDay.createAlert(examId, rec, 'AGENCY', by.userId);
        }
        accepted++;
      } catch (e) {
        errors.push({ row: i + 2, rollNo: rec.rollNo, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const sub = await this.prisma.agencySubmission.create({ data: { examId, kind: x.kind, source: by.source, keyId: by.keyId, submittedById: by.userId, fileName: x.fileName, checksum, records: raw.length, accepted, rejected: raw.length - accepted, errors: errors.slice(0, 500) } });
    await this.audit.log({ action: 'AGENCY_SUBMISSION', entity: 'AgencySubmission', entityId: sub.id, actorType: by.source === 'API' ? 'AGENCY' : 'ADMIN', actorId: by.userId ?? null, after: { kind: x.kind, records: raw.length, accepted } });
    return { ...sub, duplicate: false };
  }

  async submissions(u: AccessClaims, examId?: string) {
    const scope = await scopeOf(this.prisma, u);
    return this.prisma.agencySubmission.findMany({ where: { ...(examId && { examId }), ...(!scope.all && scope.examIds.length ? { examId: { in: scope.examIds } } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
