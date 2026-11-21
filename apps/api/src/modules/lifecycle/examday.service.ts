import { Inject, Injectable } from '@nestjs/common';
import { assignShiftsSchema, biometricAlertSchema, alertReviewSchema, markAttendanceSchema, shiftSchema, techDecisionSchema, techExceptionSchema } from '@vtl/shared';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { STORAGE, type StorageAdapter } from '../../infra/storage';
import { FieldCrypto } from '../../security/field-crypto';
import type { AccessClaims } from '../../security/tokens.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { PdfService } from '../pdf/pdf.service';
import { QrSignerService } from '../pdf/qr-signer.service';
import { assertCentre, notFound, scopeOf, snapshotOf } from './common';
import { DebarmentService } from './debarment.service';

const IST = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

@Injectable()
export class ExamDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
    private readonly data: CandidateDataService,
    private readonly qr: QrSignerService,
    private readonly pdf: PdfService,
    private readonly debar: DebarmentService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  // ── Shifts ──
  listShifts(examId: string) {
    return this.prisma.examShift.findMany({ where: { examId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], include: { _count: { select: { admitCards: true } } } });
  }

  async upsertShift(adminId: string, examId: string, body: unknown, id?: string) {
    const x = parseOrThrow(shiftSchema, body);
    if (x.endTime <= x.startTime) throw new AppError('INVALID_TIME', 'End time must be after start time.');
    const s = id
      ? await this.prisma.examShift.update({ where: { id }, data: x })
      : await this.prisma.examShift.create({ data: { ...x, examId } });
    await this.audit.log({ action: id ? 'SHIFT_UPDATED' : 'SHIFT_CREATED', entity: 'ExamShift', entityId: s.id, actorType: 'ADMIN', actorId: adminId, after: x });
    return s;
  }

  /** Spreads allotted candidates of each centre evenly across the stage-1 shifts. */
  async assignShifts(adminId: string, examId: string, body: unknown) {
    parseOrThrow(assignShiftsSchema, body ?? {});
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const shifts = await this.prisma.examShift.findMany({ where: { examId, stage: exam.stages[0] ?? 'TIER1' }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
    if (!shifts.length) throw new AppError('NO_SHIFTS', 'Create at least one shift first.');
    const cards = await this.prisma.admitCard.findMany({ where: { examId, centreId: { not: null } }, orderBy: [{ centreId: 'asc' }, { rollNo: 'asc' }], select: { id: true, centreId: true } });
    const counter = new Map<string, number>();
    const byShift = new Map<string, string[]>();
    for (const c of cards) {
      const n = counter.get(c.centreId!) ?? 0;
      counter.set(c.centreId!, n + 1);
      const s = shifts[n % shifts.length]!.id;
      byShift.set(s, [...(byShift.get(s) ?? []), c.id]);
    }
    for (const [shiftId, ids] of byShift) await this.prisma.admitCard.updateMany({ where: { id: { in: ids } }, data: { shiftId, pdfObjectKey: null } });
    await this.audit.log({ action: 'SHIFTS_ASSIGNED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: Object.fromEntries([...byShift].map(([k, v]) => [k, v.length])) });
    return { assigned: cards.length, shifts: shifts.length };
  }

  // ── Centre desk ──
  /** Resolves a scanned QR (or typed roll number) to the candidate the desk must check. */
  async lookup(u: AccessClaims, body: { token?: string; rollNo?: string; examId?: string }) {
    const scope = await scopeOf(this.prisma, u);
    let examCode: string | null = null;
    let rollNo = body.rollNo?.trim();
    let qrValid: boolean | null = null;
    if (body.token) {
      const raw = body.token.includes('/verify/') ? body.token.split('/verify/')[1]!.split(/[?#]/)[0]! : body.token.trim();
      const p = await this.qr.verify(raw);
      qrValid = !!p;
      if (!p) throw new AppError('QR_INVALID', 'This QR code is not genuine or has been altered. Do not admit; inform the superintendent.', 422);
      examCode = p.e;
      rollNo = p.r;
    }
    const ac = await this.prisma.admitCard.findFirst({
      where: { rollNo, ...(examCode ? { application: { exam: { code: examCode } } } : body.examId ? { examId: body.examId } : {}) },
      include: { centre: { include: { city: true } }, shift: true, attendance: true, application: { include: { exam: true } } },
    });
    if (!ac) notFound('Roll number');
    assertCentre(scope, ac.centreId);
    const app = ac.application;
    const snap = await snapshotOf(this.crypto, this.data, app);
    const photo = app.photoKey ? await this.storage.signedUrl(app.photoKey, 300) : null;
    const signature = app.signatureKey ? await this.storage.signedUrl(app.signatureKey, 300) : null;
    const debarment = await this.debar.activeFor(app.candidateId, app.examId);
    return {
      admitCardId: ac.id, rollNo: ac.rollNo, qrValid, exam: { id: app.examId, code: app.exam.code, title: app.exam.titleEn },
      candidate: { name: snap.personal.fullName, fatherName: snap.personal.fatherName, dob: snap.personal.dob, gender: snap.personal.gender, category: snap.category.category, otrId: snap.otrId, photo, signature },
      centre: ac.centre ? { id: ac.centre.id, name: ac.centre.name, code: ac.centre.code, city: ac.centre.city.cityName } : null,
      shift: ac.shift ? { id: ac.shift.id, code: ac.shift.code, date: ac.shift.date, startTime: ac.shift.startTime } : null,
      attendance: ac.attendance, debarred: debarment ? { reason: debarment.reason, until: debarment.untilDate } : null,
    };
  }

  async markAttendance(u: AccessClaims, body: unknown) {
    const x = parseOrThrow(markAttendanceSchema, body);
    const info = await this.lookup(u, x);
    if (info.debarred && x.status === 'PRESENT') throw new AppError('DEBARRED', 'This candidate is debarred and must not be admitted.', 409);
    if (info.attendance?.status === 'PRESENT' && x.status === 'PRESENT') {
      throw new AppError('ALREADY_PRESENT', `Already marked present at ${IST(info.attendance.markedAt)}. Possible duplicate entry: verify identity.`, 409);
    }
    const a = await this.prisma.attendance.upsert({
      where: { admitCardId: info.admitCardId },
      create: { admitCardId: info.admitCardId, status: x.status, method: x.token ? 'QR' : 'MANUAL', faceCheck: x.faceCheck, markedById: u.sub, note: x.note },
      update: { status: x.status, method: x.token ? 'QR' : 'MANUAL', faceCheck: x.faceCheck, markedById: u.sub, note: x.note, markedAt: new Date() },
    });
    if (x.faceCheck === 'MISMATCH') {
      await this.prisma.biometricAlert.create({ data: { examId: info.exam.id, admitCardId: info.admitCardId, rollNo: info.rollNo, centreId: info.centre?.id, kind: 'FACE_MISMATCH', source: 'DESK', details: { note: x.note ?? '', markedBy: u.sub } } });
    }
    await this.audit.log({ action: 'ATTENDANCE_MARKED', entity: 'AdmitCard', entityId: info.admitCardId, actorType: 'ADMIN', actorId: u.sub, after: { status: x.status, faceCheck: x.faceCheck } });
    return { ...a, candidate: info.candidate.name, rollNo: info.rollNo };
  }

  async centres(u: AccessClaims, examId?: string) {
    const scope = await scopeOf(this.prisma, u);
    const centres = await this.prisma.examCentre.findMany({
      where: { ...(scope.all ? {} : { id: { in: scope.centreIds } }), ...(examId && { city: { examId } }) },
      include: { city: { include: { exam: { select: { id: true, code: true, titleEn: true } } } } }, orderBy: { code: 'asc' },
    });
    const ids = centres.map((c) => c.id);
    const [total, present, absent] = await Promise.all([
      this.prisma.admitCard.groupBy({ by: ['centreId'], where: { centreId: { in: ids } }, _count: true }),
      this.prisma.$queryRaw<Array<{ centreId: string; n: bigint }>>`SELECT ac."centreId", count(*)::bigint n FROM "Attendance" a JOIN "AdmitCard" ac ON ac.id=a."admitCardId" WHERE a.status='PRESENT' AND ac."centreId" = ANY(${ids}::uuid[]) GROUP BY ac."centreId"`,
      this.prisma.$queryRaw<Array<{ centreId: string; n: bigint }>>`SELECT ac."centreId", count(*)::bigint n FROM "Attendance" a JOIN "AdmitCard" ac ON ac.id=a."admitCardId" WHERE a.status='ABSENT' AND ac."centreId" = ANY(${ids}::uuid[]) GROUP BY ac."centreId"`,
    ]);
    const m = (rows: Array<{ centreId: string; n: bigint }>) => new Map(rows.map((r) => [r.centreId, Number(r.n)]));
    const pm = m(present), am = m(absent);
    return centres.map((c) => ({
      id: c.id, code: c.code, name: c.name, address: c.address, city: c.city.cityName, exam: c.city.exam, capacity: c.capacity,
      allotted: total.find((t) => t.centreId === c.id)?._count ?? 0, present: pm.get(c.id) ?? 0, absent: am.get(c.id) ?? 0,
    }));
  }

  async roster(u: AccessClaims, centreId: string, shiftId?: string) {
    assertCentre(await scopeOf(this.prisma, u), centreId);
    const cards = await this.prisma.admitCard.findMany({ where: { centreId, ...(shiftId && { shiftId }) }, include: { attendance: true, shift: true, application: true }, orderBy: { rollNo: 'asc' } });
    return Promise.all(cards.map(async (c) => {
      const s = await snapshotOf(this.crypto, this.data, c.application);
      return { admitCardId: c.id, rollNo: c.rollNo, name: s.personal.fullName, shift: c.shift?.code ?? null, attendance: c.attendance?.status ?? null, faceCheck: c.attendance?.faceCheck ?? null, markedAt: c.attendance?.markedAt ?? null };
    }));
  }

  /** After the gate closes: everyone not marked present is marked absent. */
  async closeAttendance(u: AccessClaims, centreId: string, shiftId?: string) {
    assertCentre(await scopeOf(this.prisma, u), centreId);
    const cards = await this.prisma.admitCard.findMany({ where: { centreId, ...(shiftId && { shiftId }), attendance: null }, select: { id: true } });
    if (cards.length) await this.prisma.attendance.createMany({ data: cards.map((c) => ({ admitCardId: c.id, status: 'ABSENT', method: 'MANUAL', markedById: u.sub, note: 'Gate closed' })), skipDuplicates: true });
    await this.audit.log({ action: 'ATTENDANCE_CLOSED', entity: 'ExamCentre', entityId: centreId, actorType: 'ADMIN', actorId: u.sub, after: { markedAbsent: cards.length, shiftId } });
    return { markedAbsent: cards.length };
  }

  /** Printable roll sheet with photographs, for candidates to sign at the centre. */
  async rollSheet(u: AccessClaims, centreId: string, shiftId?: string): Promise<Buffer> {
    assertCentre(await scopeOf(this.prisma, u), centreId);
    const centre = await this.prisma.examCentre.findUniqueOrThrow({ where: { id: centreId }, include: { city: { include: { exam: true } } } });
    const shift = shiftId ? await this.prisma.examShift.findUnique({ where: { id: shiftId } }) : null;
    const cards = await this.prisma.admitCard.findMany({ where: { centreId, ...(shiftId && { shiftId }) }, include: { application: true }, orderBy: { rollNo: 'asc' } });
    const rows = await Promise.all(cards.map(async (c, i) => {
      const s = await snapshotOf(this.crypto, this.data, c.application);
      const img = async (k: string | null) => (k ? `data:image/jpeg;base64,${(await this.storage.get(k)).toString('base64')}` : '');
      return { sn: i + 1, rollNo: c.rollNo, name: s.personal.fullName, father: s.personal.fatherName, photo: await img(c.application.photoKey), signature: await img(c.application.signatureKey) };
    }));
    await this.audit.log({ action: 'ROLL_SHEET_PRINTED', entity: 'ExamCentre', entityId: centreId, actorType: 'ADMIN', actorId: u.sub, after: { count: rows.length, shiftId } });
    return this.pdf.render('roll-sheet', {
      assets: this.pdf.assets, exam: { title: centre.city.exam.titleEn, code: centre.city.exam.code },
      centre: { name: centre.name, code: centre.code, address: centre.address, city: centre.city.cityName },
      shift: shift ? `${shift.code} · ${shift.date} · ${shift.startTime}-${shift.endTime}` : 'All shifts', rows, generatedAt: IST(new Date()), ref: centre.code,
    });
  }

  // ── Biometric alerts ──
  async createAlert(examId: string, body: unknown, source: 'AGENCY' | 'DESK' | 'SYSTEM', actorId?: string) {
    const x = parseOrThrow(biometricAlertSchema, body);
    const ac = await this.prisma.admitCard.findUnique({ where: { examId_rollNo: { examId, rollNo: x.rollNo } } });
    if (!ac) throw new AppError('UNKNOWN_ROLL', `Roll number ${x.rollNo} not found for this exam.`);
    return this.prisma.biometricAlert.create({ data: { examId, admitCardId: ac.id, rollNo: x.rollNo, centreId: ac.centreId, kind: x.kind, score: x.score, source, details: { note: x.note ?? '', by: actorId ?? null } } });
  }

  async listAlerts(examId: string | undefined, status?: string) {
    const rows = await this.prisma.biometricAlert.findMany({ where: { ...(examId && { examId }), ...(status && { status }) }, orderBy: { createdAt: 'desc' }, take: 200 });
    const centres = new Map((await this.prisma.examCentre.findMany({ where: { id: { in: rows.flatMap((r) => (r.centreId ? [r.centreId] : [])) } } })).map((c) => [c.id, c]));
    return rows.map((r) => ({ ...r, centre: r.centreId ? centres.get(r.centreId)?.name ?? null : null }));
  }

  async reviewAlert(adminId: string, id: string, body: unknown) {
    const x = parseOrThrow(alertReviewSchema, body);
    const a = await this.prisma.biometricAlert.update({ where: { id }, data: { status: x.decision, reviewNote: x.note, reviewedById: adminId, reviewedAt: new Date() } });
    await this.audit.log({ action: `BIOMETRIC_ALERT_${x.decision}`, entity: 'BiometricAlert', entityId: id, actorType: 'ADMIN', actorId: adminId, after: x });
    return a;
  }

  // ── Technical exceptions ──
  async reportException(u: AccessClaims, examId: string, centreId: string | undefined, body: unknown, via: 'DESK' | 'AGENCY' | 'ADMIN') {
    const x = parseOrThrow(techExceptionSchema, body);
    if (centreId) assertCentre(await scopeOf(this.prisma, u), centreId);
    const t = await this.prisma.technicalException.create({ data: { examId, centreId, shiftId: x.shiftId, rollNos: x.rollNos, kind: x.kind, minutesLost: x.minutesLost, description: x.description, reportedById: u.sub, reportedVia: via } });
    await this.audit.log({ action: 'TECH_EXCEPTION_REPORTED', entity: 'TechnicalException', entityId: t.id, actorType: 'ADMIN', actorId: u.sub, after: { kind: x.kind, minutesLost: x.minutesLost, count: x.rollNos.length } });
    return t;
  }

  listExceptions(examId?: string, status?: string) {
    return this.prisma.technicalException.findMany({ where: { ...(examId && { examId }), ...(status && { status }) }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async decideException(adminId: string, id: string, body: unknown) {
    const x = parseOrThrow(techDecisionSchema, body);
    const t = await this.prisma.technicalException.update({ where: { id }, data: { status: x.status, resolution: x.resolution, compensationMinutes: x.compensationMinutes, decidedById: adminId, decidedAt: new Date() } });
    await this.audit.log({ action: `TECH_EXCEPTION_${x.status}`, entity: 'TechnicalException', entityId: id, actorType: 'ADMIN', actorId: adminId, after: x });
    return t;
  }
}
