import { describe, expect, it } from 'vitest';
import { allot } from './allotment';
import { answerSimilarity, centreOutliers, itemAnalysis } from './anomaly';
import { evaluateEligibility } from './eligibility';
import { buildMerit, suggestCutoffs } from './merit';
import { equipercentile, percentiles, scoreAtPercentile } from './normalisation';
import { applyKeyChanges, scoreResponses } from './scoring';

describe('scoring', () => {
  const key = { '1': ['A'], '2': ['B'], '3': ['C', 'D'], '4': ['A'] };
  const scheme = { questionCount: 4, marksCorrect: 2, marksWrong: 0.5, sections: [{ name: 'GK', from: 1, to: 2 }, { name: 'Maths', from: 3, to: 4 }] };
  it('applies negative marking and counts outcomes', () => {
    const s = scoreResponses({ '1': 'A', '2': 'C', '3': 'd', '4': null }, key, scheme);
    expect(s).toMatchObject({ raw: 3.5, correct: 2, wrong: 1, unattempted: 1 });
    expect(s.sectionScores).toEqual({ GK: 1.5, Maths: 2 });
    expect(s.outcomes['3']).toBe('CORRECT');
  });
  it('gives full marks for dropped questions to everyone', () => {
    const s = scoreResponses({ '1': 'B' }, key, { ...scheme, dropped: [1] });
    expect(s.outcomes['1']).toBe('DROPPED');
    expect(s.raw).toBe(2);
  });
  it('applies objection decisions to the key', () => {
    const r = applyKeyChanges(key, [{ qno: 2, to: ['c'] }, { qno: 4, to: 'DROP' }]);
    expect(r.key['2']).toEqual(['C']);
    expect(r.dropped).toEqual([4]);
  });
});

describe('normalisation', () => {
  it('computes percentile as share at or below', () => {
    expect(percentiles([10, 20, 20, 40])).toEqual([25, 75, 75, 100]);
  });
  it('interpolates in the base distribution', () => {
    expect(scoreAtPercentile([0, 10, 20], [33, 66, 100], 49.5)).toBeCloseTo(5);
  });
  it('maps a harder shift up to the base shift scale', () => {
    const easy = { shiftId: 'S1', scores: Array.from({ length: 100 }, (_, i) => ({ id: `e${i}`, raw: i + 50 })) };
    const hard = { shiftId: 'S2', scores: Array.from({ length: 50 }, (_, i) => ({ id: `h${i}`, raw: i * 2 })) };
    const r = equipercentile([easy, hard]);
    expect(r.base).toBe('S1');
    const topHard = r.results.find((x) => x.id === 'h49')!;
    expect(topHard.normalised).toBeCloseTo(149, 0); // best in hard shift = best in base shift
    const midHard = r.results.find((x) => x.id === 'h24')!;
    expect(midHard.normalised).toBeGreaterThan(midHard.raw);
    expect(r.results.find((x) => x.id === 'e10')!.normalised).toBe(60); // base shift unchanged
  });
});

describe('merit', () => {
  const rows = [
    { id: 'a', category: 'GEN' as const, dob: '1999-01-01', name: 'A', written: 150, interview: 20 },
    { id: 'b', category: 'OBC_NCL' as const, dob: '1998-01-01', name: 'B', written: 160, interview: 10 },
    { id: 'c', category: 'SC' as const, dob: '1997-01-01', name: 'C', written: 150, interview: 20 },
  ];
  it('combines written and interview 80:20 and breaks ties by age', () => {
    const m = buildMerit(rows, { writtenMax: 200, interviewMax: 25, writtenWeight: 80, interviewWeight: 20, cutoffs: { GEN: 140, OBC_NCL: 130, SC: 120 } });
    expect(m.map((x) => x.id)).toEqual(['c', 'a', 'b']); // c ties a but is older
    expect(m[0]!.final).toBeCloseTo(76);
    expect(m.every((x) => x.qualified)).toBe(true);
  });
  it('rejects weights that do not add up', () => {
    expect(() => buildMerit(rows, { writtenMax: 200, writtenWeight: 80, interviewWeight: 30 })).toThrow();
  });
  it('suggests cut-offs from seats', () => {
    expect(suggestCutoffs([{ category: 'GEN', written: 10 }, { category: 'GEN', written: 30 }, { category: 'GEN', written: 20 }], { GEN: 2 })).toEqual({ GEN: 20 });
  });
});

