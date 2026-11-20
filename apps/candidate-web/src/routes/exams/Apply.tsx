import type { CustomField, EligibilityResult } from '@vtl/shared';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Field, Input, Select, Spinner } from '@vtl/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCircle2, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/forms';
import { fmtDate, fmtMoney, pick } from '../../lib/format';

interface ExamDetail {
  id: string; code: string; titleEn: string; titleHi: string; descriptionEn: string; descriptionHi: string; conductingBody: string; notificationNo: string; applyOpen: boolean; ageCutoffDate: string; maxCentrePreferences: number;
  dates: { applyEnd: string; feeLastDate: string; examDate?: string }; customFields: CustomField[];
  posts: Array<{ id: string; code: string; titleEn: string; titleHi: string; eligibility: EligibilityResult | null }>;
  centreCities: Array<{ id: string; cityName: string }>;
  fee: { amount: number; exempt: boolean; ruleLabel: string } | null;
  application: { id: string; status: string; postIds: string[]; centreCityIds: string[]; customFieldValues: Record<string, string | number | boolean> } | null;
}

function Ordered({ items, onMove, onRemove, label }: { items: Array<{ id: string; label: string }>; onMove: (i: number, d: -1 | 1) => void; onRemove: (i: number) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <ol className="space-y-2" aria-label={label}>
      {items.map((it, i) => (
        <li key={it.id} className="flex items-center gap-2 rounded border border-border bg-white px-3 py-2 text-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs font-semibold tabular-nums text-white">{i + 1}</span>
          <span className="flex-1">{it.label}</span>
          <button type="button" className="rounded p-1.5 hover:bg-navy-50 disabled:opacity-30" disabled={i === 0} onClick={() => onMove(i, -1)} aria-label={t('apply.moveUp', { item: it.label })}><ArrowUp className="h-4 w-4" aria-hidden /></button>
          <button type="button" className="rounded p-1.5 hover:bg-navy-50 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => onMove(i, 1)} aria-label={t('apply.moveDown', { item: it.label })}><ArrowDown className="h-4 w-4" aria-hidden /></button>
          <button type="button" className="rounded p-1.5 text-danger hover:bg-danger-50" onClick={() => onRemove(i)} aria-label={t('apply.removeItem', { item: it.label })}><X className="h-4 w-4" aria-hidden /></button>
        </li>
      ))}
    </ol>
  );
}

