/**
 * Objective test scoring with negative marking, dropped questions and multi-answer keys.
 * Keys and responses use 1-based question numbers as string keys: { "1": "A" }.
 */
export type AnswerKey = Record<string, string[]>;
export type Responses = Record<string, string | null | undefined>;

export interface PaperScheme {
  questionCount: number;
  marksCorrect: number;
  /** Positive number deducted per wrong answer (e.g. 0.5). */
  marksWrong: number;
  /** Questions dropped after objections: everyone gets full marks for them. */
  dropped?: number[];
  sections?: Array<{ name: string; from: number; to: number }>;
}

export interface ScoreBreakdown {
  raw: number;
  correct: number;
  wrong: number;
  unattempted: number;
  dropped: number;
  sectionScores: Record<string, number>;
  /** Per question outcome, for the candidate's response sheet. */
  outcomes: Record<string, 'CORRECT' | 'WRONG' | 'UNATTEMPTED' | 'DROPPED'>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normaliseOption(o: string | null | undefined): string | null {
  if (o === null || o === undefined) return null;
  const t = String(o).trim().toUpperCase();
  return t === '' || t === '-' || t === '*' ? null : t;
}

export function scoreResponses(responses: Responses, key: AnswerKey, scheme: PaperScheme): ScoreBreakdown {
  const dropped = new Set(scheme.dropped ?? []);
  const out: ScoreBreakdown = { raw: 0, correct: 0, wrong: 0, unattempted: 0, dropped: 0, sectionScores: {}, outcomes: {} };
  const sectionOf = (q: number) => scheme.sections?.find((s) => q >= s.from && q <= s.to)?.name ?? 'Total';
  for (let q = 1; q <= scheme.questionCount; q++) {
    const k = String(q);
    const sec = sectionOf(q);
    out.sectionScores[sec] ??= 0;
    let marks = 0;
    if (dropped.has(q)) {
      out.dropped++;
      out.outcomes[k] = 'DROPPED';
      marks = scheme.marksCorrect;
    } else {
      const ans = normaliseOption(responses[k]);
      const correct = (key[k] ?? []).map((x) => x.toUpperCase());
      if (!ans) { out.unattempted++; out.outcomes[k] = 'UNATTEMPTED'; }
      else if (correct.includes(ans)) { out.correct++; out.outcomes[k] = 'CORRECT'; marks = scheme.marksCorrect; }
      else { out.wrong++; out.outcomes[k] = 'WRONG'; marks = -scheme.marksWrong; }
    }
    out.raw += marks;
    out.sectionScores[sec] += marks;
  }
  out.raw = round2(out.raw);
  for (const s of Object.keys(out.sectionScores)) out.sectionScores[s] = round2(out.sectionScores[s]!);
  return out;
}

/** Applies accepted objection decisions to a provisional key. */
export function applyKeyChanges(provisional: AnswerKey, changes: Array<{ qno: number; to: string[] | 'DROP' }>): { key: AnswerKey; dropped: number[] } {
  const key: AnswerKey = { ...provisional };
  const dropped: number[] = [];
  for (const c of changes) {
    if (c.to === 'DROP') dropped.push(c.qno);
    else key[String(c.qno)] = c.to.map((x) => x.toUpperCase());
  }
  return { key, dropped: [...new Set(dropped)].sort((a, b) => a - b) };
}
