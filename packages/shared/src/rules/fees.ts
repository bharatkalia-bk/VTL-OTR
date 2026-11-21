import { z } from 'zod';
import { CATEGORIES, GENDERS, type Category, type Gender } from '../enums';

export const feeRuleSchema = z.object({
  priority: z.number().int(),
  label: z.string().min(1).max(120),
  amount: z.number().int().min(0).max(100000),
  conditions: z
    .object({
      categories: z.array(z.enum(CATEGORIES)).optional(),
      genders: z.array(z.enum(GENDERS)).optional(),
      pwd: z.boolean().optional(),
      exServiceman: z.boolean().optional(),
      domicileStateCodes: z.array(z.string()).optional(),
    })
    .default({}),
});
export type FeeRule = z.infer<typeof feeRuleSchema>;

export interface FeeProfile {
  category: Category;
  gender: Gender;
  pwd: boolean;
  exServiceman: boolean;
  domicileStateCode?: string | null;
}

export interface FeeResult {
  amount: number;
  exempt: boolean;
  ruleLabel: string;
}

export function ruleMatches(rule: FeeRule, p: FeeProfile): boolean {
  const c = rule.conditions;
  if (c.categories && !c.categories.includes(p.category)) return false;
  if (c.genders && !c.genders.includes(p.gender)) return false;
  if (c.pwd !== undefined && c.pwd !== p.pwd) return false;
  if (c.exServiceman !== undefined && c.exServiceman !== p.exServiceman) return false;
  if (c.domicileStateCodes && (!p.domicileStateCode || !c.domicileStateCodes.includes(p.domicileStateCode))) return false;
  return true;
}

/**
 * Lowest priority number wins (evaluated in ascending order). If nothing matches,
 * the candidate is charged the highest amount in the matrix (safe default for a
 * misconfigured matrix: never accidentally exempt).
 */
export function calculateFee(rules: FeeRule[], p: FeeProfile): FeeResult {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const hit = sorted.find((r) => ruleMatches(r, p));
  if (hit) return { amount: hit.amount, exempt: hit.amount === 0, ruleLabel: hit.label };
  const max = rules.reduce((m, r) => Math.max(m, r.amount), 0);
  return { amount: max, exempt: max === 0, ruleLabel: 'DEFAULT_MAX' };
}

/** Default matrix used by seeds and new exams. */
export const DEFAULT_FEE_RULES: FeeRule[] = [
  { priority: 10, label: 'Women: exempt', amount: 0, conditions: { genders: ['FEMALE'] } },
  { priority: 20, label: 'SC/ST: exempt', amount: 0, conditions: { categories: ['SC', 'ST'] } },
  { priority: 30, label: 'PwD: exempt', amount: 0, conditions: { pwd: true } },
  { priority: 40, label: 'Ex-servicemen: exempt', amount: 0, conditions: { exServiceman: true } },
  { priority: 100, label: 'General/EWS/OBC', amount: 100, conditions: {} },
];