export default function Apply() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['exam', id], queryFn: () => api.get<ExamDetail>(`/exams/${id}`) });
  const [posts, setPosts] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [custom, setCustom] = useState<Record<string, string | number | boolean>>({});
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (q.data?.application) {
      setPosts(q.data.application.postIds);
      setCities(q.data.application.centreCityIds);
      setCustom(q.data.application.customFieldValues);
    }
  }, [q.data]);
  if (!q.data) return <div className="flex justify-center py-16"><Spinner label={t('app.loading')} /></div>;
  const e = q.data;
  const move = (arr: string[], set: (v: string[]) => void) => (i: number, d: -1 | 1) => { const a = [...arr]; [a[i], a[i + d]] = [a[i + d]!, a[i]!]; set(a); };
  const save = async (submit: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const app = await api.post<{ id: string }>('/applications', { examId: e.id, postIds: posts, centreCityIds: cities, customFieldValues: custom });
      if (submit) {
        await api.post(`/applications/${app.id}/submit`);
        await qc.invalidateQueries({ queryKey: ['applications'] });
        nav(`/applications/${app.id}`);
      } else {
        await q.refetch();
      }
    } catch (er) {
      setError(errorMessage(er, t));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  const eligiblePosts = e.posts.filter((p) => p.eligibility?.eligible);
  return (
    <>
      <PageHeader title={pick(e, lang)} description={`${e.conductingBody} · ${e.notificationNo}`} />
      <Page>
        {!e.applyOpen && <Alert tone="warning" className="mb-4">{t('exams.notOpen')}</Alert>}
        {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <CardHeader title={t('apply.posts')} description={t('apply.postsHint')} />
              <CardBody className="space-y-3">
                <ul className="space-y-2">
                  {e.posts.map((p) => {
                    const ok = p.eligibility?.eligible;
                    const chosen = posts.includes(p.id);
                    return (
                      <li key={p.id} className="rounded border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden /> : <XCircle className="mt-0.5 h-5 w-5 text-danger" aria-hidden />}
                            <div><p className="font-medium">{pick(p, lang)} <span className="text-xs text-ink-muted">({p.code})</span></p>
                              <ul className="mt-1 text-xs text-ink-muted">{p.eligibility?.criteria.map((c) => <li key={c.code} className={c.passed ? '' : 'text-danger'}>{t(c.reasonKey, c.params)}</li>)}</ul></div>
                          </div>
                          {ok && <Button size="sm" variant={chosen ? 'ghost' : 'secondary'} disabled={chosen} onClick={() => setPosts([...posts, p.id])} data-testid={`add-post-${p.code}`}>{chosen ? t('apply.added') : t('apply.add')}</Button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {posts.length > 0 && <><p className="text-sm font-medium">{t('apply.yourOrder')}</p><Ordered label={t('apply.posts')} items={posts.map((pid) => ({ id: pid, label: pick(e.posts.find((x) => x.id === pid), lang) }))} onMove={move(posts, setPosts)} onRemove={(i) => setPosts(posts.filter((_, k) => k !== i))} /></>}
                {eligiblePosts.length === 0 && <Alert tone="warning">{t('exams.notEligibleAny')}</Alert>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t('apply.cities')} description={t('apply.citiesHint', { n: e.maxCentrePreferences })} />
              <CardBody className="space-y-3">
                <Field label={t('apply.addCity')}>
                  {(f) => <Select id={f.id} value="" disabled={cities.length >= e.maxCentrePreferences} onChange={(ev) => ev.target.value && setCities([...cities, ev.target.value])} data-testid="city-select">
                    <option value="">{t('app.select')}</option>{e.centreCities.filter((c) => !cities.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.cityName}</option>)}
                  </Select>}
                </Field>
                {cities.length > 0 && <Ordered label={t('apply.cities')} items={cities.map((cid) => ({ id: cid, label: e.centreCities.find((x) => x.id === cid)?.cityName ?? cid }))} onMove={move(cities, setCities)} onRemove={(i) => setCities(cities.filter((_, k) => k !== i))} />}
              </CardBody>
            </Card>
            {e.customFields.length > 0 && (
              <Card>
                <CardHeader title={t('apply.examSpecific')} />
                <CardBody className="grid gap-4 sm:grid-cols-2">
                  {e.customFields.map((cf) => {
                    const label = lang === 'hi' ? cf.labelHi : cf.labelEn;
                    if (cf.type === 'boolean') return <Checkbox key={cf.key} label={label} checked={!!custom[cf.key]} onChange={(ev) => setCustom({ ...custom, [cf.key]: ev.target.checked })} />;
                    return (
                      <Field key={cf.key} label={label} required={cf.required}>
                        {(f) => cf.type === 'select'
                          ? <Select id={f.id} value={String(custom[cf.key] ?? '')} onChange={(ev) => setCustom({ ...custom, [cf.key]: ev.target.value })} data-testid={`cf-${cf.key}`}><option value="">{t('app.select')}</option>{cf.options?.map((o) => <option key={o.value} value={o.value}>{lang === 'hi' ? o.labelHi : o.labelEn}</option>)}</Select>
                          : <Input id={f.id} type={cf.type === 'number' ? 'number' : 'text'} value={String(custom[cf.key] ?? '')} onChange={(ev) => setCustom({ ...custom, [cf.key]: cf.type === 'number' ? Number(ev.target.value) : ev.target.value })} data-testid={`cf-${cf.key}`} />}
                      </Field>
                    );
                  })}
                </CardBody>
              </Card>
            )}
          </div>
          <aside>
            <Card className="sticky top-20">
              <CardHeader title={t('apply.summary')} />
              <CardBody className="space-y-3 text-sm">
                <p className="flex justify-between"><span className="text-ink-muted">{t('exams.lastDate')}</span><span className="tabular-nums font-medium">{fmtDate(e.dates.applyEnd, lang)}</span></p>
                <p className="flex justify-between"><span className="text-ink-muted">{t('apply.ageCutoff')}</span><span className="tabular-nums font-medium">{fmtDate(e.ageCutoffDate, lang)}</span></p>
                <p className="flex items-center justify-between"><span className="text-ink-muted">{t('apply.fee')}</span>{e.fee?.exempt ? <Badge tone="success">{t('exams.exempt')}</Badge> : <span className="font-heading text-xl font-bold tabular-nums">{fmtMoney(e.fee?.amount ?? 0, lang)}</span>}</p>
                <p className="text-xs text-ink-muted">{t('apply.feeRule', { rule: e.fee?.ruleLabel ?? '' })}</p>
                <Alert tone="info">{t('apply.otrDataNote')}</Alert>
                <Checkbox label={t('apply.declaration')} checked={agree} onChange={(ev) => setAgree(ev.target.checked)} data-testid="apply-agree" />
                <Button block onClick={() => void save(false)} loading={busy} disabled={!posts.length || !cities.length || !e.applyOpen}>{t('apply.saveDraft')}</Button>
                <Button block variant="primary" onClick={() => setConfirm(true)} disabled={!posts.length || !cities.length || !agree || !e.applyOpen} data-testid="apply-submit">{t('apply.submit')}</Button>
              </CardBody>
            </Card>
          </aside>
        </div>
        <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('apply.confirmTitle')} closeLabel={t('app.close')}
          footer={<><Button onClick={() => setConfirm(false)}>{t('app.cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void save(true)} data-testid="apply-confirm">{t('apply.confirm')}</Button></>}>
          <p className="text-sm">{t('apply.confirmBody')}</p>
        </Dialog>
      </Page>
    </>
  );
}
