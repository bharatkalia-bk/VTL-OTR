import type { Category } from '../enums';

/**
 * Preference-based seat allotment (the usual "merit-cum-preference" method).
 * Candidates are processed in merit order. For each preference, the candidate first competes for an
 * unreserved (GEN) seat on merit; a reserved-category candidate who does not get a GEN seat then takes a
 * seat of their own category. The first preference with a seat available wins.
 */
export interface Seat { key: string; category: Category; count: number }
export interface AllotCandidate { id: string; rank: number; category: Category; prefs: string[] }
export interface AllotResult { id: string; key: string; category: Category; prefNo: number }

export function allot(candidates: AllotCandidate[], seats: Seat[]): { allotted: AllotResult[]; unallotted: string[]; remaining: Record<string, number> } {
  const left: Record<string, number> = {};
  for (const s of seats) left[`${s.key}|${s.category}`] = (left[`${s.key}|${s.category}`] ?? 0) + s.count;
  const allotted: AllotResult[] = [];
  const unallotted: string[] = [];
  for (const c of [...candidates].sort((a, b) => a.rank - b.rank)) {
    let done = false;
    for (let i = 0; i < c.prefs.length && !done; i++) {
      const key = c.prefs[i]!;
      for (const cat of c.category === 'GEN' ? (['GEN'] as Category[]) : (['GEN', c.category] as Category[])) {
        const k = `${key}|${cat}`;
        if ((left[k] ?? 0) > 0) {
          left[k]!--;
          allotted.push({ id: c.id, key, category: cat, prefNo: i + 1 });
          done = true;
          break;
        }
      }
    }
    if (!done) unallotted.push(c.id);
  }
  return { allotted, unallotted, remaining: left };
}
