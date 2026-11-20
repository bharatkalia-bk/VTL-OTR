export interface AgeParts {
  years: number;
  months: number;
  days: number;
}

/** Parse YYYY-MM-DD into UTC parts without timezone drift. */
export function parseISODate(s: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Completed age in years, months and days as on `asOn` (both YYYY-MM-DD). */
export function ageOn(dob: string, asOn: string): AgeParts {
  const b = parseISODate(dob);
  const a = parseISODate(asOn);
  let totalMonths = (a.y - b.y) * 12 + (a.m - b.m);
  if (a.d < b.d) totalMonths -= 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  // anniversary date = dob + totalMonths, clamped to month length
  const am0 = b.m - 1 + totalMonths;
  const ay = b.y + Math.floor(am0 / 12);
  const am = (am0 % 12) + 1;
  const ad = Math.min(b.d, daysInMonth(ay, am));
  const days = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(ay, am - 1, ad)) / 86400000);
  return { years, months, days };
}

/** Add whole years to an ISO date, clamping 29 Feb to 28 Feb. */
export function addYears(date: string, years: number): string {
  const { y, m, d } = parseISODate(date);
  const ny = y + years;
  const dd = Math.min(d, daysInMonth(ny, m));
  return `${ny}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Age band check used in notices: "must have attained `min` and must not have attained
 * `max + 1` years as on the cutoff date". Equivalently DOB must lie in
 * (cutoff - (max+1) years, cutoff - min years] inclusive on both practical boundaries:
 * born not earlier than cutoff-(max+1)y+1d and not later than cutoff-min y.
 */
export function isAgeWithin(dob: string, cutoff: string, minYears: number, maxYears: number): boolean {
  const age = ageOn(dob, cutoff);
  if (age.years < minYears) return false;
  if (age.years > maxYears) return false;
  return true;
}

/** Earliest and latest permissible DOB for an age band, as shown in notices. */
export function dobWindow(cutoff: string, minYears: number, maxYears: number): { bornAfter: string; bornOnOrBefore: string } {
  return { bornAfter: addYears(cutoff, -(maxYears + 1)), bornOnOrBefore: addYears(cutoff, -minYears) };
}
