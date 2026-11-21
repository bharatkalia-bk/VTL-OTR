import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, ProgressBar, Skeleton, buttonVariants } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { Bell, ClipboardList, Download, FileWarning, IdCard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../components/Layout';
import { useProfile } from '../features/profile';
import { api } from '../lib/api';
import { fmtDateTime, pick } from '../lib/format';
import { statusTone } from './applications/Applications';

interface AppRow { id: string; applicationNo: string; status: string; exam: { titleEn: string; titleHi: string }; admitCard: { rollNo: string } | null; result: { status: string } | null }
interface Notif { id: string; titleKey: string; params: Record<string, string>; link: string | null; readAt: string | null; createdAt: string }

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const profile = useProfile();
  const apps = useQuery({ queryKey: ['applications'], queryFn: () => api.get<AppRow[]>('/applications') });
  const notes = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ items: Notif[]; unread: number }>('/me/notifications') });
  const corr = useQuery({ queryKey: ['corrections'], queryFn: () => api.get<Array<{ id: string; field: string; status: string }>>('/me/corrections'), enabled: profile.data?.status === 'SUBMITTED' });
  const p = profile.data;
  const rejectedDocs = p?.documents.filter((d) => d.verificationStatus === 'REJECTED') ?? [];
  const debar = useQuery({ queryKey: ['debarments'], queryFn: () => api.get<Array<{ id: string; reason: string; untilDate: string | null; status: string }>>('/me/debarments'), enabled: p?.status === 'SUBMITTED' });
  const active = debar.data?.find((d) => d.status === 'ACTIVE');
  return (
    <>
      <PageHeader title={t('dashboard.welcome', { name: p?.personal.fullName ?? '' })} description={p?.otrId ? t('dashboard.otrIs', { otr: p.otrId }) : t('dashboard.completeFirst')} />
      <Page>
        {active && <Alert tone="danger" className="mb-4">{t('dashboard.debarred', { until: active.untilDate ? fmtDateTime(active.untilDate, lang) : t('dashboard.debarredPermanent'), reason: active.reason })}</Alert>}
        {rejectedDocs.length > 0 && <Alert tone="danger" className="mb-4" title={t('dashboard.docsRejected')}>{rejectedDocs.map((d) => `${t(`docs.kind.${d.kind}`)}: ${d.rejectionReason}`).join(' · ')}</Alert>}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title={t('dashboard.profile')} />
            <CardBody className="space-y-4">
              {!p ? <Skeleton className="h-24" /> : (
                <>
                  <div className="flex items-center gap-3">
                    {p.photo ? <img src={p.photo.url} alt="" className="h-20 w-16 rounded border border-border object-cover" /> : <div className="flex h-20 w-16 items-center justify-center rounded bg-navy-50"><IdCard className="h-6 w-6 text-ink-muted" aria-hidden /></div>}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.personal.fullName}</p>
                      <Badge tone={p.status === 'SUBMITTED' ? 'success' : p.status === 'BLOCKED' ? 'danger' : 'warning'}>{t(`enums.candidateStatus.${p.status}`)}</Badge>
                      {p.otrId && <p className="mt-1 text-xs tabular-nums text-ink-muted" data-testid="dash-otr">{p.otrId}</p>}
                    </div>
                  </div>
                  <ProgressBar value={p.completion} label={t('wizard.completion')} />
                  {p.status === 'DRAFT' ? (
                    <Link to="/profile" className={buttonVariants({ variant: 'primary', block: true })}>{t('dashboard.continueProfile')}</Link>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void api.download('/me/otr-slip.pdf', `OTR-Slip-${p.otrId}.pdf`)}><Download className="h-4 w-4" aria-hidden />{t('submitted.downloadSlip')}</Button>
                      <Link to="/profile/declaration" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>{t('dashboard.viewProfile')}</Link>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title={t('dashboard.applications')} actions={p?.status === 'SUBMITTED' && <Link to="/exams" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>{t('dashboard.applyNew')}</Link>} />
            <CardBody className="p-0 sm:p-0">
              {apps.isLoading ? <div className="p-4"><Skeleton className="h-16" /></div> : apps.data?.length ? (
                <ul className="divide-y divide-border">
                  {apps.data.map((a) => (
                    <li key={a.id}>
                      <Link to={`/applications/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-navy-50 sm:px-6">
                        <div className="min-w-0"><p className="font-medium">{pick(a.exam, lang)}</p><p className="text-xs tabular-nums text-ink-muted">{a.applicationNo}{a.admitCard && ` · ${t('dashboard.rollNo')} ${a.admitCard.rollNo}`}</p></div>
                        <div className="flex gap-2">{a.admitCard && <Badge tone="info">{t('dashboard.admitReady')}</Badge>}{a.result && <Badge tone="brand">{t(`enums.result.${a.result.status}`, { defaultValue: a.result.status })}</Badge>}<Badge tone={statusTone(a.status)}>{t(`enums.appStatus.${a.status}`)}</Badge></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={<ClipboardList className="h-8 w-8" />} title={t('dashboard.noApplications')} description={p?.status === 'SUBMITTED' ? t('dashboard.noApplicationsHint') : t('dashboard.completeFirst')} />}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title={<span className="flex items-center gap-2"><Bell className="h-5 w-5 text-orange" aria-hidden />{t('dashboard.notifications')}{!!notes.data?.unread && <Badge tone="brand">{notes.data.unread}</Badge>}</span>}
              actions={!!notes.data?.unread && <Button size="sm" variant="ghost" onClick={() => void api.post('/me/notifications/read-all').then(() => notes.refetch())}>{t('dashboard.markRead')}</Button>} />
            <CardBody className="p-0 sm:p-0">
              {notes.data?.items.length ? (
                <ul className="divide-y divide-border">
                  {notes.data.items.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 px-4 py-3 sm:px-6">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-border' : 'bg-orange'}`} aria-hidden />
                      <div className="min-w-0 flex-1"><p className="text-sm">{n.link ? <Link to={n.link} className="hover:underline">{t(n.titleKey, n.params)}</Link> : t(n.titleKey, n.params)}</p><p className="text-xs tabular-nums text-ink-muted">{fmtDateTime(n.createdAt, lang)}</p></div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title={t('dashboard.noNotifications')} />}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('dashboard.corrections')} actions={p?.status === 'SUBMITTED' && <Link to="/corrections" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>{t('dashboard.manage')}</Link>} />
            <CardBody>
              {p?.status !== 'SUBMITTED' ? <p className="text-sm text-ink-muted">{t('dashboard.correctionsAfterSubmit')}</p> : corr.data?.length ? (
                <ul className="space-y-2 text-sm">{corr.data.slice(0, 4).map((c) => <li key={c.id} className="flex justify-between gap-2"><span>{t(`enums.correctionField.${c.field}`)}</span><Badge tone={c.status === 'APPROVED' ? 'success' : c.status === 'REJECTED' ? 'danger' : 'warning'}>{t(`enums.decision.${c.status}`)}</Badge></li>)}</ul>
              ) : <p className="flex items-center gap-2 text-sm text-ink-muted"><FileWarning className="h-4 w-4" aria-hidden />{t('dashboard.noCorrections')}</p>}
            </CardBody>
          </Card>
        </div>
      </Page>
    </>
  );
}
