import type { SessionUser } from '@vtl/shared';
import { Alert, Button, Card, CardBody, Field, Input, OtpInput, Tabs } from '@vtl/ui';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Captcha, type CaptchaValue } from '../../components/Captcha';
import { AuthPage, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/forms';

export default function Login() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  return (
    <>
      <PageHeader title={t('login.title')} description={t('login.subtitle')} />
      <AuthPage>
        <Card>
          <div className="px-4 pt-2 sm:px-6"><Tabs label={t('login.title')} value={mode} onChange={setMode} tabs={[{ value: 'password', label: t('login.withPassword') }, { value: 'otp', label: t('login.withOtp') }]} /></div>
          <CardBody>{mode === 'password' ? <PasswordLogin /> : <OtpLogin />}</CardBody>
        </Card>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          <Link to="/forgot-otr" className="text-info underline">{t('login.forgotOtr')}</Link>
          <Link to="/forgot-password" className="text-info underline">{t('login.forgotPassword')}</Link>
        </div>
        <p className="mt-6 text-center text-sm text-ink-muted">{t('login.newHere')} <Link to="/register" className="font-medium text-info underline">{t('nav.register')}</Link></p>
      </AuthPage>
    </>
  );
}

function useAfterLogin() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  return (u: SessionUser) => {
    setUser(u);
    const next = sp.get('next');
    nav(next && next.startsWith('/') && !next.startsWith('//') ? next : u.status === 'DRAFT' ? '/profile' : '/dashboard');
  };
}

function PasswordLogin() {
  const { t } = useTranslation();
  const after = useAfterLogin();
  const [identifier, setId] = useState('');
  const [password, setPw] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaValue | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onCaptcha = useCallback((v: CaptchaValue) => setCaptcha(v), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      after(await api.post<SessionUser>('/auth/login', { identifier, password, ...captcha }));
    } catch (er) {
      setError(errorMessage(er, t));
      setCapKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label={t('login.identifier')} hint={t('login.identifierHint')} required>{(p) => <Input id={p.id} aria-describedby={p.describedBy} autoComplete="username" value={identifier} onChange={(e) => setId(e.target.value)} data-testid="login-id" />}</Field>
      <Field label={t('fields.password')} required>{(p) => <Input id={p.id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPw(e.target.value)} data-testid="login-pw" />}</Field>
      <Captcha onChange={onCaptcha} refreshKey={capKey} />
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!identifier || !password} data-testid="login-submit">{t('login.submit')}</Button>
    </form>
  );
}

function OtpLogin() {
  const { t } = useTranslation();
  const after = useAfterLogin();
  const [identifier, setId] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaValue | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [ch, setCh] = useState<{ challengeId: string; sentTo: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onCaptcha = useCallback((v: CaptchaValue) => setCaptcha(v), []);
  const request = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCh(await api.post('/auth/login/otp/request', { identifier, ...captcha }));
    } catch (er) {
      setError(errorMessage(er, t));
      setCapKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      after(await api.post<SessionUser>('/auth/login/otp/verify', { challengeId: ch!.challengeId, otp }));
    } catch (er) {
      setError(errorMessage(er, t));
    } finally {
      setBusy(false);
    }
  };
  if (ch) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">{t('login.otpSentTo', { to: ch.sentTo })}</p>
        {error && <Alert tone="danger">{error}</Alert>}
        <OtpInput label={t('login.otp')} value={otp} onChange={setOtp} />
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void verify()} disabled={otp.length !== 6} loading={busy}>{t('login.verifyLogin')}</Button>
          <Button variant="ghost" onClick={() => { setCh(null); setOtp(''); }}>{t('app.back')}</Button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => void request(e)} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label={t('login.identifier')} hint={t('login.identifierHint')} required>{(p) => <Input id={p.id} aria-describedby={p.describedBy} autoComplete="username" value={identifier} onChange={(e) => setId(e.target.value)} />}</Field>
      <Captcha onChange={onCaptcha} refreshKey={capKey} />
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!identifier}>{t('login.sendOtp')}</Button>
    </form>
  );
}
