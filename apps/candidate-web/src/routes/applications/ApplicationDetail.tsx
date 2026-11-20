import { Alert, Badge, Button, Card, CardBody, CardHeader, Spinner, Timeline, buttonVariants } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Download, FileText, Ticket } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/forms';
import { fmtDate, fmtDateTime, fmtMoney, pick } from '../../lib/format';
import { statusTone } from './Applications';

interface Detail {
  id: string; applicationNo: string; status: string; feeAmount: number; feeRuleLabel: string | null; submittedAt: string | null;
  exam: { id: string; code: string; titleEn: string; titleHi: string; dates: { feeLastDate: string; examDate?: string }; feeOpen: boolean; applyOpen: boolean };
  posts: Array<{ id: string; code: string; titleEn: string; titleHi: string }>; centreCities: Array<{ id: string; cityName: string }>;
  events: Array<{ id: string; status: string; note: string | null; at: string }>;
  payments: Array<{ id: string; merchantTxnId: string; gatewayTxnId: string | null; amount: number; status: string; createdAt: string }>;
  admitCard: { rollNo: string; releasedAt: string; centre: { name: string; city: string; address: string; reportingTime: string } | null } | null;
  result: { status: string; score: number | null; rank: number | null } | null;
}

export default function ApplicationDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useQuery({ queryKey: ['application', id], queryFn: () => api.get<Detail>(`/applications/${id}`) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!q.data) return <div className="flex justify-center py-16"><Spinner label={t('app.loading')} /></div>;
  const a = q.data;
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ redirectUrl: string }>(`/applications/${a.id}/payments`);
      window.location.assign(r.redirectUrl);
    } catch (e) {
      setError(errorMessage(e, t));
      setBusy(false);
    }
  };
  const dl = (path: string, name: string) => void api.download(path, name).catch((e: unknown) => setError(errorMessage(e, t)));
  return (
    <>
      <PageHeader title={pick(a.exam, lang)} description={<span className="tabular-nums">{t('applications.number')}: {a.applicationNo}</span>} actions={<Badge tone={statusTone(a.status)} className="text-sm">{t(`enums.appStatus.${a.status}`)}</Badge>} />
      <Page>
        {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
        {a.status === 'DRAFT' && <Alert tone="warning" className="mb-4" title={t('applications.draftTitle')}><Link to={`/exams/${a.exam.id}/apply`} className="text-info underline">{t('exams.continueApplication')}</Link></Alert>}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {a.admitCard && (
              <Card className="border-success/40">
                <CardHeader title={<span className="flex items-center gap-2"><Ticket className="h-5 w-5 text-success" aria-hidden />{t('applications.admitCard')}</span>} />
                <CardBody className="space-y-2 text-sm">
                  <p><span className="text-ink-muted">{t('dashboard.rollNo')}:</span> <span className="font-heading text-lg font-bold tabular-nums">{a.admitCard.rollNo}</span></p>
                  {a.admitCard.centre && <p><span className="text-ink-muted">{t('applications.centre')}:</span> {a.admitCard.centre.name}, {a.admitCard.centre.address}, {a.admitCard.centre.city}</p>}
                  {a.exam.dates.examDate && <p className="tabular-nums"><span className="text-ink-muted">{t('applications.examDate')}:</span> {fmtDate(a.exam.dates.examDate, lang)} · {t('applications.reporting')} {a.admitCard.centre?.reportingTime}</p>}
                  <Button variant="primary" onClick={() => dl(`/applications/${a.id}/admit-card.pdf`, `AdmitCard-${a.admitCard!.rollNo}.pdf`)} data-testid="download-admit"><Download className="h-4 w-4" aria-hidden />{t('applications.downloadAdmit')}</Button>
                </CardBody>
              </Card>
            )}
            {a.result && <Alert tone={a.result.status === 'QUALIFIED' ? 'success' : 'info'} title={t('applications.result')}>{t(`enums.result.${a.result.status}`, { defaultValue: a.result.status })}{a.result.score !== null && ` · ${t('applications.score')} ${a.result.score}`}{a.result.rank && ` · ${t('applications.rank')} ${a.result.rank}`}</Alert>}
            {a.status === 'PAYMENT_PENDING' && (
              <Card className="border-warning/40">
                <CardHeader title={t('applications.payFee')} description={t('applications.payBy', { date: fmtDate(a.exam.dates.feeLastDate, lang) })} />
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-heading text-2xl font-bold tabular-nums">{fmtMoney(a.feeAmount, lang)}</span>
                  <Button variant="primary" size="lg" loading={busy} disabled={!a.exam.feeOpen} onClick={() => void pay()} data-testid="pay-now"><CreditCard className="h-5 w-5" aria-hidden />{t('applications.payNow')}</Button>
                </CardBody>
              </Card>
            )}
            <Card>
              <CardHeader title={t('applications.details')} actions={a.status !== 'DRAFT' && <Button size="sm" onClick={() => dl(`/applications/${a.id}/form.pdf`, `Application-${a.applicationNo}.pdf`)}><FileText className="h-4 w-4" aria-hidden />{t('applications.downloadForm')}</Button>} />
              <CardBody className="text-sm">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div><dt className="text-ink-muted">{t('apply.posts')}</dt><dd><ol className="list-decimal pl-5">{a.posts.map((p) => <li key={p.id}>{pick(p, lang)}</li>)}</ol></dd></div>
                  <div><dt className="text-ink-muted">{t('apply.cities')}</dt><dd><ol className="list-decimal pl-5">{a.centreCities.map((c) => <li key={c.id}>{c.cityName}</li>)}</ol></dd></div>
                  <div><dt className="text-ink-muted">{t('apply.fee')}</dt><dd className="tabular-nums">{fmtMoney(a.feeAmount, lang)} {a.feeRuleLabel && <span className="text-ink-muted">({a.feeRuleLabel})</span>}</dd></div>
                  <div><dt className="text-ink-muted">{t('applications.submitted')}</dt><dd className="tabular-nums">{fmtDateTime(a.submittedAt, lang) || '—'}</dd></div>
                </dl>
              </CardBody>
            </Card>
            {a.payments.length > 0 && (
              <Card>
                <CardHeader title={t('applications.payments')} />
                <CardBody className="p-0 sm:p-0">
                  <ul className="divide-y divide-border">
                    {a.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-6">
                        <div><p className="tabular-nums font-medium">{p.merchantTxnId}</p><p className="text-xs tabular-nums text-ink-muted">{fmtDateTime(p.createdAt, lang)} · {fmtMoney(p.amount, lang)}</p></div>
                        <div className="flex items-center gap-2"><Badge tone={p.status === 'SUCCESS' ? 'success' : p.status === 'FAILED' ? 'danger' : 'warning'}>{t(`enums.payStatus.${p.status}`)}</Badge>
                          {p.status === 'SUCCESS' && <Button size="sm" variant="ghost" onClick={() => dl(`/payments/${p.id}/receipt.pdf`, `Receipt-${p.merchantTxnId}.pdf`)} data-testid="download-receipt"><Download className="h-4 w-4" aria-hidden />{t('applications.receipt')}</Button>}</div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>
          <Card className="h-fit">
            <CardHeader title={t('applications.timeline')} />
            <CardBody>
              <Timeline items={a.events.map((ev, i) => ({ title: t(`enums.event.${ev.status}`, { defaultValue: ev.status }), at: fmtDateTime(ev.at, lang), note: ev.note ?? undefined, tone: ev.status.includes('FAILED') ? 'failed' : i === a.events.length - 1 ? 'current' : 'done' }))} />
              <Link to="/applications" className={buttonVariants({ variant: 'ghost', size: 'sm' }) + ' mt-4'}>{t('app.back')}</Link>
            </CardBody>
          </Card>
        </div>
      </Page>
    </>
  );
}
