import { Alert, Card, CardBody, Spinner } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Page, PageHeader } from '../components/Layout';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';

/** Public admit-card verification page reached by scanning the QR code. */
export default function Verify() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['verify', token], queryFn: () => api.get<{ valid: boolean; rollNo?: string; otrId?: string; applicationNo?: string; exam?: string; centre?: string; photoUrl?: string; issuedAt?: string }>(`/verify/admit/${token}`) });
  return (
    <>
      <PageHeader title={t('verify.title')} />
      <Page narrow>
        {!q.data ? <Spinner label={t('app.loading')} /> : q.data.valid ? (
          <Card className="border-success/50"><CardBody className="space-y-3">
            <p className="flex items-center gap-2 text-lg font-semibold text-success"><ShieldCheck className="h-6 w-6" aria-hidden />{t('verify.valid')}</p>
            {q.data.photoUrl && <img src={q.data.photoUrl} alt={t('verify.photo')} className="h-44 w-36 rounded border border-border object-cover" />}
            <dl className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <dt className="text-ink-muted">{t('dashboard.rollNo')}</dt><dd className="font-semibold tabular-nums">{q.data.rollNo}</dd>
              <dt className="text-ink-muted">OTR ID</dt><dd className="tabular-nums">{q.data.otrId}</dd>
              <dt className="text-ink-muted">{t('applications.number')}</dt><dd className="tabular-nums">{q.data.applicationNo}</dd>
              <dt className="text-ink-muted">{t('applications.exam')}</dt><dd>{q.data.exam}</dd>
              <dt className="text-ink-muted">{t('applications.centre')}</dt><dd>{q.data.centre}</dd>
              <dt className="text-ink-muted">{t('verify.issued')}</dt><dd className="tabular-nums">{fmtDateTime(q.data.issuedAt, i18n.language)}</dd>
            </dl>
            <Alert tone="info">{t('verify.match')}</Alert>
          </CardBody></Card>
        ) : (
          <Alert tone="danger" title={t('verify.invalid')}><span className="flex items-center gap-2"><ShieldX className="h-5 w-5" aria-hidden />{t('verify.invalidBody')}</span></Alert>
        )}
      </Page>
    </>
  );
}
