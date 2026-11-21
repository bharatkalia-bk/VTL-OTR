import { describe, expect, it } from 'vitest';
import { formatOtrId, isValidOtrId, parseOtrId, verhoeffGenerate, verhoeffValidate } from './otr-id';

describe('Verhoeff', () => {
  it('matches known vectors', () => {
    expect(verhoeffGenerate('236')).toBe(3);
    expect(verhoeffValidate('2363')).toBe(true);
    expect(verhoeffGenerate('12345')).toBe(1);
    expect(verhoeffValidate('123451')).toBe(true);
  });
  it('detects every single-digit substitution and adjacent transposition', () => {
    const base = '202600001236';
    expect(verhoeffValidate(base)).toBe(true);
    for (let i = 0; i < base.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === base[i]) continue;
        const mutated = base.slice(0, i) + d + base.slice(i + 1);
        expect(verhoeffValidate(mutated)).toBe(false);
      }
      if (i < base.length - 1 && base[i] !== base[i + 1]) {
        const swapped = base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2);
        expect(verhoeffValidate(swapped)).toBe(false);
      }
    }
  });
  it('rejects non-digits', () => {
    expect(() => verhoeffGenerate('12a')).toThrow();
    expect(verhoeffValidate('12a')).toBe(false);
  });
});

describe('OTR ID', () => {
  it('formats with year, padded sequence and check digit', () => {
    expect(formatOtrId(2026, 123)).toBe('VTL-OTR-2026-00001236');
  });
  it('round-trips', () => {
    for (const seq of [1, 99, 123456, 9999999]) {
      const id = formatOtrId(2026, seq);
      expect(parseOtrId(id)).toEqual({ year: 2026, seq });
      expect(isValidOtrId(id.toLowerCase())).toBe(true);
    }
  });
  it('rejects typos and bad shapes', () => {
    expect(isValidOtrId('VTL-OTR-2026-00001235')).toBe(false);
    expect(isValidOtrId('VTL-OTR-2026-0001236')).toBe(false);
    expect(isValidOtrId('ABC-OTR-2026-00001236')).toBe(false);
  });
  it('supports custom formats and guards exhaustion', () => {
    const fmt = { prefix: 'UPSSSC', seqWidth: 5 };
    const id = formatOtrId(2027, 42, fmt);
    expect(id).toMatch(/^UPSSSC-2027-00042\d$/);
    expect(isValidOtrId(id, fmt)).toBe(true);
    expect(() => formatOtrId(2027, 100000, fmt)).toThrow(/exhausted/);
    expect(() => formatOtrId(2027, 0)).toThrow();
  });
});
