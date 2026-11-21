import { Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, Input } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { Page, PageHeader } from '../components/Layout';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';

interface Msg { text?: string; subject?: string; at: string }

/** Demo servers only: shows the SMS/email that mock gateways would have delivered (OTPs, OTR ID, etc.). */
export default function DemoInbox() {
  const { t, i18n } = useTranslation();
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<{ demoMode?: boolean }>('/public/config') });
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [q, setQ] = useState<{ mobile: string; email: string } | null>(null);
  const msgs = useQuery({
    queryKey: ['demo-inbox', q],
    queryFn: () => api.get<{ sms: Msg[]; email: Msg[] }>(`/dev/messages?mobile=${encodeURIComponent(q!.mobile)}&email=${encodeURIComponent(q!.email)}`),
    enabled: !!q,
    refetchInterval: 5000,
  });
  if (cfg.data && !cfg.data.demoMode) return <Navigate to="/" replace />;
  const submit = (e: FormEvent) => { e.preventDefault(); setQ({ mobile: mobile.trim(), email: email.trim().toLowerCase() }); };
  const list = (items: Msg[] | undefined, title: string) => (
    <Card>
      <CardHeader title={title} />
      <CardBody className="p-0 sm:p-0">
        {items?.length ? (
          <ul className="divide-y divide-border">
            {items.map((m, i) => (
              <li key={i} className="px-4 py-3 text-sm sm:px-6">
                {m.subject && <p className="font-semibold">{m.subject}</p>}
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className="mt-1 text-xs tabular-nums text-ink-muted">{fmtDateTime(m.at, i18n.language)}</p>
              </li>
            ))}
          </ul>
        ) : <EmptyState title={t('demo.none')} />}
      </CardBody>
    </Card>
  );
  return (
    <>
      <PageHeader title={t('demo.title')} description={t('demo.subtitle')} />
      <Page>
        <Alert tone="warning" className="mb-4">{t('demo.warning')}</Alert>
        <Card className="mb-4"><CardBody>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <Field label={t('fields.mobile')} className="w-56">{(f) => <Input id={f.id} inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value)} />}</Field>
            <Field label={t('fields.email')} className="w-72">{(f) => <Input id={f.id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <Button type="submit" variant="primary" disabled={!mobile && !email}>{t('demo.show')}</Button>
          </form>
        </CardBody></Card>
        {q && <div className="grid gap-4 lg:grid-cols-2">{list(msgs.data?.sms, t('demo.sms'))}{list(msgs.data?.email, t('demo.emails'))}</div>}
      </Page>
    </>
  );
}
