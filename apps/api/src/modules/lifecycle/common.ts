import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AdminRole } from '@vtl/shared';
import type { PrismaService } from '../../infra/prisma.service';
import type { FieldCrypto } from '../../security/field-crypto';
import type { AccessClaims } from '../../security/tokens.service';
import type { CandidateDataService, CandidateView } from '../candidates/candidate-data.service';

const CONSOLE_WIDE: AdminRole[] = ['SUPER_ADMIN', 'EXAM_ADMIN', 'AUDITOR'];

export interface StaffScope { all: boolean; centreIds: string[]; examIds: string[]; homeDistrict?: string; agency?: string }

/** Field staff only see what their scope lists; exam admins, auditors and super admins see everything. */
export async function scopeOf(prisma: PrismaService, u: AccessClaims): Promise<StaffScope> {
  const roles = (u.roles ?? []) as AdminRole[];
  const admin = await prisma.adminUser.findUnique({ where: { id: u.sub }, select: { scope: true } });
  const s = (admin?.scope ?? {}) as Partial<StaffScope>;
  return { all: roles.some((r) => CONSOLE_WIDE.includes(r)), centreIds: s.centreIds ?? [], examIds: s.examIds ?? [], homeDistrict: s.homeDistrict, agency: s.agency };
}

export function assertCentre(scope: StaffScope, centreId: string | null | undefined): void {
  if (scope.all) return;
  if (!centreId || !scope.centreIds.includes(centreId)) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'This candidate is not allotted to your centre.' });
}

export function assertExam(scope: StaffScope, examId: string): void {
  if (scope.all || scope.examIds.length === 0 || scope.examIds.includes(examId)) return;
  throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'This exam is not in your scope.' });
}

/** Frozen candidate data captured at application submission, falling back to the live profile. */
export async function snapshotOf(crypto: FieldCrypto, data: CandidateDataService, app: { candidateId: string; profileSnapshotEnc: string | null }): Promise<CandidateView> {
  return crypto.decJson<CandidateView>(app.profileSnapshotEnc) ?? (await data.view(app.candidateId));
}

export function notFound(what: string): never {
  throw new NotFoundException({ code: 'NOT_FOUND', message: `${what} not found.` });
}

/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF). First row is the header. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const h = head.map((x) => x.trim());
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/**
 * CSV rows with question columns (Q1, Q2 ...) become { rollNo, responses: { "1": "A" } }.
 * Other columns are kept as is.
 */
export function csvToResponseRecords(rows: Array<Record<string, string>>): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const responses: Record<string, string | null> = {};
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const m = /^q(\d{1,3})$/i.exec(k);
      if (m) responses[String(Number(m[1]))] = v === '' ? null : v;
      else rest[k === 'roll_no' || k === 'RollNo' ? 'rollNo' : k] = v;
    }
    return Object.keys(responses).length ? { ...rest, responses } : rest;
  });
}

export const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);
