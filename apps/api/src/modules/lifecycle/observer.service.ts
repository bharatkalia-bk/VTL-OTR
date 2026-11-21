import { Injectable } from '@nestjs/common';
import { coiDeclarationSchema, observerAssignSchema, observerSyncSchema } from '@vtl/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { FieldCrypto } from '../../security/field-crypto';
import type { AccessClaims } from '../../security/tokens.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { notFound, snapshotOf } from './common';

/** Checklist the observer app shows; answers travel inside report payloads. */
export const OBSERVER_CHECKLIST = [
  { key: 'cctv', label: 'CCTV cameras working in every room' },
  { key: 'jammer', label: 'Mobile signal jammers working' },
  { key: 'frisking', label: 'Frisking at entry, separate for women' },
  { key: 'seating', label: 'Seating as per roll-number plan' },
  { key: 'papers_sealed', label: 'Question papers / systems sealed until start' },
  { key: 'biometric', label: 'Biometric and photo capture at entry' },
  { key: 'gate_closed', label: 'Gate closed on time' },
  { key: 'pwd_facility', label: 'Scribe / compensatory time for PwD candidates' },
] as const;

const surname = (n: string | null | undefined) => (n ?? '').trim().split(/\s+/).pop()?.toLowerCase() ?? '';

