import { z } from 'zod';
import {
  CATEGORIES, CORRECTION_FIELDS, EDUCATION_LEVELS, EDUCATION_STATUSES, GENDERS, MARITAL_STATUSES, PWD_TYPES, RESULT_TYPES,
} from '../enums';
import { dobSchema, emailSchema, otpSchema, personNameSchema, pinSchema } from './common';

export const personalSchema = z.object({
  fullName: personNameSchema,
  fatherName: personNameSchema,
  motherName: personNameSchema,
  dob: dobSchema,
  gender: z.enum(GENDERS),
  nationality: z.enum(['INDIAN', 'NEPAL', 'BHUTAN', 'OTHER']).default('INDIAN'),
  maritalStatus: z.enum(MARITAL_STATUSES),
  identificationMark1: z.string().trim().min(3, 'validation.required').max(100),
  identificationMark2: z.string().trim().max(100).optional().or(z.literal('')),
});
export type PersonalInput = z.infer<typeof personalSchema>;

export const categorySchema = z
  .object({
    category: z.enum(CATEGORIES),
    pwd: z.boolean(),
    pwdType: z.enum(PWD_TYPES).optional().nullable(),
    pwdPercent: z.number().int().min(40).max(100).optional().nullable(),
    exServiceman: z.boolean(),
    serviceYears: z.number().int().min(0).max(40).optional().nullable(),
    domicileStateCode: z.string().min(2).max(3),
    categoryCertDocId: z.string().uuid().optional().nullable(),
    pwdCertDocId: z.string().uuid().optional().nullable(),
    exsmCertDocId: z.string().uuid().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.pwd && !v.pwdType) ctx.addIssue({ code: 'custom', path: ['pwdType'], message: 'validation.required' });
    if (v.pwd && !v.pwdPercent) ctx.addIssue({ code: 'custom', path: ['pwdPercent'], message: 'validation.pwdPercent' });
    if (v.exServiceman && (v.serviceYears === undefined || v.serviceYears === null))
      ctx.addIssue({ code: 'custom', path: ['serviceYears'], message: 'validation.required' });
  });
export type CategoryInput = z.infer<typeof categorySchema>;

export const addressLineSchema = z.object({
  line1: z.string().trim().min(3, 'validation.required').max(120),
  line2: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'validation.required').max(60),
  stateCode: z.string().min(2).max(3),
  districtId: z.number().int().positive(),
  pin: pinSchema,
});
export type AddressLine = z.infer<typeof addressLineSchema>;

export const addressSchema = z.object({
  permanent: addressLineSchema,
  correspondenceSameAsPermanent: z.boolean(),
  correspondence: addressLineSchema.optional(),
}).superRefine((v, ctx) => {
  if (!v.correspondenceSameAsPermanent && !v.correspondence)
    ctx.addIssue({ code: 'custom', path: ['correspondence'], message: 'validation.required' });
});
export type AddressInput = z.infer<typeof addressSchema>;

export const educationEntrySchema = z
  .object({
    level: z.enum(EDUCATION_LEVELS),
    qualificationName: z.string().trim().min(2).max(120),
    boardOrUniversity: z.string().trim().min(2).max(160),
    yearOfPassing: z.number().int().min(1960).max(2035),
    status: z.enum(EDUCATION_STATUSES),
    resultType: z.enum(RESULT_TYPES),
    marks: z.number().min(0).max(1000),
    maxMarks: z.number().min(1).max(1000).optional().nullable(),
    cgpaScale: z.number().min(4).max(10).optional().nullable(),
    rollNo: z.string().trim().max(30).optional().or(z.literal('')),
    documentId: z.string().uuid().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.resultType === 'PERCENT' && v.marks > 100 && !v.maxMarks)
      ctx.addIssue({ code: 'custom', path: ['maxMarks'], message: 'validation.required' });
    if (v.resultType === 'CGPA' && v.marks > (v.cgpaScale ?? 10))
      ctx.addIssue({ code: 'custom', path: ['marks'], message: 'validation.cgpaRange' });
  });
export type EducationEntry = z.infer<typeof educationEntrySchema>;

export const educationSchema = z.object({
  entries: z
    .array(educationEntrySchema)
    .min(1, 'validation.educationClass10')
    .refine((e) => e.some((x) => x.level === 'CLASS_10'), 'validation.educationClass10'),
});
export type EducationInput = z.infer<typeof educationSchema>;

export const declarationSchema = z.object({
  agreeTruth: z.literal(true, { errorMap: () => ({ message: 'validation.declaration' }) }),
  agreeConsent: z.literal(true, { errorMap: () => ({ message: 'validation.declaration' }) }),
  place: z.string().trim().min(2).max(60),
});
export type DeclarationInput = z.infer<typeof declarationSchema>;

/** Draft saves accept partial data; strict schemas apply on "continue" and submit. */
export const personalDraftSchema = personalSchema.partial();

export const contactChangeRequestSchema = z.object({ email: emailSchema.optional(), address: addressSchema.optional() });
export const contactChangeVerifySchema = z.object({ challengeId: z.string().min(10), otp: otpSchema });

export const correctionRequestSchema = z.object({
  field: z.enum(CORRECTION_FIELDS),
  requestedValue: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(10).max(1000),
  documentId: z.string().uuid(),
});
export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>;

export const decisionSchema = z.object({ reason: z.string().trim().min(3).max(1000) });
export const optionalDecisionSchema = z.object({ reason: z.string().trim().max(1000).optional() });
