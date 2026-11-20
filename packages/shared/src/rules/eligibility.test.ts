import { describe, expect, it } from 'vitest';
import { computeRelaxation, eligibilityRuleSchema, evaluateEligibility, toPercent, type EligibilityProfile, type EligibilityRuleInput } from './eligibility';

const rule: EligibilityRuleInput = {
  age: { min: 18, max: 27, categoryRelaxation: { OBC_NCL: 3, SC: 5, ST: 5 }, pwdRelaxation: 10, exServicemanExtra: 3 },
  qualification: { minLevel: 'GRADUATION', minPercent: 55, minPercentReserved: 50, allowAppearing: false },
};
const cutoff = '2026-08-01';
const grad = (marks: number, status: 'PASSED' | 'APPEARING' = 'PASSED') => ({ level: 'GRADUATION' as const, status, resultType: 'PERCENT' as const, marks });
const base: EligibilityProfile = {
  dob: '2000-01-15', gender: 'MALE', category: 'GEN', pwd: false, exServiceman: false, nationality: 'INDIAN',
  education: [{ level: 'CLASS_10', status: 'PASSED', resultType: 'PERCENT', marks: 80 }, grad(60)],
};

describe('evaluateEligibility', () => {
  it('passes a typical GEN graduate', () => {
    const r = evaluateEligibility(rule, base, cutoff);
    expect(r.eligible).toBe(true);
    expect(r.upperAgeLimit).toBe(27);
  });
  it('fails GEN over age, passes same DOB for OBC, SC, PwD', () => {
    const dob = '1997-06-01'; // 29 on cutoff
    expect(evaluateEligibility(rule, { ...base, dob }, cutoff).eligible).toBe(false);
    expect(evaluateEligibility(rule, { ...base, dob, category: 'OBC_NCL' }, cutoff).eligible).toBe(true);
    expect(evaluateEligibility(rule, { ...base, dob, category: 'SC' }, cutoff).eligible).toBe(true);
    const pwd = evaluateEligibility(rule, { ...base, dob: '1990-01-01', pwd: true, education: [grad(52)] }, cutoff);
    expect(pwd.upperAgeLimit).toBe(37);
    expect(pwd.eligible).toBe(true); // 36y, reserved min% 50
  });
  it('stacks PwD with category (SC + PwD = 15)', () => {
    const r = evaluateEligibility(rule, { ...base, category: 'SC', pwd: true }, cutoff);
    expect(r.relaxationYears).toBe(15);
    expect(r.upperAgeLimit).toBe(42);
  });
  it('ex-serviceman gets service + 3 when larger', () => {
    const p = { ...base, exServiceman: true, serviceYears: 10 };
    expect(computeRelaxation(eligibilityRuleSchema.parse(rule), p)).toBe(13);
  });
  it('respects maxWithRelaxation cap', () => {
    const capped = { ...rule, age: { ...rule.age, maxWithRelaxation: 35 } };
    const r = evaluateEligibility(capped, { ...base, category: 'SC', pwd: true }, cutoff);
    expect(r.upperAgeLimit).toBe(35);
  });
  it('fails too young with reason', () => {
    const r = evaluateEligibility(rule, { ...base, dob: '2009-01-01' }, cutoff);
    expect(r.eligible).toBe(false);
    expect(r.criteria.find((c) => c.code === 'AGE')?.reasonKey).toBe('eligibility.age.tooYoung');
  });
  it('checks qualification level and marks', () => {
    const noGrad = { ...base, education: [{ level: 'CLASS_12' as const, status: 'PASSED' as const, resultType: 'PERCENT' as const, marks: 90 }] };
    expect(evaluateEligibility(rule, noGrad, cutoff).criteria.find((c) => c.code === 'QUALIFICATION')?.reasonKey).toBe('eligibility.qualification.missing');
    const low = { ...base, education: [grad(52)] };
    expect(evaluateEligibility(rule, low, cutoff).criteria.find((c) => c.code === 'QUALIFICATION')?.reasonKey).toBe('eligibility.qualification.lowMarks');
    // higher qualification satisfies lower requirement
    const pg = { ...base, education: [{ level: 'PG' as const, status: 'PASSED' as const, resultType: 'PERCENT' as const, marks: 70 }] };
    expect(evaluateEligibility(rule, pg, cutoff).eligible).toBe(true);
  });
  it('allows appearing only when permitted', () => {
    const appearing = { ...base, education: [grad(0, 'APPEARING')] };
    expect(evaluateEligibility(rule, appearing, cutoff).eligible).toBe(false);
    expect(evaluateEligibility({ ...rule, qualification: { ...rule.qualification, allowAppearing: true } }, appearing, cutoff).eligible).toBe(true);
  });
  it('converts CGPA', () => {
    expect(toPercent({ level: 'GRADUATION', status: 'PASSED', resultType: 'CGPA', marks: 7, cgpaScale: 10 })).toBeCloseTo(66.5);
    expect(toPercent({ level: 'GRADUATION', status: 'PASSED', resultType: 'PERCENT', marks: 450, maxMarks: 600 })).toBe(75);
  });
  it('enforces domicile and gender restrictions', () => {
    const r2: EligibilityRuleInput = { ...rule, domicile: { stateCodes: ['UP'], mode: 'REQUIRED' }, genders: ['FEMALE'] };
    expect(evaluateEligibility(r2, { ...base, domicileStateCode: 'UP', gender: 'FEMALE' }, cutoff).eligible).toBe(true);
    const r = evaluateEligibility(r2, { ...base, domicileStateCode: 'MP' }, cutoff);
    expect(r.criteria.filter((c) => !c.passed).map((c) => c.code).sort()).toEqual(['DOMICILE', 'GENDER']);
  });
  it('domicile relaxation applies only to listed states', () => {
    const r3: EligibilityRuleInput = { ...rule, age: { ...rule.age, domicileRelaxation: 5 }, domicile: { stateCodes: ['RJ'], mode: 'RELAXATION_ONLY' } };
    expect(evaluateEligibility(r3, { ...base, domicileStateCode: 'RJ' }, cutoff).upperAgeLimit).toBe(32);
    expect(evaluateEligibility(r3, { ...base, domicileStateCode: 'DL' }, cutoff).upperAgeLimit).toBe(27);
  });
  it('rejects invalid rule config', () => {
    expect(() => eligibilityRuleSchema.parse({ ...rule, age: { ...rule.age, min: 30, max: 20 } })).toThrow();
  });
});
