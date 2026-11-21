import { Alert, Button, Card, CardBody } from '@vtl/ui';
import { CheckCircle2, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { api } from '../../lib/api';

export default function Submitted() {
  const { t } = useTranslation();
  const [sp] = useSearchParams();
  const otr = sp.get('otr') ?? '';
  return (
    <Page narrow>
      <Card className="mt-6 text-center">
        <CardBody className="py-8">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold">{t('submitted.title')}</h1>
          <p className="mt-2 text-ink-muted">{t('submitted.body')}</p>
          <div className="mx-auto mt-5 max-w-sm rounded-card border-2 border-navy bg-orange-50 px-4 py-3">
            <p className="text-xs text-ink-muted">{t('submitted.yourOtr')}</p>
            <p className="font-heading text-2xl font-bold tabular-nums" data-testid="otr-id">{otr}</p>
          </div>
          <Alert tone="info" className="mt-5 text-left">{t('submitted.sent')}</Alert>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={() => void api.download('/me/otr-slip.pdf', `OTR-Slip-${otr}.pdf`)} data-testid="download-slip"><Download className="h-4 w-4" aria-hidden />{t('submitted.downloadSlip')}</Button>
            <Link to="/exams" className="inline-flex h-11 items-center rounded border border-border px-4 font-medium text-navy hover:bg-navy-50">{t('submitted.applyExams')}</Link>
          </div>
        </CardBody>
      </Card>
    </Page>
  );
}
