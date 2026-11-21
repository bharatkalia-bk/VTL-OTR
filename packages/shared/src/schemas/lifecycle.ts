import { z } from 'zod';
import { CATEGORIES, TICKET_CATEGORIES } from '../enums';

const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const option = z.string().trim().toUpperCase().regex(/^[A-E]$/, 'Option must be A to E');
const responses = z.record(z.string().regex(/^\d{1,3}$/), z.union([option, z.null(), z.literal('')]).transform((v) => (v ? v : null)));

export const STAGES = ['TIER1', 'TIER2', 'INTERVIEW'] as const;
export type Stage = (typeof STAGES)[number];

// ── Exam day ──
export const shiftSchema = z.object({
  stage: z.enum(STAGES).default('TIER1'), code: z.string().trim().min(1).max(20), date: isoDate, startTime: time, endTime: time, mode: z.enum(['CBT', 'OMR']).default('CBT'),
});
export const assignShiftsSchema = z.object({ strategy: z.enum(['ROUND_ROBIN', 'BY_CENTRE']).default('ROUND_ROBIN') });
export const markAttendanceSchema = z.object({
  token: z.string().max(600).optional(), rollNo: z.string().max(40).optional(),
  status: z.enum(['PRESENT', 'ABSENT']).default('PRESENT'), faceCheck: z.enum(['MATCH', 'MISMATCH', 'SKIPPED']).default('SKIPPED'), note: z.string().max(300).optional(),
}).refine((x) => x.token || x.rollNo, { message: 'Scan the QR code or enter a roll number', path: ['rollNo'] });

export const observerAssignSchema = z.object({ observerId: z.string().uuid(), centreId: z.string().uuid(), shiftId: z.string().uuid().optional() });
export const coiDeclarationSchema = z.object({ hasConflict: z.boolean(), note: z.string().max(500).optional(), confirm: z.literal(true) });
export const OBSERVER_REPORT_KINDS = ['ARRIVAL', 'CHECKLIST', 'INCIDENT', 'FINAL'] as const;
export const observerReportSchema = z.object({
  clientId: z.string().min(8).max(64), assignmentId: z.string().uuid(), kind: z.enum(OBSERVER_REPORT_KINDS),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH']).default('INFO'),
  payload: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])),
  capturedAt: z.string().datetime(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
});
export const observerSyncSchema = z.object({ reports: z.array(observerReportSchema).min(1).max(200) });

export const BIOMETRIC_KINDS = ['FACE_MISMATCH', 'FINGERPRINT_MISMATCH', 'DUPLICATE_BIOMETRIC', 'NOT_CAPTURED'] as const;
export const biometricAlertSchema = z.object({ rollNo: z.string().min(1).max(40), kind: z.enum(BIOMETRIC_KINDS), score: z.number().min(0).max(1).optional(), note: z.string().max(300).optional() });
export const alertReviewSchema = z.object({ decision: z.enum(['CLEARED', 'CONFIRMED']), note: z.string().trim().min(3).max(500) });

export const AGENCY_SCOPES = ['CBT_RESPONSES', 'OMR_READS', 'ATTENDANCE', 'BIOMETRIC_ALERTS'] as const;
export type AgencyScope = (typeof AGENCY_SCOPES)[number];
export const agencyKeySchema = z.object({ name: z.string().trim().min(3).max(80), examId: z.string().uuid().optional(), scopes: z.array(z.enum(AGENCY_SCOPES)).min(1) });
export const agencyRecordSchemas = {
  CBT_RESPONSES: z.object({ rollNo: z.string().min(1).max(40), responses, activeMinutes: z.coerce.number().min(0).max(600).optional() }),
  OMR_READS: z.object({ rollNo: z.string().min(1).max(40), responses, scanRef: z.string().max(200).optional() }),
  ATTENDANCE: z.object({ rollNo: z.string().min(1).max(40), status: z.enum(['PRESENT', 'ABSENT']) }),
  BIOMETRIC_ALERTS: biometricAlertSchema,
} as const;
export const agencyUploadSchema = z.object({
  kind: z.enum(AGENCY_SCOPES), fileName: z.string().max(200).optional(),
  /** CSV text (UI upload) or JSON records (API). One of the two. */
  csv: z.string().max(5_000_000).optional(), records: z.array(z.unknown()).max(50_000).optional(),
}).refine((x) => !!x.csv !== !!x.records, { message: 'Send either csv or records', path: ['records'] });

export const TECH_EXCEPTION_KINDS = ['SYSTEM_FAILURE', 'POWER', 'NETWORK', 'OMR_DAMAGED', 'OTHER'] as const;
export const techExceptionSchema = z.object({
  shiftId: z.string().uuid().optional(), rollNos: z.array(z.string().max(40)).max(500).default([]),
  kind: z.enum(TECH_EXCEPTION_KINDS), minutesLost: z.number().int().min(0).max(600).default(0), description: z.string().trim().min(10).max(2000),
});
export const techDecisionSchema = z.object({ status: z.enum(['COMPENSATED', 'RE_EXAM', 'REJECTED']), resolution: z.string().trim().min(3).max(1000), compensationMinutes: z.number().int().min(0).max(300).optional() });

