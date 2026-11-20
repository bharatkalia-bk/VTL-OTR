import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DOCUMENT_KINDS, type DocumentKind } from '@vtl/shared';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { SettingsService } from '../../infra/settings.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { isJpeg, isPdf, isPng } from '../media/jpeg';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async upload(candidateId: string | null, kindRaw: unknown, file: Express.Multer.File | undefined, source: 'UPLOAD' | 'DIGILOCKER' = 'UPLOAD') {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Please choose a file.' });
    const kind = String(kindRaw) as DocumentKind;
    if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw new AppError('INVALID_KIND', 'Unknown document type.');
    const s = await this.settings.get();
    const buf = file.buffer;
    const imagesAllowed = kind === 'HELPDESK_ATTACHMENT';
    let mime: string;
    if (isPdf(buf)) mime = 'application/pdf';
    else if (imagesAllowed && isJpeg(buf)) mime = 'image/jpeg';
    else if (imagesAllowed && isPng(buf)) mime = 'image/png';
    else throw new AppError('INVALID_FILE_TYPE', imagesAllowed ? 'Only PDF, JPEG or PNG files are allowed.' : 'Only PDF files are allowed.');
    if (buf.length > s.documentMaxBytes) throw new AppError('FILE_TOO_LARGE', `File must be at most ${Math.round(s.documentMaxBytes / 1024)} KB.`);
    if (buf.length < 100) throw new AppError('FILE_TOO_SMALL', 'The file appears to be empty.');
    if (candidateId && kind !== 'HELPDESK_ATTACHMENT' && kind !== 'CORRECTION_PROOF') {
      const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, select: { status: true } });
      if (c.status === 'SUBMITTED' && !kind.startsWith('EDU_')) throw new ForbiddenException({ code: 'LOCKED', message: 'Category documents are locked after submission. Raise a correction request.' });
    }
    const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
    const objectKey = `${candidateId ? `candidates/${candidateId}` : 'public'}/docs/${randomUUID()}.${ext}`;
    await this.storage.put(objectKey, buf, mime);
    const fileName = (file.originalname || `document.${ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const doc = await this.prisma.document.create({
      data: { candidateId, kind, objectKey, fileName, mime, sizeBytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), source },
    });
    await this.audit.log({ action: 'DOCUMENT_UPLOADED', entity: 'Document', entityId: doc.id, after: { kind, sizeBytes: buf.length, source } });
    return { id: doc.id, kind, fileName, sizeBytes: doc.sizeBytes, mime, verificationStatus: doc.verificationStatus };
  }

  async ownedUrl(candidateId: string, id: string) {
    const d = await this.prisma.document.findFirst({ where: { id, candidateId } });
    if (!d) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    return { url: await this.storage.signedUrl(d.objectKey, 300, d.fileName) };
  }

  async remove(candidateId: string, id: string) {
    const d = await this.prisma.document.findFirst({ where: { id, candidateId } });
    if (!d) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found.' });
    const c = await this.prisma.candidate.findUniqueOrThrow({ where: { id: candidateId }, select: { status: true } });
    if (c.status !== 'DRAFT') throw new ForbiddenException({ code: 'LOCKED', message: 'Documents cannot be deleted after submission.' });
    await this.prisma.document.delete({ where: { id } });
    await this.storage.delete(d.objectKey).catch(() => undefined);
    await this.audit.log({ action: 'DOCUMENT_DELETED', entity: 'Document', entityId: id, before: { kind: d.kind } });
    return { ok: true };
  }

  /** Ensure the referenced documents exist and belong to the candidate. */
  async assertOwned(candidateId: string, ids: Array<string | null | undefined>) {
    const list = ids.filter((x): x is string => !!x);
    if (!list.length) return;
    const n = await this.prisma.document.count({ where: { id: { in: list }, candidateId } });
    if (n !== new Set(list).size) throw new AppError('INVALID_DOCUMENT', 'One of the attached documents is not valid.');
  }
}
