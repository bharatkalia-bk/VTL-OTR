import { Alert, Button, Card, CardBody, Field, Input, OtpInput } from '@vtl/ui';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Captcha, type CaptchaValue } from '../../components/Captcha';
import { Page, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/forms';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [identifier, setId] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaValue | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [ch, setCh] = useState<{ challengeId: string; sentTo: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onCaptcha = useCallback((v: CaptchaValue) => setCaptcha(v), []);
  const request = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setCh(await api.post('/auth/forgot/password/request', { identifier, ...captcha })); } catch (er) { setError(errorMessage(er, t)); setCapKey((k) => k + 1); } finally { setBusy(false); }
  };
  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.post('/auth/forgot/password/reset', { challengeId: ch!.challengeId, otp, password: pw, confirmPassword: pw2 }); setDone(true); } catch (er) { setError(errorMessage(er, t)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title={t('forgotPw.title')} description={t('forgotPw.subtitle')} />
      <Page narrow>
        <Card><CardBody>
          {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
          {done ? (
            <Alert tone="success" title={t('forgotPw.doneTitle')}>{t('forgotPw.doneBody')} <Link to="/login" className="text-info underline">{t('nav.login')}</Link></Alert>
          ) : ch ? (
            <form onSubmit={(e) => void reset(e)} className="space-y-4" noValidate>
              <p className="text-sm text-ink-muted">{t('login.otpSentTo', { to: ch.sentTo })}</p>
              <OtpInput label={t('login.otp')} value={otp} onChange={setOtp} />
              <Field label={t('fields.newPassword')} hint={t('fields.passwordHint')} required>{(p) => <Input id={p.id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
              <Field label={t('fields.confirmPassword')} required>{(p) => <Input id={p.id} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
              <Button type="submit" variant="primary" block loading={busy} disabled={otp.length !== 6 || !pw}>{t('forgotPw.reset')}</Button>
            </form>
          ) : (
            <form onSubmit={(e) => void request(e)} className="space-y-4" noValidate>
              <Field label={t('login.identifier')} hint={t('login.identifierHint')} required>{(p) => <Input id={p.id} value={identifier} onChange={(e) => setId(e.target.value)} autoComplete="username" />}</Field>
              <Captcha onChange={onCaptcha} refreshKey={capKey} />
              <Button type="submit" variant="primary" block loading={busy} disabled={!identifier}>{t('login.sendOtp')}</Button>
            </form>
          )}
        </CardBody></Card>
      </Page>
    </>
  );
}
