import { z } from 'zod';

export const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'validation.mobile');
export const emailSchema = z.string().trim().toLowerCase().email('validation.email').max(254);
export const otpSchema = z.string().regex(/^\d{6}$/, 'validation.otp');
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.date');
export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'validation.nameMin')
  .max(100, 'validation.nameMax')
  .regex(/^[A-Za-z][A-Za-z .'-]*$/, 'validation.nameChars');
export const pinSchema = z.string().regex(/^[1-9]\d{5}$/, 'validation.pin');
export const passwordSchema = z
  .string()
  .min(8, 'validation.passwordMin')
  .max(64, 'validation.passwordMax')
  .regex(/[A-Z]/, 'validation.passwordUpper')
  .regex(/[a-z]/, 'validation.passwordLower')
  .regex(/\d/, 'validation.passwordDigit')
  .regex(/[^A-Za-z0-9]/, 'validation.passwordSymbol');
export const captchaSchema = z.object({ captchaId: z.string().min(8).max(64), captchaText: z.string().min(1).max(10) });

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

/** DOB must be in the past and the candidate at least 14 years old. */
export const dobSchema = isoDateSchema.refine((d) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  const age = (now - t) / (365.25 * 24 * 3600 * 1000);
  return age >= 14 && age <= 70;
}, 'validation.dobRange');
