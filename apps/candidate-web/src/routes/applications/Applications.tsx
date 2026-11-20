import { Badge, DataTable, EmptyState, Skeleton } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney, pick } from '../../lib/format';

export const statusTone = (s: string) => (s === 'PAID' || s === 'FEE_EXEMPT' ? 'success' : s === 'PAYMENT_PENDING' ? 'warning' : s === 'REJECTED' ? 'danger' : s === 'DRAFT' ? 'neutral' : 'info') as 'success' | 'warning' | 'danger' | 'neutral' | 'info';

interface Row { id: string; applicationNo: string; status: string; feeAmount: number; submittedAt: string | null; exam: { titleEn: string; titleHi: string } }

export default function Applications() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const lang = i18n.language;
  const q = useQuery({ queryKey: ['applications'], queryFn: () => api.get<Row[]>('/applications') });
  return (
    <>
      <PageHeader title={t('applications.title')} />
      <Page>
        {q.isLoading ? <Skeleton className="h-32" /> : q.data?.length ? (
          <DataTable caption={t('applications.title')} rows={q.data} rowKey={(r) => r.id} onRowClick={(r) => nav(`/applications/${r.id}`)}
            columns={[
              { key: 'exam', header: t('applications.exam'), cell: (r) => <Link to={`/applications/${r.id}`} className="font-medium hover:underline">{pick(r.exam, lang)}</Link> },
              { key: 'no', header: t('applications.number'), cell: (r) => <span className="tabular-nums">{r.applicationNo}</span> },
              { key: 'date', header: t('applications.submitted'), cell: (r) => <span className="tabular-nums">{fmtDate(r.submittedAt, lang) || '—'}</span> },
              { key: 'fee', header: t('apply.fee'), numeric: true, cell: (r) => fmtMoney(r.feeAmount, lang) },
              { key: 'status', header: t('applications.status'), cell: (r) => <Badge tone={statusTone(r.status)}>{t(`enums.appStatus.${r.status}`)}</Badge> },
            ]} />
        ) : <EmptyState title={t('dashboard.noApplications')} action={<Link to="/exams" className="text-info underline">{t('dashboard.applyNew')}</Link>} />}
      </Page>
    </>
  );
}
