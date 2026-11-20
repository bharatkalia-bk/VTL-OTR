import { Alert, Badge, Card, EmptyState, Skeleton, buttonVariants } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { useProfile } from '../../features/profile';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney, pick } from '../../lib/format';
import type { EligibilityResult } from '@vtl/shared';

export interface ExamRow {
  id: string; code: string; titleEn: string; titleHi: string; conductingBody: string; notificationNo: string; status: string; applyOpen: boolean;
  dates: { applyStart: string; applyEnd: string; feeLastDate: string; examDate?: string };
  posts: Array<{ id: string; code: string; titleEn: string; titleHi: string; eligibility: EligibilityResult | null }>;
  anyEligible: boolean; fee: { amount: number; exempt: boolean } | null; application: { id: string; status: string; applicationNo: string } | null;
}

export default function Exams() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const profile = useProfile();
  const q = useQuery({ queryKey: ['exams'], queryFn: () => api.get<ExamRow[]>('/exams') });
  return (
    <>
      <PageHeader title={t('exams.title')} description={t('exams.subtitle')} />
      <Page>
        {profile.data?.status === 'DRAFT' && <Alert tone="warning" className="mb-4" title={t('exams.otrRequired')}><Link to="/profile" className="text-info underline">{t('dashboard.continueProfile')}</Link></Alert>}
        {q.isLoading && <Skeleton className="h-40" />}
        {q.data?.length === 0 && <EmptyState title={t('exams.none')} />}
        <div className="grid gap-4 md:grid-cols-2">
          {q.data?.map((e) => (
            <Card key={e.id} className="flex flex-col p-4 sm:p-5" data-testid={`exam-${e.code}`}>
              <div className="flex items-start justify-between gap-2">
                <div><h2 className="text-lg font-semibold leading-snug">{pick(e, lang)}</h2><p className="text-xs text-ink-muted">{e.conductingBody} · <span className="tabular-nums">{e.notificationNo}</span></p></div>
                <Badge tone={e.applyOpen ? 'success' : 'neutral'}>{e.applyOpen ? t('landing.open') : t('landing.closed')}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-ink-muted">{t('exams.lastDate')}</dt><dd className="tabular-nums font-medium">{fmtDate(e.dates.applyEnd, lang)}</dd></div>
                <div><dt className="text-xs text-ink-muted">{t('exams.yourFee')}</dt><dd className="tabular-nums font-medium">{e.fee ? (e.fee.exempt ? t('exams.exempt') : fmtMoney(e.fee.amount, lang)) : '—'}</dd></div>
              </dl>
              <ul className="mt-3 space-y-1.5 text-sm">
                {e.posts.map((p) => (
                  <li key={p.id} className="flex items-start gap-2">
                    {p.eligibility?.eligible ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label={t('exams.eligible')} /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label={t('exams.notEligible')} />}
                    <span>{pick(p, lang)}{!p.eligibility?.eligible && p.eligibility && <span className="block text-xs text-ink-muted">{p.eligibility.criteria.filter((c) => !c.passed).map((c) => t(c.reasonKey, c.params)).join(' ')}</span>}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                {e.application ? (
                  <Link to={`/applications/${e.application.id}`} className={buttonVariants({ variant: 'secondary', block: true })}>{e.application.status === 'DRAFT' ? t('exams.continueApplication') : t('exams.viewApplication')}</Link>
                ) : e.applyOpen && e.anyEligible && profile.data?.status === 'SUBMITTED' ? (
                  <Link to={`/exams/${e.id}/apply`} className={buttonVariants({ variant: 'primary', block: true })} data-testid={`apply-${e.code}`}>{t('exams.apply')}</Link>
                ) : (
                  <p className="text-center text-sm text-ink-muted">{!e.applyOpen ? t('exams.notOpen') : !e.anyEligible ? t('exams.notEligibleAny') : t('exams.otrRequired')}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Page>
    </>
  );
}
