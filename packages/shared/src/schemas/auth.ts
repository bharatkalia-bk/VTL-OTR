import { z } from 'zod';
import { GENDERS } from '../enums';
import { captchaSchema, dobSchema, emailSchema, mobileSchema, otpSchema, passwordSchema, personNameSchema } from './common';

export const CONSENT_NOTICE_VERSION = '2026.1';

export const registerStartSchema = z
  .object({
    fullName: personNameSchema,
    fatherName: personNameSchema,
    dob: dobSchema,
    gender: z.enum(GENDERS),
    mobile: mobileSchema,
    email: emailSchema,
    consent: z.literal(true, { errorMap: () => ({ message: 'validation.consent' }) }),
    consentNoticeVersion: z.string().default(CONSENT_NOTICE_VERSION),
    language: z.enum(['en', 'hi']).default('en'),
  })
  .merge(captchaSchema);
export type RegisterStartInput = z.infer<typeof registerStartSchema>;

export const registerVerifySchema = z.object({
  registrationId: z.string().min(10),
  mobileOtp: otpSchema,
  emailOtp: otpSchema,
});
export type RegisterVerifyInput = z.infer<typeof registerVerifySchema>;

export const setPasswordSchema = z
  .object({ registrationToken: z.string().min(10), password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'validation.passwordMatch' });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/** Identifier may be OTR ID, mobile or email. */
export const loginSchema = z
  .object({ identifier: z.string().trim().min(5).max(254), password: z.string().min(1).max(64) })
  .merge(captchaSchema);
export type LoginInput = z.infer<typeof loginSchema>;

export const otpLoginRequestSchema = z.object({ identifier: z.string().trim().min(5).max(254) }).merge(captchaSchema);
export const otpLoginVerifySchema = z.object({ challengeId: z.string().min(10), otp: otpSchema });

export const forgotOtrSchema = z.object({ identifier: z.string().trim().min(5).max(254), dob: dobSchema }).merge(captchaSchema);
export const forgotPasswordRequestSchema = z.object({ identifier: z.string().trim().min(5).max(254) }).merge(captchaSchema);
export const forgotPasswordResetSchema = z
  .object({ challengeId: z.string().min(10), otp: otpSchema, password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'validation.passwordMatch' });

export const adminLoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$|^[A-Z0-9]{10}$/) });
/** Staff login second step: the 6-digit code sent to the staff member's email. */
export const staffOtpSchema = z.object({ challengeId: z.string().min(8).max(64), code: z.string().regex(/^\d{6}$/, 'validation.otp') });

export interface SessionUser {
  id: string;
  type: 'CANDIDATE' | 'ADMIN';
  otrId?: string | null;
  name: string;
  roles?: string[];
  status?: string;
  totpVerified?: boolean;
  language?: 'en' | 'hi';
}
