import { zodResolver } from '@hookform/resolvers/zod';
import { CONSENT_NOTICE_VERSION, GENDERS, registerStartSchema, setPasswordSchema } from '@vtl/shared';
import { Alert, Button, Card, CardBody, Checkbox, Field, Input, OtpInput, RadioGroup, Stepper } from '@vtl/ui';
import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { z } from 'zod';
import { Captcha, type CaptchaValue } from '../../components/Captcha';
import { Page, PageHeader } from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { applyServerErrors, errorMessage, tr } from '../../lib/forms';
import type { SessionUser } from '@vtl/shared';

const startForm = registerStartSchema.omit({ captchaId: true, captchaText: true, consentNoticeVersion: true, language: true });
type StartForm = z.input<typeof startForm>;

export default function Register() {
  const { t, i18n } = useTranslation();
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [reg, setReg] = useState<{ registrationId: string; maskedMobile: string; maskedEmail: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const steps = [{ key: 'details', label: t('register.stepDetails') }, { key: 'verify', label: t('register.stepVerify') }, { key: 'password', label: t('register.stepPassword') }];
  return (
    <>
      <PageHeader title={t('register.title')} description={t('register.subtitle')} />
      <Page narrow>
        <div className="mb-4"><Stepper steps={steps} current={stage} stepOfLabel={(c, n) => t('common.stepOf', { cur: c, total: n })} /></div>
        {stage === 0 && <DetailsStep lang={i18n.language} onDone={(r) => { setReg(r); setStage(1); }} />}
        {stage === 1 && reg && <VerifyStep reg={reg} onResent={(id) => setReg({ ...reg, registrationId: id })} onDone={(tk) => { setToken(tk); setStage(2); }} />}
        {stage === 2 && token && <PasswordStep token={token} />}
        <p className="mt-6 text-center text-sm text-ink-muted">{t('register.haveAccount')} <Link to="/login" className="font-medium text-info underline">{t('nav.login')}</Link></p>
      </Page>
    </>
  );
}

function DetailsStep({ lang, onDone }: { lang: string; onDone: (r: { registrationId: string; maskedMobile: string; maskedEmail: string }) => void }) {
  const { t } = useTranslation();
  const [captcha, setCaptcha] = useState<CaptchaValue | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<StartForm>({ resolver: zodResolver(startForm), defaultValues: { gender: undefined, consent: undefined as unknown as true } });
  const onCaptcha = useCallback((v: CaptchaValue) => setCaptcha(v), []);
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const r = await api.post<{ registrationId: string; maskedMobile: string; maskedEmail: string }>('/auth/register/start', { ...v, ...captcha, consentNoticeVersion: CONSENT_NOTICE_VERSION, language: lang });
      onDone(r);
    } catch (e) {
      setFormError(applyServerErrors(e, setError, t));
      setCapKey((k) => k + 1);
    }
  });
  const err = (k: keyof StartForm) => tr(t, errors[k]?.message as string | undefined);
  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4" aria-describedby={formError ? 'reg-error' : undefined}>
          {formError && <div id="reg-error"><Alert tone="danger">{formError}</Alert></div>}
          <Alert tone="info">{t('register.nameHint')}</Alert>
          <Field label={t('fields.fullName')} error={err('fullName')} required>{(p) => <Input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} autoComplete="name" {...register('fullName')} data-testid="reg-fullName" />}</Field>
          <Field label={t('fields.fatherName')} error={err('fatherName')} required>{(p) => <Input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} {...register('fatherName')} data-testid="reg-fatherName" />}</Field>
          <Field label={t('fields.dob')} hint={t('fields.dobHint')} error={err('dob')} required>{(p) => <Input id={p.id} type="date" aria-describedby={p.describedBy} aria-invalid={p.invalid} className="tabular-nums" {...register('dob')} data-testid="reg-dob" />}</Field>
          <Controller control={control} name="gender" render={({ field }) => (
            <RadioGroup name="gender" legend={t('fields.gender')} required value={field.value} onChange={field.onChange} error={err('gender')}
              options={GENDERS.map((g) => ({ value: g, label: t(`enums.gender.${g}`) }))} />
          )} />
          <Field label={t('fields.mobile')} hint={t('fields.mobileHint')} error={err('mobile')} required>{(p) => <Input id={p.id} aria-describedby={p.describedBy} aria-invalid={p.invalid} inputMode="numeric" autoComplete="tel-national" maxLength={10} className="tabular-nums" {...register('mobile')} data-testid="reg-mobile" />}</Field>
          <Field label={t('fields.email')} error={err('email')} required>{(p) => <Input id={p.id} type="email" aria-describedby={p.describedBy} aria-invalid={p.invalid} autoComplete="email" {...register('email')} data-testid="reg-email" />}</Field>
          <div className="rounded border border-border bg-surface p-3 text-sm">
            <p className="font-semibold">{t('consent.title')}</p>
            <p className="mt-1 text-ink-muted">{t('consent.purpose')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted"><li>{t('consent.point1')}</li><li>{t('consent.point2')}</li><li>{t('consent.point3')}</li></ul>
            <Link to="/legal/privacy" className="mt-2 inline-block text-info underline" target="_blank">{t('consent.readNotice')}</Link>
            <Checkbox className="mt-3" label={t('consent.agree')} {...register('consent')} data-testid="reg-consent" />
            {errors.consent && <p role="alert" className="mt-1 text-xs font-medium text-danger">{t('validation.consent')}</p>}
          </div>
          <Captcha onChange={onCaptcha} refreshKey={capKey} />
          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} data-testid="reg-submit">{t('register.sendOtp')}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function VerifyStep({ reg, onDone, onResent }: { reg: { registrationId: string; maskedMobile: string; maskedEmail: string }; onDone: (token: string) => void; onResent: (id: string) => void }) {
  const { t } = useTranslation();
  const [mobileOtp, setMobileOtp] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ registrationToken: string }>('/auth/register/verify', { registrationId: reg.registrationId, mobileOtp, emailOtp });
      onDone(r.registrationToken);
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    try {
      const r = await api.post<{ registrationId: string }>('/auth/register/resend', { registrationId: reg.registrationId });
      onResent(r.registrationId);
      setInfo(t('register.otpResent'));
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };
  return (
    <Card>
      <CardBody className="space-y-5">
        <p className="text-sm text-ink-muted">{t('register.otpSent', { mobile: reg.maskedMobile, email: reg.maskedEmail })}</p>
        {error && <Alert tone="danger">{error}</Alert>}
        {info && <Alert tone="success">{info}</Alert>}
        <div><p className="mb-2 text-sm font-medium">{t('register.mobileOtp')} <span className="tabular-nums text-ink-muted">({reg.maskedMobile})</span></p><OtpInput idPrefix="motp" label={t('register.mobileOtp')} value={mobileOtp} onChange={setMobileOtp} /></div>
        <div><p className="mb-2 text-sm font-medium">{t('register.emailOtp')} <span className="text-ink-muted">({reg.maskedEmail})</span></p><OtpInput idPrefix="eotp" label={t('register.emailOtp')} value={emailOtp} onChange={setEmailOtp} /></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={() => void verify()} disabled={mobileOtp.length !== 6 || emailOtp.length !== 6} loading={busy} data-testid="otp-verify">{t('register.verify')}</Button>
          <Button variant="ghost" onClick={() => void resend()}>{t('register.resend')}</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function PasswordStep({ token }: { token: string }) {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const schema = setPasswordSchema;
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { registrationToken: token } });
  const submit = handleSubmit(async (v) => {
    try {
      const u = await api.post<SessionUser>('/auth/register/password', v);
      setUser(u);
      nav('/profile/personal');
    } catch (e) {
      setFormError(applyServerErrors(e, setError, t));
    }
  });
  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Alert tone="success" title={t('register.verifiedTitle')}>{t('register.verifiedBody')}</Alert>
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label={t('fields.password')} hint={t('fields.passwordHint')} error={tr(t, errors.password?.message)} required>{(p) => <Input id={p.id} type="password" autoComplete="new-password" aria-describedby={p.describedBy} aria-invalid={p.invalid} {...register('password')} data-testid="pw" />}</Field>
          <Field label={t('fields.confirmPassword')} error={tr(t, errors.confirmPassword?.message)} required>{(p) => <Input id={p.id} type="password" autoComplete="new-password" aria-describedby={p.describedBy} aria-invalid={p.invalid} {...register('confirmPassword')} data-testid="pw2" />}</Field>
          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting} data-testid="pw-submit">{t('register.createAccount')}</Button>
        </form>
      </CardBody>
    </Card>
  );
}
