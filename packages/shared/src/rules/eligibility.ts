import { z } from 'zod';
import { CATEGORIES, EDUCATION_LEVELS, EDUCATION_RANK, GENDERS, type Category, type EducationLevel, type Gender } from '../enums';
import { ageOn } from './age';

export const eligibilityRuleSchema = z.object({
  age: z
    .object({
      min: z.number().int().min(14).max(70),
      max: z.number().int().min(14).max(70),
      /** Years of upper-age relaxation by category. GEN is implicitly 0. */
      categoryRelaxation: z.record(z.enum(CATEGORIES), z.number().int().min(0).max(20)).default({}),
      /** PwD relaxation, added on top of category relaxation. */
      pwdRelaxation: z.number().int().min(0).max(20).default(10),
      /** Ex-servicemen: service years + this many years. */
      exServicemanExtra: z.number().int().min(0).max(10).default(3),
      /** Additional relaxation for women (some state notices). */
      femaleRelaxation: z.number().int().min(0).max(10).default(0),
      /** Additional relaxation for domicile of listed states. */
      domicileRelaxation: z.number().int().min(0).max(10).default(0),
      /** Absolute cap on relaxed upper age, if notice specifies. */
      maxWithRelaxation: z.number().int().min(14).max(70).optional(),
    })
    .refine((a) => a.max >= a.min, { message: 'max must be >= min' }),
  qualification: z.object({
    minLevel: z.enum(EDUCATION_LEVELS),
    minPercent: z.number().min(0).max(100).optional(),
    /** Lower minimum % for SC/ST/PwD where notice allows. */
    minPercentReserved: z.number().min(0).max(100).optional(),
    allowAppearing: z.boolean().default(false),
  }),
  domicile: z
    .object({
      stateCodes: z.array(z.string().min(2).max(3)).min(1),
      mode: z.enum(['REQUIRED', 'RELAXATION_ONLY']),
    })
    .optional(),
  genders: z.array(z.enum(GENDERS)).optional(),
  nationalities: z.array(z.string()).default(['INDIAN']),
  /** Local-language requirement (state recruitment): candidate must read, write and speak one of these. */
  localLanguage: z
    .object({
      languages: z.array(z.string().min(2).max(40)).min(1),
      /** Candidates domiciled in these states are deemed to know the language (optional). */
      exemptStateCodes: z.array(z.string().min(2).max(3)).default([]),
    })
    .optional(),
});
export type EligibilityRule = z.infer<typeof eligibilityRuleSchema>;
export type EligibilityRuleInput = z.input<typeof eligibilityRuleSchema>;

export interface EligibilityProfile {
  dob: string;
  gender: Gender;
  category: Category;
  pwd: boolean;
  exServiceman: boolean;
  serviceYears?: number;
  domicileStateCode?: string | null;
  nationality: string;
  /** Languages the candidate can read, write and speak. */
  languages?: string[];
  education: Array<{
    level: EducationLevel;
    status: 'PASSED' | 'APPEARING';
    resultType: 'PERCENT' | 'CGPA';
    marks: number;
    maxMarks?: number | null;
    cgpaScale?: number | null;
  }>;
}

export type CriterionCode = 'AGE' | 'QUALIFICATION' | 'DOMICILE' | 'GENDER' | 'NATIONALITY' | 'LANGUAGE';
export interface CriterionResult {
  code: CriterionCode;
  passed: boolean;
  /** i18n key + params so UI can show the reason in EN/HI. */
  reasonKey: string;
  params?: Record<string, string | number>;
}
export interface EligibilityResult {
  eligible: boolean;
  criteria: CriterionResult[];
  upperAgeLimit: number;
  relaxationYears: number;
}

/** CGPA to percentage (common CBSE/UGC style multiplier 9.5 on a 10 scale). */
export function toPercent(e: EligibilityProfile['education'][number]): number {
  if (e.resultType === 'PERCENT') {
    if (e.maxMarks && e.maxMarks > 0 && e.marks > 100) return (e.marks / e.maxMarks) * 100;
    return e.marks;
  }
  const scale = e.cgpaScale ?? 10;
  return Math.min(100, (e.marks / scale) * 10 * 9.5);
}

export function computeRelaxation(rule: EligibilityRule, p: EligibilityProfile): number {
  const a = rule.age;
  let r = a.categoryRelaxation[p.category] ?? 0;
  if (p.pwd) r += a.pwdRelaxation;
  if (p.gender === 'FEMALE') r += a.femaleRelaxation;
  if (rule.domicile && p.domicileStateCode && rule.domicile.stateCodes.includes(p.domicileStateCode)) {
    r += a.domicileRelaxation;
  }
  if (p.exServiceman) {
    // Ex-servicemen get the larger of: service + extra, or their other relaxations.
    r = Math.max(r, (p.serviceYears ?? 0) + a.exServicemanExtra);
  }
  return r;
}

