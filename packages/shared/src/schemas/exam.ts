import { z } from 'zod';
import { eligibilityRuleSchema } from '../rules/eligibility';
import { feeRuleSchema } from '../rules/fees';
import { isoDateSchema } from './common';

export const examDatesSchema = z.object({
  notification: isoDateSchema,
  applyStart: isoDateSchema,
  applyEnd: isoDateSchema,
  feeLastDate: isoDateSchema,
  admitCardRelease: isoDateSchema.optional(),
  examDate: isoDateSchema.optional(),
  resultDate: isoDateSchema.optional(),
});
export type ExamDates = z.infer<typeof examDatesSchema>;

export const customFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{1,40}$/),
  labelEn: z.string().min(1).max(200),
  labelHi: z.string().min(1).max(200),
  type: z.enum(['text', 'number', 'select', 'boolean']),
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string(), labelEn: z.string(), labelHi: z.string() })).optional(),
  maxLength: z.number().int().optional(),
});
export type CustomField = z.infer<typeof customFieldSchema>;

export const examUpsertSchema = z.object({
  code: z.string().regex(/^[A-Z0-9-]{3,30}$/),
  titleEn: z.string().min(3).max(200),
  titleHi: z.string().min(3).max(200),
  notificationNo: z.string().min(3).max(60),
  conductingBody: z.string().min(2).max(200),
  descriptionEn: z.string().max(5000).default(''),
  descriptionHi: z.string().max(5000).default(''),
  dates: examDatesSchema,
  ageCutoffDate: isoDateSchema,
  maxCentrePreferences: z.number().int().min(1).max(10).default(3),
  customFields: z.array(customFieldSchema).default([]),
  rollNoPrefix: z.string().regex(/^[A-Z0-9]{2,8}$/).default('VTL'),
  /** Selection stages in order; INTERVIEW last when present. */
  stages: z.array(z.enum(['TIER1', 'TIER2', 'INTERVIEW'])).min(1).max(3).default(['TIER1'])
    .refine((s) => s[0] === 'TIER1' && new Set(s).size === s.length && (!s.includes('INTERVIEW') || s[s.length - 1] === 'INTERVIEW'), { message: 'Stages must start with TIER1, be unique, and end with INTERVIEW if used' }),
  objectionFee: z.number().int().min(0).max(5000).default(100),
  writtenWeight: z.number().int().min(0).max(100).default(100),
  interviewWeight: z.number().int().min(0).max(100).default(0),
});
export type ExamUpsertInput = z.infer<typeof examUpsertSchema>;

export const postUpsertSchema = z.object({
  code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
  titleEn: z.string().min(2).max(200),
  titleHi: z.string().min(2).max(200),
  vacancies: z.record(z.string(), z.number().int().min(0)).default({}),
  eligibility: eligibilityRuleSchema,
});
export type PostUpsertInput = z.infer<typeof postUpsertSchema>;

export const feeRulesUpsertSchema = z.object({ rules: z.array(feeRuleSchema).min(1) });

export const centreCityUpsertSchema = z.object({
  cityName: z.string().min(2).max(80),
  stateCode: z.string().min(2).max(3),
  centres: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
        name: z.string().min(2).max(200),
        address: z.string().min(5).max(400),
        capacity: z.number().int().min(1).max(100000),
        reportingTime: z.string().regex(/^\d{2}:\d{2}$/),
        gateClosingTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .default([]),
});

export const applicationDraftSchema = z.object({
  examId: z.string().uuid(),
  postIds: z.array(z.string().uuid()).min(1, 'validation.postRequired'),
  centreCityIds: z.array(z.string().uuid()).min(1, 'validation.centreRequired'),
  customFieldValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type ApplicationDraftInput = z.infer<typeof applicationDraftSchema>;