// ── Assessment ──
export const paperSchema = z.object({
  questionCount: z.number().int().min(1).max(500), marksCorrect: z.number().min(0).max(20), marksWrong: z.number().min(0).max(20),
  sections: z.array(z.object({ name: z.string().min(1).max(60), from: z.number().int().min(1), to: z.number().int().min(1) })).max(20).default([]),
});
export const answerKeySchema = z.object({ key: z.record(z.string().regex(/^\d{1,3}$/), z.array(option).min(1).max(5)), objectionDays: z.number().int().min(1).max(15).default(3) });
export const objectionCreateSchema = z.object({ qno: z.number().int().min(1).max(500), claimedOptions: z.array(option).min(1).max(5), reasoning: z.string().trim().min(30).max(3000) });
export const objectionDecisionSchema = z.object({ decision: z.enum(['CHANGE_KEY', 'DROP', 'REJECT']), newOptions: z.array(option).max(5).optional(), note: z.string().trim().min(5).max(1000) })
  .refine((x) => x.decision !== 'CHANGE_KEY' || (x.newOptions?.length ?? 0) > 0, { message: 'Give the corrected option(s)', path: ['newOptions'] });

const cutoffs = z.record(z.enum([...CATEGORIES, 'PWD'] as [string, ...string[]]), z.number().min(-1000).max(1000));
export const RESULT_STAGES = ['TIER1', 'TIER2', 'INTERVIEW', 'FINAL'] as const;
export type ResultStage = (typeof RESULT_STAGES)[number];
export const resultComputeSchema = z.object({ stage: z.enum(RESULT_STAGES), cutoffs: cutoffs.default({}), baseShiftId: z.string().uuid().optional() });
export const resultDecisionSchema = z.object({ approve: z.boolean(), note: z.string().max(500).optional() });

export const debarmentSchema = z.object({
  otrId: z.string().min(5).max(40), scope: z.enum(['ALL', 'EXAM']), examId: z.string().uuid().optional(),
  reason: z.string().trim().min(10).max(2000), sourceType: z.enum(['MANUAL', 'OBSERVER_REPORT', 'BIOMETRIC', 'ANOMALY']).default('MANUAL'), sourceId: z.string().max(80).optional(),
  fromDate: isoDate, untilDate: isoDate.optional(), evidence: z.array(z.string().max(500)).max(20).default([]),
}).refine((x) => x.scope === 'ALL' || !!x.examId, { message: 'Choose the exam', path: ['examId'] })
  .refine((x) => !x.untilDate || x.untilDate > x.fromDate, { message: 'End date must be after start date', path: ['untilDate'] });

// ── Selection ──
export const shortlistSchema = z.object({ toStage: z.enum(['TIER2', 'INTERVIEW']), multiplier: z.number().min(1).max(10).default(3), venue: z.string().max(200).optional() });
export const panelSchema = z.object({
  name: z.string().trim().min(2).max(80), memberIds: z.array(z.string().uuid()).min(1).max(7), date: isoDate, venue: z.string().trim().min(2).max(200),
  criteria: z.array(z.object({ key: z.string().regex(/^[a-z_]{2,30}$/), label: z.string().min(2).max(60), max: z.number().int().min(1).max(100) })).min(1).max(10),
});
export const panelMarkSchema = z.object({ marks: z.record(z.string(), z.number().min(0).max(100)), remarks: z.string().max(1000).optional() });
export const vacancySchema = z.object({ rows: z.array(z.object({ postId: z.string().uuid(), orgCode: z.string().trim().min(2).max(20), orgName: z.string().trim().min(2).max(120), category: z.enum(CATEGORIES), count: z.number().int().min(0).max(100000) })).min(1).max(2000) });
export const preferencesSchema = z.object({ prefs: z.array(z.string().max(80)).min(1).max(60) });
export const dvScheduleSchema = z.object({ date: isoDate, venue: z.string().trim().min(3).max(200), slots: z.array(z.string().max(20)).min(1).max(12), perSlot: z.number().int().min(1).max(500) });
export const dvUpdateSchema = z.object({
  status: z.enum(['REPORTED', 'VERIFIED', 'DEFICIENT', 'ABSENT']),
  checklist: z.array(z.object({ item: z.string().max(100), status: z.enum(['OK', 'MISMATCH', 'MISSING', 'NA']), note: z.string().max(300).optional() })).max(40).default([]),
  remarks: z.string().max(1000).optional(),
});

// ── Helpdesk channels ──
export const chatMessageSchema = z.object({ sessionId: z.string().uuid().optional(), message: z.string().trim().min(1).max(1000), lang: z.enum(['en', 'hi']).default('en') });
export const ivrStepSchema = z.object({ callId: z.string().uuid().optional(), from: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'), digits: z.string().regex(/^[0-9*#]{0,12}$/).default(''), lang: z.enum(['en', 'hi']).default('en') });
export const phoneTicketSchema = z.object({
  otrId: z.string().max(40).optional(), callerName: z.string().trim().min(2).max(80), mobile: z.string().regex(/^[6-9]\d{9}$/),
  category: z.enum(TICKET_CATEGORIES), subject: z.string().trim().min(5).max(150), notes: z.string().trim().min(5).max(3000), resolved: z.boolean().default(false),
});
export const stageMarksSchema = z.object({ csv: z.string().min(10).max(2_000_000) });
