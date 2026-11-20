import { calculateFee, evaluateEligibility, feeRuleSchema, type EligibilityProfile, type EligibilityResult, type FeeResult } from '@vtl/shared';
import type { Exam, FeeRule, Post } from '@prisma/client';

export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export interface ExamDatesJson { notification: string; applyStart: string; applyEnd: string; feeLastDate: string; admitCardRelease?: string; examDate?: string; resultDate?: string }

export function applyWindow(exam: Exam): { open: boolean; feeOpen: boolean; dates: ExamDatesJson } {
  const d = exam.dates as unknown as ExamDatesJson;
  const t = todayIST();
  return { open: exam.status === 'PUBLISHED' && t >= d.applyStart && t <= d.applyEnd, feeOpen: exam.status !== 'ARCHIVED' && t <= d.feeLastDate, dates: d };
}

export function postEligibility(posts: Post[], profile: EligibilityProfile | null, cutoff: string): Array<{ postId: string; postCode: string; result: EligibilityResult | null }> {
  return posts.map((p) => ({ postId: p.id, postCode: p.code, result: profile ? evaluateEligibility(p.eligibility as never, profile, cutoff) : null }));
}

export function feeFor(rules: FeeRule[], profile: EligibilityProfile | null): FeeResult | null {
  if (!profile) return null;
  const parsed = rules.map((r) => feeRuleSchema.parse({ priority: r.priority, label: r.label, amount: r.amount, conditions: r.conditions }));
  return calculateFee(parsed, { category: profile.category, gender: profile.gender, pwd: profile.pwd, exServiceman: profile.exServiceman, domicileStateCode: profile.domicileStateCode });
}
