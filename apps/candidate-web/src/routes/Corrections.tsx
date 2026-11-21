import { CORRECTION_FIELDS } from '@vtl/shared';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, OtpInput, Select, Textarea } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page, PageHeader } from '../components/Layout';
import { DocUpload } from '../features/DocUpload';
import { useProfile, useSetProfile, type Profile } from '../features/profile';
import { api } from '../lib/api';
import { errorMessage } from '../lib/forms';
import { fmtDateTime } from '../lib/format';

interface Corr { id: string; field: string; currentValue: string | null; requestedValue: string; reason: string; status: string; decisionReason: string | null; createdAt: string }

export default function Corrections() {
  const { t, i18n } = useTranslation();
  const profile = useProfile();
  const list = useQuery({ queryKey: ['corrections'], queryFn: () => api.get<Corr[]>('/me/corrections') });
  const [field, setField] = useState<string>('FULL_NAME');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [doc, setDoc] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      await api.post('/me/corrections', { field, requestedValue: value, reason, documentId: doc });
      setMsg({ tone: 'success', text: t('corrections.submitted') });
      setValue(''); setReason(''); setDoc(null);
      await list.refetch();
    } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e, t) }); } finally { setBusy(false); }
  };
  const isMedia = field === 'PHOTO' || field === 'SIGNATURE';
  return (
    <>
      <PageHeader title={t('corrections.title')} description={t('corrections.subtitle')} />
      <Page>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('corrections.new')} description={t('corrections.newDesc')} />
            <CardBody className="space-y-4">
              {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
              <Field label={t('corrections.field')} required>{(f) => <Select id={f.id} value={field} onChange={(e) => setField(e.target.value)}>{CORRECTION_FIELDS.map((c) => <option key={c} value={c}>{t(`enums.correctionField.${c}`)}</option>)}</Select>}</Field>
              <Field label={isMedia ? t('corrections.mediaValue') : t('corrections.newValue')} hint={field === 'DOB' ? t('corrections.dobHint') : isMedia ? t('corrections.mediaHint') : undefined} required>
                {(f) => <Input id={f.id} value={value} type={field === 'DOB' ? 'date' : 'text'} onChange={(e) => setValue(e.target.value)} />}
              </Field>
              <Field label={t('corrections.reason')} required>{(f) => <Textarea id={f.id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />}</Field>
              <DocUpload label={t('corrections.proof')} kind="CORRECTION_PROOF" value={doc} onChange={setDoc} docs={profile.data?.documents ?? []} />
              <Button variant="primary" loading={busy} disabled={!value || reason.length < 10 || !doc} onClick={() => void submit()}>{t('corrections.submit')}</Button>
            </CardBody>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title={t('corrections.history')} />
              <CardBody className="p-0 sm:p-0">
                {list.data?.length ? (
                  <ul className="divide-y divide-border">
                    {list.data.map((c) => (
                      <li key={c.id} className="px-4 py-3 text-sm sm:px-6">
                        <div className="flex justify-between gap-2"><span className="font-medium">{t(`enums.correctionField.${c.field}`)}</span><Badge tone={c.status === 'APPROVED' ? 'success' : c.status === 'REJECTED' ? 'danger' : 'warning'}>{t(`enums.decision.${c.status}`)}</Badge></div>
                        <p className="text-ink-muted">{c.currentValue ?? '—'} → <span className="text-navy">{c.requestedValue}</span></p>
                        {c.decisionReason && <p className="text-xs text-ink-muted">{c.decisionReason}</p>}
                        <p className="text-xs tabular-nums text-ink-muted">{fmtDateTime(c.createdAt, i18n.language)}</p>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title={t('dashboard.noCorrections')} />}
              </CardBody>
            </Card>
            {profile.data && <ContactChange profile={profile.data} />}
          </div>
        </div>
      </Page>
    </>
  );
}

function ContactChange({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const setProfile = useSetProfile();
  const [email, setEmail] = useState('');
  const [ch, setCh] = useState<{ challengeId: string; channels: string[] } | null>(null);
  const [mOtp, setMOtp] = useState('');
  const [eOtp, setEOtp] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e, t) }); } finally { setBusy(false); } };
  return (
    <Card>
      <CardHeader title={t('contact.title')} description={t('contact.desc')} />
      <CardBody className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <p className="text-sm">{t('contact.current')}: <span className="font-medium">{profile.email}</span></p>
        {!ch ? (
          <>
            <Field label={t('contact.newEmail')}>{(f) => <Input id={f.id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <Button loading={busy} disabled={!email.includes('@')} onClick={() => void run(async () => setCh(await api.post('/me/contact/change/request', { email })))}>{t('contact.sendOtp')}</Button>
            <p className="text-xs text-ink-muted">{t('contact.addressNote')}</p>
          </>
        ) : (
          <>
            <div><p className="mb-1 text-sm">{t('register.mobileOtp')}</p><OtpInput idPrefix="cm" label={t('register.mobileOtp')} value={mOtp} onChange={setMOtp} /></div>
            {ch.channels.includes('email') && <div><p className="mb-1 text-sm">{t('contact.newEmailOtp')}</p><OtpInput idPrefix="ce" label={t('contact.newEmailOtp')} value={eOtp} onChange={setEOtp} /></div>}
            <Button variant="secondary" loading={busy} disabled={mOtp.length !== 6} onClick={() => void run(async () => {
              setProfile(await api.post<Profile>('/me/contact/change/verify', { challengeId: ch.challengeId, mobileOtp: mOtp, emailOtp: eOtp || undefined }));
              setCh(null); setEmail(''); setMsg({ tone: 'success', text: t('contact.updated') });
            })}>{t('register.verify')}</Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