@Injectable()
export class ObserverService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly crypto: FieldCrypto, private readonly data: CandidateDataService) {}

  /** Automatic conflict-of-interest screening before the observer's own declaration. */
  private async autoCoi(observerId: string, centreId: string): Promise<Array<{ code: string; detail: string }>> {
    const obs = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: observerId } });
    const centre = await this.prisma.examCentre.findUniqueOrThrow({ where: { id: centreId }, include: { city: true } });
    const scope = (obs.scope ?? {}) as { homeDistrict?: string };
    const flags: Array<{ code: string; detail: string }> = [];
    if (scope.homeDistrict && centre.districtName && scope.homeDistrict.toLowerCase() === centre.districtName.toLowerCase()) {
      flags.push({ code: 'HOME_DISTRICT', detail: `Centre is in the observer's home district (${centre.districtName}).` });
    }
    const obsSurname = surname(obs.name);
    if (obsSurname.length > 2) {
      const cards = await this.prisma.admitCard.findMany({ where: { centreId }, include: { application: true }, take: 2000 });
      let n = 0;
      for (const c of cards) if (surname((await snapshotOf(this.crypto, this.data, c.application)).personal.fullName) === obsSurname) n++;
      if (n) flags.push({ code: 'SURNAME_MATCH', detail: `${n} candidate(s) at this centre share the observer's surname. Declaration required.` });
    }
    return flags;
  }

  async assign(adminId: string, examId: string, body: unknown) {
    const x = parseOrThrow(observerAssignSchema, body);
    const obs = await this.prisma.adminUser.findUnique({ where: { id: x.observerId } });
    if (!obs?.roles.includes('OBSERVER')) throw new AppError('NOT_OBSERVER', 'The selected user does not have the Observer role.');
    const centre = await this.prisma.examCentre.findFirst({ where: { id: x.centreId, city: { examId } } });
    if (!centre) notFound('Centre for this exam');
    const flags = await this.autoCoi(x.observerId, x.centreId);
    const a = await this.prisma.observerAssignment.upsert({
      where: { observerId_examId_centreId: { observerId: x.observerId, examId, centreId: x.centreId } },
      create: { observerId: x.observerId, examId, centreId: x.centreId, shiftId: x.shiftId, autoCoiFlags: flags },
      update: { shiftId: x.shiftId, autoCoiFlags: flags },
    });
    await this.audit.log({ action: 'OBSERVER_ASSIGNED', entity: 'ObserverAssignment', entityId: a.id, actorType: 'ADMIN', actorId: adminId, after: { observerId: x.observerId, centreId: x.centreId, flags: flags.map((f) => f.code) } });
    return a;
  }

  async mine(u: AccessClaims) {
    const rows = await this.prisma.observerAssignment.findMany({ where: { observerId: u.sub }, include: { reports: { orderBy: { capturedAt: 'desc' }, select: { id: true, clientId: true, kind: true, severity: true, capturedAt: true, syncedAt: true } } }, orderBy: { createdAt: 'desc' } });
    const centres = new Map((await this.prisma.examCentre.findMany({ where: { id: { in: rows.map((r) => r.centreId) } }, include: { city: { include: { exam: { select: { code: true, titleEn: true, dates: true } } } } } })).map((c) => [c.id, c]));
    const shifts = new Map((await this.prisma.examShift.findMany({ where: { id: { in: rows.flatMap((r) => (r.shiftId ? [r.shiftId] : [])) } } })).map((s) => [s.id, s]));
    return {
      checklist: OBSERVER_CHECKLIST,
      assignments: rows.map((r) => {
        const c = centres.get(r.centreId);
        return { ...r, centre: c ? { name: c.name, code: c.code, address: c.address, city: c.city.cityName, lat: c.lat, lng: c.lng } : null, exam: c ? { code: c.city.exam.code, title: c.city.exam.titleEn } : null, shift: r.shiftId ? shifts.get(r.shiftId) ?? null : null };
      }),
    };
  }

  async declare(u: AccessClaims, assignmentId: string, body: unknown) {
    const x = parseOrThrow(coiDeclarationSchema, body);
    const a = await this.prisma.observerAssignment.findFirst({ where: { id: assignmentId, observerId: u.sub } });
    if (!a) notFound('Assignment');
    const coiStatus = x.hasConflict ? 'CONFLICT' : 'DECLARED_CLEAR';
    const r = await this.prisma.observerAssignment.update({ where: { id: a.id }, data: { coiStatus, coiNote: x.note, coiDeclaredAt: new Date() } });
    await this.audit.log({ action: 'OBSERVER_COI_DECLARED', entity: 'ObserverAssignment', entityId: a.id, actorType: 'ADMIN', actorId: u.sub, after: { coiStatus } });
    return r;
  }

  /** Offline-first sync: each report has a client id, so retries after a dropped connection never duplicate. */
  async sync(u: AccessClaims, body: unknown) {
    const x = parseOrThrow(observerSyncSchema, body);
    const assignments = new Map((await this.prisma.observerAssignment.findMany({ where: { observerId: u.sub, id: { in: [...new Set(x.reports.map((r) => r.assignmentId))] } } })).map((a) => [a.id, a]));
    const accepted: string[] = [];
    const rejected: Array<{ clientId: string; reason: string }> = [];
    for (const r of x.reports) {
      const a = assignments.get(r.assignmentId);
      if (!a) { rejected.push({ clientId: r.clientId, reason: 'NOT_YOUR_ASSIGNMENT' }); continue; }
      if (!['DECLARED_CLEAR', 'WAIVED'].includes(a.coiStatus)) { rejected.push({ clientId: r.clientId, reason: 'COI_DECLARATION_PENDING' }); continue; }
      const res = await this.prisma.observerReport.createMany({ data: [{ assignmentId: a.id, clientId: r.clientId, kind: r.kind, severity: r.severity, payload: r.payload as Prisma.InputJsonValue, lat: r.lat, lng: r.lng, capturedAt: new Date(r.capturedAt) }], skipDuplicates: true });
      accepted.push(r.clientId);
      if (res.count && r.kind === 'INCIDENT') await this.audit.log({ action: 'OBSERVER_INCIDENT', entity: 'ObserverAssignment', entityId: a.id, actorType: 'ADMIN', actorId: u.sub, after: { severity: r.severity, clientId: r.clientId } });
    }
    return { accepted, rejected };
  }

  async list(examId: string) {
    const rows = await this.prisma.observerAssignment.findMany({ where: { examId }, include: { reports: { orderBy: { capturedAt: 'desc' } } }, orderBy: { createdAt: 'asc' } });
    const ids = [...new Set(rows.map((r) => r.observerId))];
    const obs = new Map((await this.prisma.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((o) => [o.id, o]));
    const centres = new Map((await this.prisma.examCentre.findMany({ where: { id: { in: rows.map((r) => r.centreId) } } })).map((c) => [c.id, c]));
    return rows.map((r) => ({ ...r, observer: obs.get(r.observerId) ?? null, centre: centres.get(r.centreId) ? { name: centres.get(r.centreId)!.name, code: centres.get(r.centreId)!.code } : null }));
  }

  async waive(adminId: string, id: string, note: string) {
    const r = await this.prisma.observerAssignment.update({ where: { id }, data: { coiStatus: 'WAIVED', coiNote: note } });
    await this.audit.log({ action: 'OBSERVER_COI_WAIVED', entity: 'ObserverAssignment', entityId: id, actorType: 'ADMIN', actorId: adminId, after: { note } });
    return r;
  }

  async remove(adminId: string, id: string) {
    await this.prisma.observerAssignment.delete({ where: { id } });
    await this.audit.log({ action: 'OBSERVER_UNASSIGNED', entity: 'ObserverAssignment', entityId: id, actorType: 'ADMIN', actorId: adminId });
    return { ok: true };
  }
}
