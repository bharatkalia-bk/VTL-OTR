import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Skeleton } from '@vtl/ui';
import { ArrowDown, ArrowUp, Building2, Download, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { api, ApiError } from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { errorMessage } from '../../lib/forms';

interface Sel { exam: { title: string; titleHi: string; stages: string[] }; calls: Array<{ stage: string; status: string; rollNo: string | null; slotAt: string | null; venue: string | null }>; allotment: { orgName: string; prefNo: number; category: string; status: string; round: number } | null; dv: { date: string; slot: string; venue: string; status: string; remarks: string | null } | null }
interface Opt { key: string; postTitle: string; postTitleHi: string; orgCode: string; orgName: string; seats: number }
interface Prefs { qualified: boolean; rank: number | null; options: Opt[]; prefs: string[]; submittedAt: string | null; locked: boolean }

export default function Selection() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const sel = useQuery({ queryKey: ['selection', id], queryFn: () => api.get<Sel>(`/me/applications/${id}/selection`) });
  const prefs = useQuery({ queryKey: ['prefs', id], queryFn: () => api.get<Prefs>(`/me/applications/${id}/preferences`), retry: false });
  const [order, setOrder] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); setMsg(null); try { await fn(); if (ok) setMsg({ tone: 'success', text: ok }); await Promise.all([sel.refetch(), prefs.refetch()]); } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e, t) }); } finally { setBusy(false); } };
  const dl = (stage: string) => void api.download(`/me/applications/${id}/call-letter/${stage}`, `call-letter-${stage}.pdf`).catch((e: unknown) => setMsg({ tone: 'danger', text: errorMessage(e, t) }));
  const s = sel.data;
  if (!s) return <Page><Skeleton className="h-64" /></Page>;
  const p = prefs.data;
  const list = order ?? p?.prefs ?? [];
  const opt = (k: string) => p?.options.find((o) => o.key === k);
  const label = (o?: Opt) => (o ? `${o.orgName} · ${lang === 'hi' ? o.postTitleHi : o.postTitle}` : '');
  const move = (i: number, d: number) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); setOrder(n); };
  return (
    <>
      <PageHeader title={t('selection.title')} description={lang === 'hi' ? s.exam.titleHi : s.exam.title} />
      <Page>
        {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title={t('selection.calls')} />
            <CardBody className="space-y-3">
              {s.calls.length === 0 && <p className="text-sm text-ink-muted">{t('selection.noCalls')}</p>}
              {s.calls.map((c) => (
                <div key={c.stage} className="rounded border border-border p-3 text-sm">
                  <p className="font-semibold">{t(`results.STAGE_${c.stage}`)} <Badge className="ml-1">{c.status}</Badge></p>
                  {c.slotAt && <p>{t('selection.slot')}: {fmtDateTime(c.slotAt, lang)}</p>}
                  {c.venue && <p>{t('selection.venue')}: {c.venue}</p>}
                  <Button size="sm" className="mt-2" onClick={() => dl(c.stage)}><Download className="h-4 w-4" aria-hidden />{t('selection.downloadLetter')}</Button>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card><CardHeader title={t('selection.allotment')} />
            <CardBody className="space-y-3 text-sm">
              {!s.allotment ? <p className="text-ink-muted">{t('selection.notAllotted')}</p> : (
                <>
                  <p className="flex items-start gap-2"><Building2 className="h-5 w-5 shrink-0 text-orange" aria-hidden /><span>{t('selection.allotted', { org: s.allotment.orgName, pref: s.allotment.prefNo, cat: t(`enums.category.${s.allotment.category}`) })}</span></p>
                  <Badge tone={['ACCEPTED', 'DV_CLEARED', 'APPOINTED'].includes(s.allotment.status) ? 'success' : s.allotment.status === 'PROVISIONAL' ? 'warning' : 'danger'}>{t(`selection.ALLOT_${s.allotment.status}`)}</Badge>
                  {s.allotment.status === 'PROVISIONAL' && (
                    <div className="flex gap-2">
                      <Button variant="primary" loading={busy} onClick={() => void act(() => api.post(`/me/applications/${id}/allotment/accept`))}>{t('selection.accept')}</Button>
                      <Button loading={busy} onClick={() => { if (window.confirm(t('selection.declineConfirm'))) void act(() => api.post(`/me/applications/${id}/allotment/decline`)); }}>{t('selection.decline')}</Button>
                    </div>
                  )}
                </>
              )}
              {s.dv && (
                <div className="rounded border border-border p-3">
                  <p className="font-semibold">{t('selection.dv')} <Badge className="ml-1">{s.dv.status}</Badge></p>
                  <p>{t('selection.dvOn', { date: fmtDate(s.dv.date, lang), slot: s.dv.slot, venue: s.dv.venue })}</p>
                  {s.dv.remarks && <p className="text-ink-muted">{s.dv.remarks}</p>}
                  <Button size="sm" className="mt-2" onClick={() => dl('DV')}><Download className="h-4 w-4" aria-hidden />{t('selection.dvLetter')}</Button>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
        <Card className="mt-4"><CardHeader title={t('selection.prefsTitle')} description={t('selection.prefsBody')} />
          <CardBody>
            {prefs.error ? <Alert tone="info">{prefs.error instanceof ApiError && prefs.error.code === 'NOT_IN_MERIT' ? t('selection.notInMerit') : errorMessage(prefs.error, t)}</Alert> : !p ? <Skeleton className="h-24" /> : (
              <div className="grid gap-4 md:grid-cols-2">
                <div><p className="mb-2 text-sm font-semibold">{t('selection.chosen')}</p>
                  <ol className="space-y-1.5">{list.map((k, i) => (
                    <li key={k} className="flex items-center gap-2 rounded border border-border bg-white p-2 text-sm">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">{i + 1}</span>
                      <span className="flex-1">{label(opt(k))}</span>
                      {!p.locked && <><Button size="icon" variant="ghost" aria-label={t('selection.up')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={t('selection.down')} disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={t('selection.remove')} onClick={() => setOrder(list.filter((x) => x !== k))}><X className="h-4 w-4" /></Button></>}
                    </li>
                  ))}</ol>
                  {!p.locked && <Button variant="primary" className="mt-3" loading={busy} disabled={!list.length} onClick={() => void act(() => api.put(`/me/applications/${id}/preferences`, { prefs: list }), t('selection.saved'))}>{t('selection.savePrefs')}</Button>}
                </div>
                {!p.locked && <div><p className="mb-2 text-sm font-semibold">{t('selection.available')}</p>
                  <ul className="space-y-1.5">{p.options.filter((o) => !list.includes(o.key)).map((o) => (
                    <li key={o.key} className="flex items-center justify-between gap-2 rounded border border-dashed border-border p-2 text-sm"><span>{label(o)} <span className="text-xs text-ink-muted">({t('selection.seats', { n: o.seats })})</span></span><Button size="sm" onClick={() => setOrder([...list, o.key])}>{t('selection.add')}</Button></li>
                  ))}</ul></div>}
              </div>
            )}
          </CardBody>
        </Card>
      </Page>
    </>
  );
}
