import { describe, expect, it } from 'vitest';
import { calculateFee, DEFAULT_FEE_RULES, type FeeProfile } from './fees';

const p: FeeProfile = { category: 'GEN', gender: 'MALE', pwd: false, exServiceman: false };

describe('calculateFee', () => {
  it.each([
    [{ ...p }, 100, false],
    [{ ...p, category: 'OBC_NCL' as const }, 100, false],
    [{ ...p, category: 'EWS' as const }, 100, false],
    [{ ...p, gender: 'FEMALE' as const }, 0, true],
    [{ ...p, category: 'SC' as const }, 0, true],
    [{ ...p, category: 'ST' as const }, 0, true],
    [{ ...p, pwd: true }, 0, true],
    [{ ...p, exServiceman: true }, 0, true],
  ])('default matrix %#', (profile, amount, exempt) => {
    const r = calculateFee(DEFAULT_FEE_RULES, profile);
    expect(r.amount).toBe(amount);
    expect(r.exempt).toBe(exempt);
  });
  it('honours priority order regardless of input order', () => {
    const r = calculateFee([...DEFAULT_FEE_RULES].reverse(), { ...p, gender: 'FEMALE' });
    expect(r.amount).toBe(0);
  });
  it('falls back to the highest fee when nothing matches', () => {
    const rules = [
      { priority: 1, label: 'OBC', amount: 500, conditions: { categories: ['OBC_NCL' as const] } },
      { priority: 2, label: 'SC', amount: 250, conditions: { categories: ['SC' as const] } },
    ];
    expect(calculateFee(rules, p)).toEqual({ amount: 500, exempt: false, ruleLabel: 'DEFAULT_MAX' });
  });
  it('supports domicile-specific fees', () => {
    const rules = [
      { priority: 1, label: 'Home state', amount: 50, conditions: { domicileStateCodes: ['UP'] } },
      { priority: 9, label: 'Others', amount: 300, conditions: {} },
    ];
    expect(calculateFee(rules, { ...p, domicileStateCode: 'UP' }).amount).toBe(50);
    expect(calculateFee(rules, { ...p, domicileStateCode: 'BR' }).amount).toBe(300);
    expect(calculateFee(rules, { ...p }).amount).toBe(300);
  });
});
