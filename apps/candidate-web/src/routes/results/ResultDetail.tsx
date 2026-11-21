import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Skeleton, Textarea, buttonVariants, cn } from '@vtl/ui';
import { FileUp, Scale, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { errorMessage } from '../../lib/forms';

interface Sheet {
  exam: { id: string; code: string; title: string; objectionFee: number }; rollNo: string | null; shift: { code: string; date: string; mode: string } | null; attendance: string | null;
  sheet: { source: string; responses: Record<string, string | null>; receivedAt: string; carbonCopy: boolean; carbonUploadedAt: string | null } | null;
  paper: { id: string; questionCount: number; marksCorrect: number; marksWrong: number; objectionDeadline: string | null; finalPublishedAt: string | null; dropped: number[] } | null;
  key: Record<string, string[]> | null; keyType: 'FINAL' | 'PROVISIONAL' | null;
  breakdown: { raw: number; correct: number; wrong: number; unattempted: number; outcomes: Record<string, string>; sectionScores: Record<string, number> } | null;
  objections: Array<{ id: string; qno: number; claimedOptions: string[]; status: string; fee: number; decisionNote: string | null }>;
  objectionWindowOpen: boolean;
}
interface ScoreCard { id: string; stage: string; raw: number; normalised: number | null; percentile: number | null; correct: number; wrong: number; unattempted: number; sectionScores: Record<string, number>; rank: number | null; categoryRank: number | null; qualified: boolean; withheld: boolean; cutoffs: Record<string, number> }
const tone: Record<string, string> = { CORRECT: 'bg-success-50 text-success-700', WRONG: 'bg-danger-50 text-danger-700', UNATTEMPTED: 'bg-surface text-ink-muted', DROPPED: 'bg-info-50 text-info-700' };

export default function ResultDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useQuery({ queryKey: ['sheet', id], queryFn: () => api.get<Sheet>(`/me/applications/${id}/response-sheet`) });
  const cards = useQuery({ queryKey: ['my-results', id], queryFn: () => api.get<ScoreCard[]>(`/me/applications/${id}/results`) });
  const [f, setF] = useState({ qno: '', options: '', reasoning: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); setMsg(null); try { await fn(); if (ok) setMsg({ tone: 'success', text: ok }); await q.refetch(); } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e, t) }); } finally { setBusy(false); } };
  const d = q.data;
  if (!d) return <Page><Skeleton className="h-64" /></Page>;
  const p = d.paper;
  const submit = (e: FormEvent) => { e.preventDefault(); void act(async () => {
    const o = await api.post<{ id: string; status: string }>(`/me/applications/${id}/objections`, { qno: Number(f.qno), claimedOptions: f.options.toUpperCase().split(/[\s,/+]+/).filter(Boolean), reasoning: f.reasoning });
    setF({ qno: '', options: '', reasoning: '' });
    if (o.status === 'PAYMENT_PENDING') { const r = await api.post<{ redirectUrl: string }>(`/me/objections/${o.id}/pay`); window.location.assign(r.redirectUrl); }
  }); };
  return (
    <>
      <PageHeader title={d.exam.title} description={<span className="tabular-nums">{d.rollNo}{d.shift && ` · ${t('route.shift', { code: d.shift.code, time: fmtDate(d.shift.date, lang) })}`}</span>} />
      <Page>
        {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}
        {(cards.data?.length ?? 0) > 0 && (
          <section aria-labelledby="sc" className="mb-6">
            <h2 id="sc" className="mb-3 flex items-center gap-2 text-xl font-bold"><Trophy className="h-5 w-5 text-orange" aria-hidden />{t('results.scoreCards')}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {cards.data!.map((c) => (
                <Card key={c.id} className="overflow-hidden">
                  <div className={cn('flex items-center justify-between bg-gradient-to-r px-5 py-4 text-white', c.withheld ? 'from-navy-600 to-navy' : c.qualified ? 'from-navy to-orange-700' : 'from-navy to-navy-600')}>
                    <p className="font-heading text-lg font-bold">{t(`results.STAGE_${c.stage}`)}</p>
                    <Badge tone={c.withheld ? 'warning' : c.qualified ? 'success' : 'neutral'}>{c.withheld ? t('results.withheld') : c.qualified ? t('results.qualified') : t('results.notQualified')}</Badge>
                  </div>
                  <CardBody>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div><dt className="text-xs text-ink-muted">{c.stage === 'FINAL' ? t('results.final') : t('results.raw')}</dt><dd className="font-heading text-2xl font-bold tabular-nums">{c.raw}</dd></div>
                      {c.stage !== 'FINAL' && c.normalised !== null && <div><dt className="text-xs text-ink-muted">{t('results.normalised')}</dt><dd className="font-heading text-2xl font-bold tabular-nums">{c.normalised}</dd></div>}
                      {c.percentile !== null && <div><dt className="text-xs text-ink-muted">{t('results.percentile')}</dt><dd className="font-heading text-2xl font-bold tabular-nums">{c.percentile.toFixed(2)}</dd></div>}
                      {c.rank !== null && <div><dt className="text-xs text-ink-muted">{t('results.rank')}</dt><dd className="text-lg font-semibold tabular-nums">{c.rank}</dd></div>}
                      {c.categoryRank !== null && <div><dt className="text-xs text-ink-muted">{t('results.categoryRank')}</dt><dd className="text-lg font-semibold tabular-nums">{c.categoryRank}</dd></div>}
                    </dl>
                    {Object.keys(c.sectionScores).length > 0 && <p className="mt-3 text-sm"><span className="text-ink-muted">{t('results.sections')}:</span> {Object.entries(c.sectionScores).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
                    {Object.keys(c.cutoffs).length > 0 && <p className="mt-1 text-sm"><span className="text-ink-muted">{t('results.cutoff')}:</span> {Object.entries(c.cutoffs).map(([k, v]) => `${k.replace('_NCL', '')} ${v}`).join(' · ')}</p>}
                    {c.stage === 'TIER1' && <p className="mt-2 text-xs text-ink-muted">{t('results.normNote')}</p>}
                  </CardBody>
                </Card>
              ))}
            </div>
            <Link to={`/selection/${id}`} className={cn(buttonVariants({ variant: 'secondary' }), 'mt-4')}>{t('results.goSelection')}</Link>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title={t('results.responseSheet')} description={d.keyType ? (d.keyType === 'FINAL' ? t('results.keyFinal') : t('results.keyProvisional')) : t('results.noKey')} />
            <CardBody>
              {!d.sheet ? <Alert tone="info">{t('results.noSheet')}</Alert> : (
                <>
                  {d.breakdown && p && <Alert tone="info" className="mb-3">{t('results.tentative', { type: d.keyType === 'FINAL' ? t('results.keyFinal') : t('results.keyProvisional'), raw: d.breakdown.raw, correct: d.breakdown.correct, wrong: d.breakdown.wrong, un: d.breakdown.unattempted, plus: p.marksCorrect, minus: p.marksWrong })}</Alert>}
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-5" role="list" aria-label={t('results.responseSheet')}>
                    {Array.from({ length: p?.questionCount ?? Object.keys(d.sheet.responses).length }, (_, i) => String(i + 1)).map((qn) => {
                      const o = d.breakdown?.outcomes[qn];
                      return (
                        <div key={qn} role="listitem" className={cn('rounded border border-border px-2 py-1.5 text-xs', o ? tone[o] : 'bg-white')} title={o ? t(`results.${o}`) : undefined}>
                          <span className="font-semibold">{t('results.q')}{qn}</span> · {d.sheet!.responses[qn] ?? '-'}{d.key && <span className="text-ink-muted"> / {d.key[qn]?.join('/')}</span>}
                          {o && <span className="sr-only"> {t(`results.${o}`)}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">{t('results.yourAnswer')} / {t('results.key')}</p>
                </>
              )}
            </CardBody>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Scale className="h-5 w-5 text-orange" aria-hidden />{t('results.objectionTitle')}</span>} />
              <CardBody className="space-y-3">
                {d.objectionWindowOpen && p?.objectionDeadline ? (
                  <>
                    <p className="text-sm">{t('results.objectionWindow', { date: fmtDateTime(p.objectionDeadline, lang), fee: d.exam.objectionFee })}</p>
                    <form onSubmit={submit} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t('results.question')} required>{(x) => <Input id={x.id} type="number" min={1} max={p.questionCount} value={f.qno} onChange={(e) => setF({ ...f, qno: e.target.value })} />}</Field>
                        <Field label={t('results.claimed')} required>{(x) => <Input id={x.id} value={f.options} onChange={(e) => setF({ ...f, options: e.target.value.toUpperCase() })} placeholder="B" maxLength={9} />}</Field>
                      </div>
                      <Field label={t('results.reasoning')} required>{(x) => <Textarea id={x.id} value={f.reasoning} onChange={(e) => setF({ ...f, reasoning: e.target.value })} />}</Field>
                      <Button type="submit" variant="primary" loading={busy} disabled={!f.qno || !f.options || f.reasoning.length < 30}>{t('results.submitObjection')}</Button>
                    </form>
                  </>
                ) : <p className="text-sm text-ink-muted">{d.keyType ? t('results.objectionClosed') : t('results.noKey')}</p>}
                {d.objections.length > 0 && (
                  <div><p className="text-sm font-semibold">{t('results.myObjections')}</p>
                    <ul className="mt-1 divide-y divide-border text-sm">{d.objections.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>{t('results.q')}{o.qno} → {o.claimedOptions.join('/')}{o.decisionNote && <span className="block text-xs text-ink-muted">{o.decisionNote}</span>}</span>
                        <span className="flex items-center gap-2"><Badge tone={o.status === 'ACCEPTED' ? 'success' : o.status === 'REJECTED' ? 'danger' : 'warning'}>{t(`results.${o.status}`)}</Badge>
                          {o.status === 'PAYMENT_PENDING' && <><Button size="sm" variant="primary" loading={busy} onClick={() => void act(async () => { const r = await api.post<{ redirectUrl: string }>(`/me/objections/${o.id}/pay`); window.location.assign(r.redirectUrl); })}>{t('results.pay', { fee: o.fee })}</Button><Button size="sm" variant="ghost" onClick={() => void act(() => api.del(`/me/objections/${o.id}`))}>{t('results.withdraw')}</Button></>}</span>
                      </li>
                    ))}</ul>
                  </div>
                )}
              </CardBody>
            </Card>
            {d.shift?.mode === 'OMR' && d.sheet && (
              <Card>
                <CardHeader title={t('results.omrTitle')} description={t('results.omrBody')} />
                <CardBody>
                  {d.sheet.carbonUploadedAt && <Alert tone="success" className="mb-3">{t('results.omrDone', { date: fmtDateTime(d.sheet.carbonUploadedAt, lang) })}</Alert>}
                  <label className="flex cursor-pointer items-center gap-2 rounded-card border-2 border-dashed border-border p-4 text-sm hover:border-orange">
                    <FileUp className="h-5 w-5 text-orange" aria-hidden />{t('results.omrUpload')}
                    <input type="file" className="sr-only" accept="image/jpeg,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void act(() => { const fd = new FormData(); fd.append('file', file); return api.upload(`/me/applications/${id}/omr-carbon`, fd); }); }} />
                  </label>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </Page>
    </>
  );
}
