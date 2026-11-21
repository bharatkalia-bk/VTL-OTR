import { describe, expect, it } from 'vitest';
import { categorySchema, educationSchema, passwordSchema, registerStartSchema } from '..';
import { maskAadhaar, maskEmail, maskMobile, normaliseName } from '../masking';

describe('schemas', () => {
  it('validates registration', () => {
    const ok = registerStartSchema.safeParse({
      fullName: 'Ravi Kumar', fatherName: 'Suresh Kumar', dob: '2000-01-01', gender: 'MALE', mobile: '9876543210',
      email: 'Ravi@Example.com', consent: true, captchaId: 'abcdefgh12', captchaText: 'x1y2',
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe('ravi@example.com');
    const bad = registerStartSchema.safeParse({ fullName: 'R', mobile: '1234567890' });
    expect(bad.success).toBe(false);
  });
  it('enforces password policy', () => {
    expect(passwordSchema.safeParse('Abcdef1!').success).toBe(true);
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
  });
  it('requires pwd details when pwd', () => {
    const r = categorySchema.safeParse({ category: 'GEN', pwd: true, exServiceman: false, domicileStateCode: 'UP' });
    expect(r.success).toBe(false);
  });
  it('requires class 10 entry', () => {
    const e = { level: 'CLASS_12', qualificationName: 'Senior Secondary', boardOrUniversity: 'CBSE', yearOfPassing: 2018, status: 'PASSED', resultType: 'PERCENT', marks: 80 };
    expect(educationSchema.safeParse({ entries: [e] }).success).toBe(false);
    expect(educationSchema.safeParse({ entries: [{ ...e, level: 'CLASS_10' }] }).success).toBe(true);
  });
});

describe('masking', () => {
  it('masks', () => {
    expect(maskMobile('9876543210')).toBe('XXXXXX3210');
    expect(maskEmail('ravi.kumar@example.com')).toBe('ra********@example.com');
    expect(maskAadhaar('1234 5678 9012')).toBe('XXXX-XXXX-9012');
    expect(normaliseName('Shri. Ravi  kumar')).toBe('RAVI KUMAR');
  });
});
