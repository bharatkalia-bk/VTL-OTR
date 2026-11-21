/**
 * Statistical anomaly detection for exam integrity. These are screening signals for a human reviewer,
 * never automatic decisions.
 */
export interface AnomalyFlag {
  type: 'CENTRE_SCORE_OUTLIER' | 'ANSWER_SIMILARITY' | 'FAST_HIGH_SCORE' | 'ATTENDANCE_BIOMETRIC_GAP';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  subject: string;
  detail: string;
  metric: number;
  ids?: string[];
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

/** Centres whose mean score is far above the overall distribution of centre means (robust z on median/MAD). */
export function centreOutliers(byCentre: Record<string, number[]>, zThreshold = 3, minCandidates = 5): AnomalyFlag[] {
  const centres = Object.entries(byCentre).filter(([, s]) => s.length >= minCandidates);
  if (centres.length < 3) return [];
  const means = centres.map(([, s]) => mean(s));
  const sorted = [...means].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)]!;
  const mad = [...means.map((m) => Math.abs(m - med))].sort((a, b) => a - b)[Math.floor(means.length / 2)]! || sd(means) / 1.4826 || 1;
  const out: AnomalyFlag[] = [];
  centres.forEach(([c], i) => {
    const z = (0.6745 * (means[i]! - med)) / mad;
    if (z >= zThreshold) out.push({ type: 'CENTRE_SCORE_OUTLIER', severity: z >= zThreshold * 1.5 ? 'HIGH' : 'MEDIUM', subject: c, detail: `Centre mean ${means[i]!.toFixed(1)} vs median ${med.toFixed(1)} (robust z ${z.toFixed(1)})`, metric: Math.round(z * 100) / 100 });
  });
  return out;
}

/**
 * Pairs of candidates in the same room/centre with many identical wrong answers. Identical correct answers
 * are expected; identical wrong answers are the classical copying signal.
 */
export function answerSimilarity(
  sheets: Array<{ id: string; group: string; responses: Record<string, string | null | undefined> }>,
  key: Record<string, string[]>,
  minSharedWrong = 8,
  maxPerGroup = 400,
): AnomalyFlag[] {
  const groups = new Map<string, typeof sheets>();
  for (const s of sheets) { const g = groups.get(s.group) ?? []; g.push(s); groups.set(s.group, g); }
  const out: AnomalyFlag[] = [];
  for (const [g, list] of groups) {
    const items = list.slice(0, maxPerGroup).map((s) => ({ id: s.id, wrong: new Map(Object.entries(s.responses).filter(([q, a]) => a && !(key[q] ?? []).includes(String(a).toUpperCase())).map(([q, a]) => [q, String(a).toUpperCase()])) }));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!, b = items[j]!;
        let shared = 0;
        for (const [q, ans] of a.wrong) if (b.wrong.get(q) === ans) shared++;
        if (shared >= minSharedWrong) {
          const ratio = shared / Math.max(1, Math.min(a.wrong.size, b.wrong.size));
          out.push({ type: 'ANSWER_SIMILARITY', severity: ratio > 0.8 ? 'HIGH' : 'MEDIUM', subject: g, detail: `${shared} identical wrong answers (${Math.round(ratio * 100)}% of wrong answers)`, metric: shared, ids: [a.id, b.id] });
        }
      }
    }
  }
  return out.sort((x, y) => y.metric - x.metric);
}

/** Very high scores achieved in an implausibly short active time (CBT timings). */
export function fastHighScores(rows: Array<{ id: string; scorePct: number; activeMinutes: number }>, minPct = 85, maxMinutes = 20): AnomalyFlag[] {
  return rows.filter((r) => r.scorePct >= minPct && r.activeMinutes > 0 && r.activeMinutes <= maxMinutes)
    .map((r) => ({ type: 'FAST_HIGH_SCORE' as const, severity: 'MEDIUM' as const, subject: r.id, detail: `${r.scorePct.toFixed(1)}% in ${r.activeMinutes} min`, metric: r.activeMinutes, ids: [r.id] }));
}

/**
 * Item analysis for answer-key review: compares how the top 27% and bottom 27% of scorers answered a question.
 * If top scorers overwhelmingly chose a different option than the key, the key is probably wrong.
 */
export function itemAnalysis(
  sheets: Array<{ total: number; responses: Record<string, string | null | undefined> }>,
  qno: number,
  keyed: string[],
): { difficulty: number; discrimination: number; topChoice: string | null; topChoiceShare: number; distribution: Record<string, number>; suspectKey: boolean } {
  const q = String(qno);
  const sorted = [...sheets].sort((a, b) => b.total - a.total);
  const k = Math.max(1, Math.round(sorted.length * 0.27));
  const top = sorted.slice(0, k), bottom = sorted.slice(-k);
  const isCorrect = (s: (typeof sheets)[number]) => keyed.includes(String(s.responses[q] ?? '').toUpperCase());
  const pTop = top.filter(isCorrect).length / top.length;
  const pBottom = bottom.filter(isCorrect).length / bottom.length;
  const distribution: Record<string, number> = {};
  for (const s of sheets) { const a = String(s.responses[q] ?? '-').toUpperCase() || '-'; distribution[a] = (distribution[a] ?? 0) + 1; }
  const topDist: Record<string, number> = {};
  for (const s of top) { const a = s.responses[q]; if (a) topDist[String(a).toUpperCase()] = (topDist[String(a).toUpperCase()] ?? 0) + 1; }
  const best = Object.entries(topDist).sort((a, b) => b[1] - a[1])[0];
  const topChoiceShare = best ? best[1] / top.length : 0;
  const difficulty = sheets.filter(isCorrect).length / (sheets.length || 1);
  const discrimination = Math.round((pTop - pBottom) * 1000) / 1000;
  const suspectKey = !!best && !keyed.includes(best[0]) && topChoiceShare >= 0.5 && discrimination < 0.1;
  return { difficulty: Math.round(difficulty * 1000) / 1000, discrimination, topChoice: best?.[0] ?? null, topChoiceShare: Math.round(topChoiceShare * 1000) / 1000, distribution, suspectKey };
}
