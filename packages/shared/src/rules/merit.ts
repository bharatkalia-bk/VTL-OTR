import type { Category } from '../enums';

export interface MeritInput {
  id: string;
  category: Category;
  pwd?: boolean;
  dob: string;
  name: string;
  /** Written score (normalised), out of writtenMax. */
  written: number;
  /** Interview score out of interviewMax; omitted when no interview. */
  interview?: number | null;
}
export interface MeritOptions {
  writtenMax: number;
  interviewMax?: number;
  writtenWeight: number;
  interviewWeight: number;
  /** Category-wise minimum written score to qualify. */
  cutoffs?: Partial<Record<Category | 'PWD', number>>;
}
export interface MeritRow extends MeritInput { final: number; rank: number; categoryRank: number; qualified: boolean }

/**
 * Final merit = written% x writtenWeight + interview% x interviewWeight (weights in percent, e.g. 80:20).
 * Ties: higher written score, then older candidate (earlier DOB), then name alphabetically,
 * the order most central recruitment notices prescribe.
 */
export function buildMerit(rows: MeritInput[], o: MeritOptions): MeritRow[] {
  if (o.writtenWeight + o.interviewWeight !== 100) throw new Error('weights must add up to 100');
  const out = rows.map((x) => {
    const w = o.writtenMax > 0 ? (x.written / o.writtenMax) * 100 : 0;
    const i = o.interviewWeight > 0 && o.interviewMax ? ((x.interview ?? 0) / o.interviewMax) * 100 : 0;
    const final = Math.round(((w * o.writtenWeight + i * o.interviewWeight) / 100) * 10000) / 10000;
    const cut = x.pwd && o.cutoffs?.PWD !== undefined ? o.cutoffs.PWD : o.cutoffs?.[x.category];
    const qualified = cut === undefined ? true : x.written >= cut;
    return { ...x, final, rank: 0, categoryRank: 0, qualified };
  });
  out.sort((a, b) => b.final - a.final || b.written - a.written || a.dob.localeCompare(b.dob) || a.name.localeCompare(b.name));
  const catCount: Record<string, number> = {};
  out.forEach((x, i) => { x.rank = i + 1; catCount[x.category] = (catCount[x.category] ?? 0) + 1; x.categoryRank = catCount[x.category]!; });
  return out;
}

/** Lowest written score among the top N qualified candidates of each category: a cut-off suggestion. */
export function suggestCutoffs(rows: Array<{ category: Category; written: number }>, seats: Partial<Record<Category, number>>, multiplier = 1): Partial<Record<Category, number>> {
  const res: Partial<Record<Category, number>> = {};
  for (const [cat, n] of Object.entries(seats) as Array<[Category, number]>) {
    const list = rows.filter((r) => r.category === cat).map((r) => r.written).sort((a, b) => b - a);
    const take = Math.ceil(n * multiplier);
    if (list.length) res[cat] = list[Math.min(take, list.length) - 1]!;
  }
  return res;
}
