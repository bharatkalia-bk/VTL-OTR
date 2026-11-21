import { Injectable, NotFoundException } from '@nestjs/common';
import { centreCityUpsertSchema, examUpsertSchema, feeRulesUpsertSchema, postUpsertSchema } from '@vtl/shared';
import { AppError } from '../../common/errors';
import { parseOrThrow } from '../../common/zod';
import { AuditService } from '../../infra/audit.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';

@Injectable()
export class AdminExamsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly redis: RedisService) {}

  private async bust() {
    await this.redis.client.del(this.redis.key('cache', 'public-exams'));
  }

  list() {
    return this.prisma.exam.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { applications: true, posts: true, centreCities: true } } } });
  }

  async get(id: string) {
    const e = await this.prisma.exam.findUnique({ where: { id }, include: { posts: true, feeRules: { orderBy: { priority: 'asc' } }, centreCities: { include: { centres: true }, orderBy: { cityName: 'asc' } } } });
    if (!e) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Exam not found.' });
    const counts = await this.prisma.application.groupBy({ by: ['status'], where: { examId: id }, _count: true });
    return { ...e, applicationCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
  }

  async create(adminId: string, body: unknown) {
    const b = parseOrThrow(examUpsertSchema, body);
    const e = await this.prisma.exam.create({ data: { ...b, dates: b.dates, customFields: b.customFields } });
    await this.audit.log({ action: 'EXAM_CREATED', entity: 'Exam', entityId: e.id, actorType: 'ADMIN', actorId: adminId, after: b });
    return e;
  }

  async update(adminId: string, id: string, body: unknown) {
    const b = parseOrThrow(examUpsertSchema, body);
    const before = await this.prisma.exam.findUniqueOrThrow({ where: { id } });
    const e = await this.prisma.exam.update({ where: { id }, data: { ...b, dates: b.dates, customFields: b.customFields } });
    await this.audit.log({ action: 'EXAM_UPDATED', entity: 'Exam', entityId: id, actorType: 'ADMIN', actorId: adminId, before, after: b });
    await this.bust();
    return e;
  }

  async setStatus(adminId: string, id: string, status: 'PUBLISHED' | 'DRAFT' | 'CLOSED' | 'ARCHIVED') {
    const e = await this.prisma.exam.findUniqueOrThrow({ where: { id }, include: { posts: true, feeRules: true, centreCities: true } });
    if (status === 'PUBLISHED' && (!e.posts.length || !e.feeRules.length || !e.centreCities.length)) {
      throw new AppError('INCOMPLETE_EXAM', 'Add at least one post, fee rule and centre city before publishing.');
    }
    const u = await this.prisma.exam.update({ where: { id }, data: { status } });
    await this.audit.log({ action: `EXAM_${status}`, entity: 'Exam', entityId: id, actorType: 'ADMIN', actorId: adminId, before: { status: e.status }, after: { status } });
    await this.bust();
    return u;
  }

  async upsertPost(adminId: string, examId: string, body: unknown, postId?: string) {
    const b = parseOrThrow(postUpsertSchema, body);
    const p = postId
      ? await this.prisma.post.update({ where: { id: postId }, data: { ...b, eligibility: b.eligibility } })
      : await this.prisma.post.create({ data: { ...b, eligibility: b.eligibility, examId } });
    await this.audit.log({ action: postId ? 'POST_UPDATED' : 'POST_CREATED', entity: 'Post', entityId: p.id, actorType: 'ADMIN', actorId: adminId, after: b });
    await this.bust();
    return p;
  }

  async deletePost(adminId: string, postId: string) {
    const used = await this.prisma.application.count({ where: { postIds: { has: postId } } });
    if (used) throw new AppError('IN_USE', 'Applications reference this post; it cannot be deleted.', 409);
    await this.prisma.post.delete({ where: { id: postId } });
    await this.audit.log({ action: 'POST_DELETED', entity: 'Post', entityId: postId, actorType: 'ADMIN', actorId: adminId });
    return { ok: true };
  }

  async setFeeRules(adminId: string, examId: string, body: unknown) {
    const b = parseOrThrow(feeRulesUpsertSchema, body);
    const before = await this.prisma.feeRule.findMany({ where: { examId } });
    await this.prisma.$transaction([
      this.prisma.feeRule.deleteMany({ where: { examId } }),
      this.prisma.feeRule.createMany({ data: b.rules.map((r) => ({ examId, priority: r.priority, label: r.label, amount: r.amount, conditions: r.conditions })) }),
    ]);
    await this.audit.log({ action: 'FEE_MATRIX_UPDATED', entity: 'Exam', entityId: examId, actorType: 'ADMIN', actorId: adminId, before, after: b.rules });
    return this.prisma.feeRule.findMany({ where: { examId }, orderBy: { priority: 'asc' } });
  }

  async upsertCity(adminId: string, examId: string, body: unknown, cityId?: string) {
    const b = parseOrThrow(centreCityUpsertSchema, body);
    const city = cityId
      ? await this.prisma.examCentreCity.update({ where: { id: cityId }, data: { cityName: b.cityName, stateCode: b.stateCode } })
      : await this.prisma.examCentreCity.create({ data: { examId, cityName: b.cityName, stateCode: b.stateCode } });
    for (const c of b.centres) {
      const data = { code: c.code, name: c.name, address: c.address, capacity: c.capacity, reportingTime: c.reportingTime, gateClosingTime: c.gateClosingTime };
      if (c.id) await this.prisma.examCentre.update({ where: { id: c.id }, data });
      else await this.prisma.examCentre.create({ data: { ...data, cityId: city.id } });
    }
    await this.audit.log({ action: cityId ? 'CENTRE_CITY_UPDATED' : 'CENTRE_CITY_CREATED', entity: 'ExamCentreCity', entityId: city.id, actorType: 'ADMIN', actorId: adminId, after: b });
    return this.prisma.examCentreCity.findUniqueOrThrow({ where: { id: city.id }, include: { centres: true } });
  }
}
