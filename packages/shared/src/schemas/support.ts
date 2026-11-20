import { z } from 'zod';
import { TICKET_CATEGORIES, TICKET_STATUSES } from '../enums';
import { captchaSchema, emailSchema, mobileSchema } from './common';

export const ticketCreateSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: z.string().trim().min(5).max(150),
  message: z.string().trim().min(10).max(3000),
  attachmentId: z.string().uuid().optional().nullable(),
});
export const publicTicketCreateSchema = ticketCreateSchema
  .extend({ name: z.string().trim().min(2).max(100), mobile: mobileSchema, email: emailSchema })
  .merge(captchaSchema);
export const ticketMessageSchema = z.object({ message: z.string().trim().min(1).max(3000), attachmentId: z.string().uuid().optional().nullable() });
export const ticketStatusSchema = z.object({ status: z.enum(TICKET_STATUSES) });

export const templateUpsertSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{3,40}$/),
  channel: z.enum(['SMS', 'EMAIL']),
  language: z.enum(['en', 'hi']),
  subject: z.string().max(200).default(''),
  body: z.string().min(1).max(5000),
  dltTemplateId: z.string().max(40).optional().nullable(),
});

export const campaignFilterSchema = z.object({
  examId: z.string().uuid().optional(),
  applicationStatus: z.string().optional(),
  stateCode: z.string().optional(),
  category: z.string().optional(),
  candidateStatus: z.string().optional(),
});
export const campaignCreateSchema = z.object({
  name: z.string().min(3).max(120),
  templateCode: z.string(),
  filters: campaignFilterSchema,
  dryRun: z.boolean().default(false),
});
