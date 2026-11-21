import { describe, expect, it } from 'vitest';
import { addYears, ageOn, dobWindow, isAgeWithin } from './age';

describe('ageOn', () => {
  it('computes completed years/months/days', () => {
    expect(ageOn('2000-08-01', '2026-08-01')).toEqual({ years: 26, months: 0, days: 0 });
    expect(ageOn('2000-08-02', '2026-08-01')).toEqual({ years: 25, months: 11, days: 30 });
    expect(ageOn('2000-01-31', '2026-03-01')).toEqual({ years: 26, months: 1, days: 1 });
  });
  it('handles leap-day births', () => {
    expect(ageOn('2004-02-29', '2026-02-28').years).toBe(21);
    expect(ageOn('2004-02-29', '2026-03-01').years).toBe(22);
  });
});

describe('age band', () => {
  it('is inclusive at both boundaries', () => {
    // 18 to 27 as on 2026-08-01
    expect(isAgeWithin('2008-08-01', '2026-08-01', 18, 27)).toBe(true); // exactly 18
    expect(isAgeWithin('2008-08-02', '2026-08-01', 18, 27)).toBe(false); // one day short
    expect(isAgeWithin('1998-08-02', '2026-08-01', 18, 27)).toBe(true); // 27y 11m 30d
    expect(isAgeWithin('1998-08-01', '2026-08-01', 18, 27)).toBe(false); // attained 28
  });
  it('computes DOB window like notices', () => {
    expect(dobWindow('2026-08-01', 18, 27)).toEqual({ bornAfter: '1998-08-01', bornOnOrBefore: '2008-08-01' });
  });
  it('addYears clamps leap day', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
  });
});
