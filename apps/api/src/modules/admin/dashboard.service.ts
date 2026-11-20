import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  summary() {
    return this.redis.cached(this.redis.key('cache', 'admin-dashboard'), 30, async () => {
      const startIST = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())}T00:00:00+05:30`);
      const [total, today, submitted, drafts, blocked, pendingDocs, pendingCorrections, openFlags, openTickets, paid, byState, byCategory, byGender, perExam, steps, last14] = await Promise.all([
        this.prisma.candidate.count(),
        this.prisma.candidate.count({ where: { createdAt: { gte: startIST } } }),
        this.prisma.candidate.count({ where: { status: 'SUBMITTED' } }),
        this.prisma.candidate.count({ where: { status: 'DRAFT' } }),
        this.prisma.candidate.count({ where: { status: 'BLOCKED' } }),
        this.prisma.document.count({ where: { verificationStatus: 'PENDING', candidateId: { not: null }, kind: { notIn: ['HELPDESK_ATTACHMENT'] } } }),
        this.prisma.correctionRequest.count({ where: { status: 'PENDING' } }),
        this.prisma.duplicateFlag.count({ where: { status: 'OPEN' } }),
        this.prisma.helpdeskTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        this.prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amount: true }, _count: true }),
        this.prisma.candidateProfile.groupBy({ by: ['stateCode'], _count: true, where: { stateCode: { not: null } } }),
        this.prisma.candidateProfile.groupBy({ by: ['category'], _count: true, where: { category: { not: null } } }),
        this.prisma.candidateProfile.groupBy({ by: ['gender'], _count: true, where: { gender: { not: null } } }),
        this.prisma.exam.findMany({ where: { status: { not: 'DRAFT' } }, select: { id: true, code: true, titleEn: true, applications: { select: { status: true } } } }),
        this.prisma.$queryRaw<Array<{ step: string; n: bigint }>>`SELECT unnest("completedSteps") AS step, COUNT(*) AS n FROM "CandidateProfile" GROUP BY 1`,
        this.prisma.$queryRaw<Array<{ d: string; n: bigint }>>`SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS d, COUNT(*) AS n FROM "Candidate" WHERE "createdAt" > now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
      ]);
      const states = new Map((await this.prisma.state.findMany()).map((s) => [s.code, s.nameEn]));
      const stepCount = new Map(steps.map((s) => [s.step, Number(s.n)]));
      return {
        registrations: { total, today, submitted, drafts, blocked },
        pending: { documents: pendingDocs, corrections: pendingCorrections, duplicates: openFlags, tickets: openTickets },
        payments: { collected: paid._sum.amount ?? 0, count: paid._count },
        funnel: [
          { step: 'registered', count: total },
          ...['personal', 'category', 'address', 'education', 'photo', 'declaration'].map((s) => ({ step: s, count: stepCount.get(s) ?? 0 })),
          { step: 'submitted', count: submitted },
        ],
        perExam: perExam.map((e) => ({ code: e.code, title: e.titleEn, total: e.applications.filter((a) => a.status !== 'DRAFT').length, paid: e.applications.filter((a) => a.status === 'PAID' || a.status === 'FEE_EXEMPT').length, pendingPayment: e.applications.filter((a) => a.status === 'PAYMENT_PENDING').length })),
        byState: byState.map((s) => ({ state: states.get(s.stateCode ?? '') ?? s.stateCode, count: s._count })).sort((a, b) => b.count - a.count).slice(0, 12),
        byCategory: byCategory.map((s) => ({ category: s.category, count: s._count })),
        byGender: byGender.map((s) => ({ gender: s.gender, count: s._count })),
        daily: last14.map((r) => ({ date: r.d, count: Number(r.n) })),
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
