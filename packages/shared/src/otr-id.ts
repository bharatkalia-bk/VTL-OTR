/**
 * OTR ID generation and validation using the Verhoeff check digit scheme
 * (detects all single-digit errors and all adjacent transpositions).
 */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 7, 6, 8, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const;

function assertDigits(s: string): void {
  if (!/^\d+$/.test(s)) throw new Error('Verhoeff input must contain digits only');
}

export function verhoeffGenerate(num: string): number {
  assertDigits(num);
  let c = 0;
  const digits = num.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    c = D[c]![P[(i + 1) % 8]![Number(digits[i])]!]!;
  }
  return INV[c]!;
}

export function verhoeffValidate(numWithCheck: string): boolean {
  if (!/^\d+$/.test(numWithCheck)) return false;
  let c = 0;
  const digits = numWithCheck.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    c = D[c]![P[i % 8]![Number(digits[i])]!]!;
  }
  return c === 0;
}

export interface OtrIdFormat {
  prefix: string;
  seqWidth: number;
}
export const DEFAULT_OTR_ID_FORMAT: OtrIdFormat = { prefix: 'VTL-OTR', seqWidth: 7 };

export function formatOtrId(year: number, seq: number, fmt: OtrIdFormat = DEFAULT_OTR_ID_FORMAT): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error('Sequence must be a positive integer');
  const seqStr = String(seq).padStart(fmt.seqWidth, '0');
  if (seqStr.length > fmt.seqWidth) throw new Error('OTR sequence exhausted for configured width');
  const check = verhoeffGenerate(`${year}${seqStr}`);
  return `${fmt.prefix}-${year}-${seqStr}${check}`;
}

export function parseOtrId(
  id: string,
  fmt: OtrIdFormat = DEFAULT_OTR_ID_FORMAT,
): { year: number; seq: number } | null {
  const esc = fmt.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}-(\\d{4})-(\\d{${fmt.seqWidth}})(\\d)$`);
  const m = re.exec(id.trim().toUpperCase());
  if (!m) return null;
  const [, year, seq, check] = m;
  if (!verhoeffValidate(`${year}${seq}${check}`)) return null;
  return { year: Number(year), seq: Number(seq) };
}

export function isValidOtrId(id: string, fmt?: OtrIdFormat): boolean {
  return parseOtrId(id, fmt) !== null;
}
