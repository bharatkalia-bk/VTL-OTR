import { Injectable, NotFoundException } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { QueueService } from '../../infra/queue.service';
import { FieldCrypto } from '../../security/field-crypto';
import { NotifyService } from '../notify/notify.service';

const ELIGIBLE_STATUSES = ['PAID', 'FEE_EXEMPT'] as const;

/**
 * Roll numbers: <prefix><examYY><centre-city index 2d><serial 5d>, allocated deterministically by
 * application submission time. Centres: each candidate's city preferences in order, filling centres by
 * remaining capacity; unplaced candidates are reported for manual allocation.
 */
@Injectable()
export class AdmitCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly notify: NotifyService,
    private readonly crypto: FieldCrypto,
  ) {}

  async summary(examId: string) {
    const [eligible, allocated, generated, released, centres] = await Promise.all([
      this.prisma.application.count({ where: { examId, status: { in: [...ELIGIBLE_STATUSES] } } }),
      this.prisma.admitCard.count({ where: { examId, centreId: { not: null } } }),
      this.prisma.admitCard.count({ where: { examId, generatedAt: { not: null } } }),
      this.prisma.admitCard.count({ where: { examId, releasedAt: { not: null } } }),
      this.prisma.examCentre.findMany({ where: { city: { examId } }, include: { city: true, _count: { select: { admitCards: true } } } }),
    ]);
    const unallocated = await this.prisma.admitCard.count({ where: { examId, centreId: null } });
    return { eligible, allocated, unallocated, generated, released, centres: centres.map((c) => ({ id: c.id, code: c.code, name: c.name, city: c.city.cityName, capacity: c.capacity, allocated: c._count.admitCards })) };
  }

  async allocate(adminId: string, examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, include: { centreCities: { include: { centres: { orderBy: { code: 'asc' } } }, orderBy: { cityName: 'asc' } } } });
    if (!exam) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Exam not found.' });
    const apps = await this.prisma.application.findMany({ where: { examId, status: { in: [...ELIGIBLE_STATUSES] } }, orderBy: [{ submittedAt: 'asc' }, { applicationNo: 'asc' }], include: { admitCard: true } });
    const remaining = new Map<string, number>();
    for (const city of exam.centreCities) for (const c of city.centres) remaining.set(c.id, c.capacity - (await this.prisma.admitCard.count({ where: { centreId: c.id, OR: [{ allocationMethod: 'MANUAL' }, { releasedAt: { not: null } }] } })));
    const cityIndex = new Map(exam.centreCities.map((c, i) => [c.id, i + 1]));
    const serialByCity = new Map<number, number>();
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
    let placed = 0;
    const unplaced: string[] = [];
    // clear previous AUTO allocations (manual overrides are kept)
    await this.prisma.admitCard.deleteMany({ where: { examId, allocationMethod: 'AUTO', releasedAt: null } });
    const taken = new Set((await this.prisma.admitCard.findMany({ where: { examId }, select: { rollNo: true } })).map((r) => r.rollNo));
    for (const a of apps) {
      if (a.admitCard && a.admitCard.allocationMethod === 'MANUAL') continue;
      if (a.admitCard?.releasedAt) continue;
      let centreId: string | null = null;
      let cityNo = 99;
      for (const cityId of a.centreCityIds) {
        const city = exam.centreCities.find((c) => c.id === cityId);
        const centre = city?.centres.find((c) => (remaining.get(c.id) ?? 0) > 0);
        if (centre) {
          centreId = centre.id;
          remaining.set(centre.id, (remaining.get(centre.id) ?? 0) - 1);
          cityNo = cityIndex.get(cityId) ?? 99;
          break;
        }
      }
      let serial = serialByCity.get(cityNo) ?? 0;
      let rollNo: string;
      do {
        serial++;
        rollNo = `${exam.rollNoPrefix}${yy}${String(cityNo).padStart(2, '0')}${String(serial).padStart(5, '0')}`;
      } while (taken.has(rollNo));
      serialByCity.set(cityNo, serial);
      taken.add(rollNo);
      await this.prisma.admitCard.create({ data: { applicationId: a.id, examId, rollNo, centreId, allocationMethod: 'AUTO' } });
      if (centreId) placed++;
      else unplaced.push(a.applicationNo);
    }
    await this.audit.log({ action: 'ADMIT_ALLOCATION_RUN', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { total: apps.length, placed, unplaced: unplaced.length } });
    return { total: apps.length, placed, unplaced };
  }

  async override(adminId: string, admitCardId: string, centreId: string) {
    const ac = await this.prisma.admitCard.findUnique({ where: { id: admitCardId } });
    if (!ac) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Admit card not found.' });
    const centre = await this.prisma.examCentre.findUnique({ where: { id: centreId }, include: { city: true, _count: { select: { admitCards: true } } } });
    if (!centre || centre.city.examId !== ac.examId) throw new AppError('INVALID_CENTRE', 'Centre does not belong to this exam.');
    if (centre._count.admitCards >= centre.capacity) throw new AppError('CENTRE_FULL', 'Centre is at full capacity.');
    const u = await this.prisma.admitCard.update({ where: { id: admitCardId }, data: { centreId, allocationMethod: 'MANUAL', pdfObjectKey: null, generatedAt: null } });
    await this.audit.log({ action: 'ADMIT_CENTRE_OVERRIDE', entity: 'AdmitCard', entityId: admitCardId, actorType: 'ADMIN', actorId: adminId, before: { centreId: ac.centreId }, after: { centreId } });
    return u;
  }

  async list(examId: string, q: { cursor?: string; limit: number; unallocated?: boolean }) {
    const rows = await this.prisma.admitCard.findMany({
      where: { examId, ...(q.unallocated && { centreId: null }) }, orderBy: { rollNo: 'asc' }, take: q.limit + 1, ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      include: { centre: { include: { city: true } }, application: { select: { applicationNo: true, centreCityIds: true, candidate: { select: { otrId: true } } } } },
    });
    return { items: rows.slice(0, q.limit), nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null };
  }

  /** Bulk generation is queued (one job per card) so thousands of PDFs don't block the API. */
  async generate(adminId: string, examId: string) {
    const cards = await this.prisma.admitCard.findMany({ where: { examId, centreId: { not: null } }, select: { id: true } });
    if (!cards.length) throw new AppError('NOTHING_TO_GENERATE', 'Run allocation first.');
    for (const c of cards) await this.queue.add('pdf', 'admit-card', { admitCardId: c.id });
    await this.audit.log({ action: 'ADMIT_GENERATE_QUEUED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { count: cards.length } });
    return { queued: cards.length };
  }

  async release(adminId: string, examId: string) {
    const unallocated = await this.prisma.admitCard.count({ where: { examId, centreId: null } });
    if (unallocated) throw new AppError('UNALLOCATED', `${unallocated} candidates have no centre. Allocate them manually first.`);
    const cards = await this.prisma.admitCard.findMany({ where: { examId, releasedAt: null }, include: { application: { include: { exam: true } } } });
    const now = new Date();
    await this.prisma.admitCard.updateMany({ where: { examId, releasedAt: null }, data: { releasedAt: now } });
    await this.prisma.exam.update({ where: { id: examId }, data: { admitCardsReleasedAt: now } });
    for (const c of cards) {
      const cand = await this.prisma.candidate.findUniqueOrThrow({ where: { id: c.application.candidateId } });
      await this.prisma.notification.create({ data: { candidateId: cand.id, titleKey: 'notifications.admitCardReleased', params: { exam: c.application.exam.titleEn, rollNo: c.rollNo }, link: `/applications/${c.applicationId}` } });
      await this.notify.send({ templateCode: 'ADMIT_CARD_RELEASED', lang: cand.language as 'en' | 'hi', mobile: this.crypto.decrypt(cand.mobileEnc), email: this.crypto.decrypt(cand.emailEnc), params: { exam: c.application.exam.titleEn, rollNo: c.rollNo } });
    }
    await this.audit.log({ action: 'ADMIT_RELEASED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, after: { count: cards.length } });
    return { released: cards.length };
  }
}