export function evaluateEligibility(ruleInput: EligibilityRuleInput, p: EligibilityProfile, cutoffDate: string): EligibilityResult {
  const rule = eligibilityRuleSchema.parse(ruleInput);
  const criteria: CriterionResult[] = [];

  // Age
  const relaxation = computeRelaxation(rule, p);
  let upper = rule.age.max + relaxation;
  if (rule.age.maxWithRelaxation !== undefined) upper = Math.min(upper, Math.max(rule.age.max, rule.age.maxWithRelaxation));
  const age = ageOn(p.dob, cutoffDate);
  if (age.years < rule.age.min) {
    criteria.push({ code: 'AGE', passed: false, reasonKey: 'eligibility.age.tooYoung', params: { min: rule.age.min, age: age.years, cutoff: cutoffDate } });
  } else if (age.years > upper) {
    criteria.push({ code: 'AGE', passed: false, reasonKey: 'eligibility.age.tooOld', params: { max: upper, age: age.years, cutoff: cutoffDate } });
  } else {
    criteria.push({ code: 'AGE', passed: true, reasonKey: 'eligibility.age.ok', params: { min: rule.age.min, max: upper, age: age.years } });
  }

  // Qualification
  const q = rule.qualification;
  const reserved = p.category === 'SC' || p.category === 'ST' || p.pwd;
  const minPct = reserved && q.minPercentReserved !== undefined ? q.minPercentReserved : q.minPercent;
  const requiredRank = EDUCATION_RANK[q.minLevel];
  const candidates = p.education.filter((e) => EDUCATION_RANK[e.level] >= requiredRank && requiredRank > 0);
  const passedOk = candidates.some((e) => e.status === 'PASSED' && (minPct === undefined || toPercent(e) >= minPct));
  const appearingOk = q.allowAppearing && candidates.some((e) => e.status === 'APPEARING');
  if (passedOk || appearingOk) {
    criteria.push({ code: 'QUALIFICATION', passed: true, reasonKey: 'eligibility.qualification.ok', params: { level: q.minLevel } });
  } else if (candidates.length === 0) {
    criteria.push({ code: 'QUALIFICATION', passed: false, reasonKey: 'eligibility.qualification.missing', params: { level: q.minLevel } });
  } else {
    criteria.push({ code: 'QUALIFICATION', passed: false, reasonKey: 'eligibility.qualification.lowMarks', params: { level: q.minLevel, minPercent: minPct ?? 0 } });
  }

  // Domicile
  if (rule.domicile && rule.domicile.mode === 'REQUIRED') {
    const ok = !!p.domicileStateCode && rule.domicile.stateCodes.includes(p.domicileStateCode);
    criteria.push({ code: 'DOMICILE', passed: ok, reasonKey: ok ? 'eligibility.domicile.ok' : 'eligibility.domicile.required', params: { states: rule.domicile.stateCodes.join(', ') } });
  }

  // Gender
  if (rule.genders && rule.genders.length > 0) {
    const ok = rule.genders.includes(p.gender);
    criteria.push({ code: 'GENDER', passed: ok, reasonKey: ok ? 'eligibility.gender.ok' : 'eligibility.gender.restricted', params: { genders: rule.genders.join(', ') } });
  }

  // Local language
  if (rule.localLanguage) {
    const known = (p.languages ?? []).map((l) => l.trim().toLowerCase());
    const exempt = !!p.domicileStateCode && rule.localLanguage.exemptStateCodes.includes(p.domicileStateCode);
    const ok = exempt || rule.localLanguage.languages.some((l) => known.includes(l.toLowerCase()));
    criteria.push({ code: 'LANGUAGE', passed: ok, reasonKey: ok ? 'eligibility.language.ok' : 'eligibility.language.required', params: { languages: rule.localLanguage.languages.join(', ') } });
  }

  // Nationality
  const natOk = rule.nationalities.includes(p.nationality);
  criteria.push({ code: 'NATIONALITY', passed: natOk, reasonKey: natOk ? 'eligibility.nationality.ok' : 'eligibility.nationality.restricted' });

  return { eligible: criteria.every((c) => c.passed), criteria, upperAgeLimit: upper, relaxationYears: relaxation };
}
