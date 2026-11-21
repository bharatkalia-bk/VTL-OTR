/**
 * Multi-shift normalisation.
 *
 * Percentile: share of candidates in the same shift scoring at or below the candidate (0-100, 7 decimals,
 * the way national testing agencies publish it).
 *
 * Equipercentile: a raw score in shift S maps to the score in the base shift that has the same percentile,
 * using linear interpolation between neighbouring scores of the base shift. This removes differences in paper
 * difficulty between shifts. The base shift is the one with the most candidates unless given.
 */
export interface ShiftScores { shiftId: string; scores: Array<{ id: string; raw: number }> }
export interface NormalisedScore { id: string; shiftId: string; raw: number; percentile: number; normalised: number }

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export function percentiles(scores: number[]): number[] {
  const n = scores.length;
  if (n === 0) return [];
  const sorted = [...scores].sort((a, b) => a - b);
  // count of scores <= x via binary search
  const atOrBelow = (x: number) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m]! <= x) lo = m + 1; else hi = m; } return lo; };
  return scores.map((s) => r((100 * atOrBelow(s)) / n, 7));
}

/** Score in a sorted ascending base distribution at percentile p (0-100), interpolated. */
export function scoreAtPercentile(baseSortedAsc: number[], basePercentiles: number[], p: number): number {
  const n = baseSortedAsc.length;
  if (n === 0) return 0;
  if (p <= basePercentiles[0]!) return baseSortedAsc[0]!;
  if (p >= basePercentiles[n - 1]!) return baseSortedAsc[n - 1]!;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (basePercentiles[m]! <= p) lo = m; else hi = m; }
  const p0 = basePercentiles[lo]!, p1 = basePercentiles[hi]!;
  const s0 = baseSortedAsc[lo]!, s1 = baseSortedAsc[hi]!;
  if (p1 === p0) return s1;
  return s0 + ((p - p0) / (p1 - p0)) * (s1 - s0);
}

export function equipercentile(shifts: ShiftScores[], baseShiftId?: string): { base: string; results: NormalisedScore[]; stats: Record<string, { n: number; mean: number; max: number; min: number }> } {
  const nonEmpty = shifts.filter((s) => s.scores.length > 0);
  const stats: Record<string, { n: number; mean: number; max: number; min: number }> = {};
  for (const s of nonEmpty) {
    const raws = s.scores.map((x) => x.raw);
    stats[s.shiftId] = { n: raws.length, mean: r(raws.reduce((a, b) => a + b, 0) / raws.length, 2), max: Math.max(...raws), min: Math.min(...raws) };
  }
  if (nonEmpty.length === 0) return { base: baseShiftId ?? '', results: [], stats };
  const base = baseShiftId && nonEmpty.some((s) => s.shiftId === baseShiftId) ? baseShiftId : [...nonEmpty].sort((a, b) => b.scores.length - a.scores.length)[0]!.shiftId;
  const baseRaw = nonEmpty.find((s) => s.shiftId === base)!.scores.map((x) => x.raw).sort((a, b) => a - b);
  // unique-score percentile curve of base shift (monotonic)
  const basePct = percentiles(baseRaw);
  const uniq: number[] = []; const uniqPct: number[] = [];
  baseRaw.forEach((s, i) => { if (uniq[uniq.length - 1] === s) uniqPct[uniqPct.length - 1] = basePct[i]!; else { uniq.push(s); uniqPct.push(basePct[i]!); } });
  const results: NormalisedScore[] = [];
  for (const s of nonEmpty) {
    const pcts = percentiles(s.scores.map((x) => x.raw));
    s.scores.forEach((x, i) => {
      const p = pcts[i]!;
      const normalised = s.shiftId === base ? x.raw : r(scoreAtPercentile(uniq, uniqPct, p), 5);
      results.push({ id: x.id, shiftId: s.shiftId, raw: x.raw, percentile: p, normalised });
    });
  }
  // overall percentile on normalised scores
  const overall = percentiles(results.map((x) => x.normalised));
  results.forEach((x, i) => { x.percentile = overall[i]!; });
  return { base, results, stats };
}