describe('allotment', () => {
  it('lets meritorious reserved candidates take GEN seats first, then their own category', () => {
    const seats = [{ key: 'P:SBI', category: 'GEN' as const, count: 1 }, { key: 'P:SBI', category: 'SC' as const, count: 1 }, { key: 'P:PNB', category: 'GEN' as const, count: 1 }];
    const r = allot([
      { id: 'sc1', rank: 1, category: 'SC', prefs: ['P:SBI'] },
      { id: 'gen1', rank: 2, category: 'GEN', prefs: ['P:SBI', 'P:PNB'] },
      { id: 'sc2', rank: 3, category: 'SC', prefs: ['P:SBI'] },
      { id: 'gen2', rank: 4, category: 'GEN', prefs: ['P:SBI'] },
    ], seats);
    expect(r.allotted).toEqual([
      { id: 'sc1', key: 'P:SBI', category: 'GEN', prefNo: 1 },
      { id: 'gen1', key: 'P:PNB', category: 'GEN', prefNo: 2 },
      { id: 'sc2', key: 'P:SBI', category: 'SC', prefNo: 1 },
    ]);
    expect(r.unallotted).toEqual(['gen2']);
  });
});

describe('anomaly detection', () => {
  it('flags a centre far above the others', () => {
    const by: Record<string, number[]> = { A: [50, 52, 48, 51, 49], B: [47, 50, 53, 49, 51], C: [52, 50, 48, 50, 51], D: [95, 97, 96, 98, 94] };
    const f = centreOutliers(by);
    expect(f.map((x) => x.subject)).toEqual(['D']);
  });
  it('flags identical wrong answers', () => {
    const key = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), ['A']]));
    const wrong = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), i < 10 ? 'B' : 'A']));
    const f = answerSimilarity([{ id: 'x', group: 'C1', responses: wrong }, { id: 'y', group: 'C1', responses: wrong }, { id: 'z', group: 'C2', responses: wrong }], key);
    expect(f).toHaveLength(1);
    expect(f[0]!.ids).toEqual(['x', 'y']);
  });
  it('flags a probably wrong key when top scorers agree on another option', () => {
    const sheets = Array.from({ length: 100 }, (_, i) => ({ total: i, responses: { '1': i >= 60 ? 'C' : i % 2 ? 'A' : 'B' } }));
    const r = itemAnalysis(sheets, 1, ['A']);
    expect(r.topChoice).toBe('C');
    expect(r.suspectKey).toBe(true);
  });
});

describe('local-language eligibility', () => {
  const rule = { age: { min: 18, max: 40 }, qualification: { minLevel: 'CLASS_10' as const }, localLanguage: { languages: ['Marathi'], exemptStateCodes: ['MH'] } };
  const base = { dob: '2000-01-01', gender: 'MALE' as const, category: 'GEN' as const, pwd: false, exServiceman: false, nationality: 'INDIAN', education: [{ level: 'CLASS_10' as const, status: 'PASSED' as const, resultType: 'PERCENT' as const, marks: 70 }] };
  it('requires the language unless domiciled in an exempt state', () => {
    expect(evaluateEligibility(rule, { ...base, languages: ['Hindi'] }, '2026-01-01').eligible).toBe(false);
    expect(evaluateEligibility(rule, { ...base, languages: ['marathi'] }, '2026-01-01').eligible).toBe(true);
    expect(evaluateEligibility(rule, { ...base, domicileStateCode: 'MH' }, '2026-01-01').eligible).toBe(true);
  });
});
