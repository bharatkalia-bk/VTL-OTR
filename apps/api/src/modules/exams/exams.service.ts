import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { CandidateDataService } from '../candidates/candidate-data.service';
import { applyWindow, feeFor, postEligibility } from './exam-rules';

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService, private readonly data: CandidateDataService) {}

  /** Open exams with eligibility auto-checked against the candidate's OTR profile. */
  async listForCandidate(candidateId: string) {
    const v = await this.data.view(candidateId);
    const profile = this.data.eligibilityProfile(v);
    const exams = await this.prisma.exam.findMany({ where: { status: { in: ['PUBLISHED', 'CLOSED'] } }, include: { posts: true, feeRules: true }, orderBy: { createdAt: 'desc' } });
    const apps = await this.prisma.application.findMany({ where: { candidateId }, select: { examId: true, id: true, status: true, applicationNo: true } });
    return exams.map((e) => {
      const w = applyWindow(e);
      const elig = postEligibility(e.posts, profile, e.ageCutoffDate);
      const app = apps.find((a) => a.examId === e.id);
      return {
        id: e.id, code: e.code, titleEn: e.titleEn, titleHi: e.titleHi, conductingBody: e.conductingBody, notificationNo: e.notificationNo, status: e.status,
        dates: w.dates, applyOpen: w.open,
        posts: e.posts.map((p) => ({ id: p.id, code: p.code, titleEn: p.titleEn, titleHi: p.titleHi, eligibility: elig.find((x) => x.postId === p.id)?.result ?? null })),
        anyEligible: elig.some((x) => x.result?.eligible),
        fee: feeFor(e.feeRules, profile),
        application: app ?? null,
      };
    });
  }

  async detailForCandidate(candidateId: string, examId: string) {
    const e = await this.prisma.exam.findUnique({ where: { id: examId }, include: { posts: true, feeRules: true, centreCities: { orderBy: { cityName: 'asc' } } } });
    if (!e || e.status === 'DRAFT' || e.status === 'ARCHIVED') throw new NotFoundException({ code: 'NOT_FOUND', message: 'Exam not found.' });
    const v = await this.data.view(candidateId);
    const profile = this.data.eligibilityProfile(v);
    const elig = postEligibility(e.posts, profile, e.ageCutoffDate);
    const w = applyWindow(e);
    const app = await this.prisma.application.findUnique({ where: { candidateId_examId: { candidateId, examId } } });
    return {
      id: e.id, code: e.code, titleEn: e.titleEn, titleHi: e.titleHi, descriptionEn: e.descriptionEn, descriptionHi: e.descriptionHi,
      conductingBody: e.conductingBody, notificationNo: e.notificationNo, status: e.status, dates: w.dates, applyOpen: w.open, ageCutoffDate: e.ageCutoffDate,
      maxCentrePreferences: e.maxCentrePreferences, customFields: e.customFields,
      posts: e.posts.map((p) => ({ id: p.id, code: p.code, titleEn: p.titleEn, titleHi: p.titleHi, vacancies: p.vacancies, eligibility: elig.find((x) => x.postId === p.id)?.result ?? null })),
      centreCities: e.centreCities.map((c) => ({ id: c.id, cityName: c.cityName, stateCode: c.stateCode })),
      fee: feeFor(e.feeRules, profile),
      otrSubmitted: v.status === 'SUBMITTED',
      application: app ? { id: app.id, status: app.status, applicationNo: app.applicationNo, postIds: app.postIds, centreCityIds: app.centreCityIds, customFieldValues: app.customFieldValues } : null,
    };
  }
}
