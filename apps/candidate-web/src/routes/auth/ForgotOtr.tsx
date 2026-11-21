import { Alert, Button, Card, CardBody, Field, Input } from '@vtl/ui';
import { useCallback, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Captcha, type CaptchaValue } from '../../components/Captcha';
import { AuthPage, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/forms';

export default function ForgotOtr() {
  const { t } = useTranslation();
  const [identifier, setId] = useState('');
  const [dob, setDob] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaValue | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onCaptcha = useCallback((v: CaptchaValue) => setCaptcha(v), []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot/otr-id', { identifier, dob, ...captcha });
      setDone(true);
    } catch (er) {
      setError(errorMessage(er, t));
      setCapKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={t('forgotOtr.title')} description={t('forgotOtr.subtitle')} />
      <AuthPage>
        <Card><CardBody>
          {done ? (
            <Alert tone="success" title={t('forgotOtr.sentTitle')}>{t('forgotOtr.sentBody')}<div className="mt-3"><Link to="/login" className="text-info underline">{t('nav.login')}</Link></div></Alert>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
              {error && <Alert tone="danger">{error}</Alert>}
              <Field label={t('forgotOtr.identifier')} required>{(p) => <Input id={p.id} value={identifier} onChange={(e) => setId(e.target.value)} autoComplete="username" />}</Field>
              <Field label={t('fields.dob')} required>{(p) => <Input id={p.id} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />}</Field>
              <Captcha onChange={onCaptcha} refreshKey={capKey} />
              <Button type="submit" variant="primary" block loading={busy} disabled={!identifier || !dob}>{t('forgotOtr.submit')}</Button>
            </form>
          )}
        </CardBody></Card>
      </AuthPage>
    </>
  );
}
