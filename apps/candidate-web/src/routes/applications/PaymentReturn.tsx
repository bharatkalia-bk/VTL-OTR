import { Alert, Button, Card, CardBody, Spinner, buttonVariants } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { api } from '../../lib/api';
import { fmtMoney } from '../../lib/format';

/** Landing page after the gateway redirect. Polls while the bank confirmation is pending. */
export default function PaymentReturn() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { t, i18n } = useTranslation();
  const txn = sp.get('txn') ?? '';
  const q = useQuery({
    queryKey: ['payment', txn],
    queryFn: () => api.get<{ id: string; status: string; amount: number; merchantTxnId: string; gatewayTxnId: string | null }>(`/payments/by-txn/${encodeURIComponent(txn)}`),
    refetchInterval: (query) => (['INITIATED', 'PENDING'].includes(query.state.data?.status ?? 'PENDING') ? 5000 : false),
  });
  if (!q.data) return <div className="flex justify-center py-16"><Spinner label={t('payment.checking')} /></div>;
  const s = q.data.status;
  const icon = s === 'SUCCESS' ? <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden /> : s === 'FAILED' ? <XCircle className="mx-auto h-14 w-14 text-danger" aria-hidden /> : <Clock className="mx-auto h-14 w-14 text-warning" aria-hidden />;
  return (
    <Page narrow>
      <Card className="mt-6 text-center"><CardBody className="py-8" >
        {icon}
        <h1 className="mt-3 text-2xl font-bold" data-testid="payment-status" data-status={s}>{t(`payment.title.${s}`, { defaultValue: s })}</h1>
        <p className="mt-2 text-ink-muted">{t(`payment.body.${s}`, { defaultValue: '' })}</p>
        <p className="mt-4 font-heading text-xl font-bold tabular-nums">{fmtMoney(q.data.amount, i18n.language)}</p>
        <p className="text-xs tabular-nums text-ink-muted">{q.data.merchantTxnId}{q.data.gatewayTxnId && ` · ${q.data.gatewayTxnId}`}</p>
        {s === 'PENDING' && <Alert tone="info" className="mt-4 text-left">{t('payment.pendingNote')}</Alert>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {s === 'SUCCESS' && <Button variant="primary" onClick={() => void api.download(`/payments/${q.data!.id}/receipt.pdf`, `Receipt-${q.data!.merchantTxnId}.pdf`)}>{t('applications.receipt')}</Button>}
          <Link to={`/applications/${id}`} className={buttonVariants({ variant: s === 'SUCCESS' ? 'outline' : 'primary' })} data-testid="back-to-application">{t('payment.backToApplication')}</Link>
        </div>
      </CardBody></Card>
    </Page>
  );
}
