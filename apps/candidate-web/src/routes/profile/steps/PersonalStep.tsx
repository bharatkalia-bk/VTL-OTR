import { zodResolver } from '@hookform/resolvers/zod';
import { GENDERS, MARITAL_STATUSES, personalSchema, type PersonalInput } from '@vtl/shared';
import { Alert, Button, Field, Input, OtpInput, RadioGroup, Select } from '@vtl/ui';
import { BadgeCheck } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAutoSave, useSetProfile, type Profile } from '../../../features/profile';
import { api } from '../../../lib/api';
import { applyServerErrors, errorMessage, tr } from '../../../lib/forms';
import { StepCard, StepNav, type StepProps } from '../Wizard';

export function PersonalStep({ profile, onNext, readOnly }: StepProps) {
  const { t } = useTranslation();
  const setProfile = useSetProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const p = profile.personal;
  const { register, handleSubmit, control, watch, setError, formState: { errors, isSubmitting } } = useForm<PersonalInput>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      fullName: p.fullName ?? '', fatherName: p.fatherName ?? '', motherName: p.motherName ?? '', dob: p.dob ?? '', gender: (p.gender as PersonalInput['gender']) ?? undefined,
      nationality: (p.nationality as PersonalInput['nationality']) ?? 'INDIAN', maritalStatus: (p.maritalStatus as PersonalInput['maritalStatus']) ?? undefined,
      identificationMark1: p.identificationMark1 ?? '', identificationMark2: p.identificationMark2 ?? '',
    },
    disabled: readOnly,
  });
  const values = watch();
  const save = useAutoSave(values, async (v) => {
    const clean = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined));
    setProfile(await api.put<Profile>('/me/profile/personal', { final: false, data: clean }));
  }, !readOnly);
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      setProfile(await api.put<Profile>('/me/profile/personal', { final: true, data: v }));
      onNext();
    } catch (e) {
      setFormError(applyServerErrors(e, setError, t));
    }
  }, () => setFormError(t('errors.VALIDATION_FAILED')));
  const err = (k: keyof PersonalInput) => tr(t, errors[k]?.message);
  const inp = (k: keyof PersonalInput, extra: Record<string, unknown> = {}) => (f: { id: string; describedBy?: string; invalid: boolean }) => (
    <Input id={f.id} aria-describedby={f.describedBy} aria-invalid={f.invalid} {...register(k)} {...extra} data-testid={`personal-${k}`} />
  );
  return (
    <form onSubmit={submit} noValidate>
      <StepCard title={t('wizard.steps.personal')} description={t('wizard.personalDesc')} saveStatus={save}
        footer={!readOnly && <StepNav first loading={isSubmitting} />}>
        {formError && <Alert tone="danger" className="mb-4">{formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fields.fullName')} hint={t('fields.fullNameHint')} error={err('fullName')} required className="sm:col-span-2">{inp('fullName', { autoComplete: 'name' })}</Field>
          <Field label={t('fields.fatherName')} error={err('fatherName')} required>{inp('fatherName')}</Field>
          <Field label={t('fields.motherName')} error={err('motherName')} required>{inp('motherName')}</Field>
          <Field label={t('fields.dob')} error={err('dob')} required>{inp('dob', { type: 'date', className: 'tabular-nums' })}</Field>
          <Field label={t('fields.nationality')} error={err('nationality')} required>
            {(f) => <Select id={f.id} {...register('nationality')}>{(['INDIAN', 'NEPAL', 'BHUTAN', 'OTHER'] as const).map((n) => <option key={n} value={n}>{t(`enums.nationality.${n}`)}</option>)}</Select>}
          </Field>
          <div className="sm:col-span-2">
            <Controller control={control} name="gender" render={({ field }) => (
              <RadioGroup name="gender" legend={t('fields.gender')} required value={field.value} onChange={field.onChange} error={err('gender')} options={GENDERS.map((g) => ({ value: g, label: t(`enums.gender.${g}`) }))} />
            )} />
          </div>
          <Field label={t('fields.maritalStatus')} error={err('maritalStatus')} required>
            {(f) => <Select id={f.id} aria-invalid={f.invalid} {...register('maritalStatus')} data-testid="personal-maritalStatus"><option value="">{t('app.select')}</option>{MARITAL_STATUSES.map((m) => <option key={m} value={m}>{t(`enums.marital.${m}`)}</option>)}</Select>}
          </Field>
          <span className="hidden sm:block" />
          <Field label={t('fields.idMark1')} error={err('identificationMark1')} required>{inp('identificationMark1')}</Field>
          <Field label={t('fields.idMark2')} error={err('identificationMark2')}>{inp('identificationMark2')}</Field>
        </div>
      </StepCard>
      <IdentityCard profile={profile} />
    </form>
  );
}

/** Optional Aadhaar e-KYC and APAAR linking (adapter-based; only masked Aadhaar is stored). */
function IdentityCard({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const setProfile = useSetProfile();
  const [aadhaar, setAadhaar] = useState('');
  const [txn, setTxn] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [apaar, setApaar] = useState('');
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e, t) }); } finally { setBusy(false); } };
  const refresh = async () => setProfile(await api.get<Profile>('/me/profile'));
  return (
    <div className="mt-4 rounded-card border border-border bg-white p-4 sm:p-6">
      <h3 className="font-semibold">{t('identity.title')} <span className="text-sm font-normal text-ink-muted">({t('app.optional')})</span></h3>
      <p className="text-sm text-ink-muted">{t('identity.desc')}</p>
      {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium">{t('identity.aadhaar')}</p>
          {profile.identity.aadhaarMasked ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-success"><BadgeCheck className="h-4 w-4" aria-hidden />{t('identity.verified')} <span className="tabular-nums text-navy">{profile.identity.aadhaarMasked}</span></p>
          ) : txn ? (
            <div className="mt-2 space-y-2">
              <OtpInput label={t('identity.aadhaarOtp')} value={otp} onChange={setOtp} idPrefix="aotp" />
              <Button variant="secondary" size="sm" loading={busy} disabled={otp.length !== 6} onClick={() => void run(async () => { await api.post('/me/identity/aadhaar/verify', { txnId: txn, otp }); await refresh(); setTxn(null); })}>{t('identity.verifyOtp')}</Button>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <Field label={t('identity.aadhaarNumber')} className="flex-1">{(f) => <Input id={f.id} inputMode="numeric" maxLength={14} autoComplete="off" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} />}</Field>
              <Button className="self-end" size="md" loading={busy} disabled={aadhaar.replace(/\D/g, '').length !== 12} onClick={() => void run(async () => { const r = await api.post<{ txnId: string }>('/me/identity/aadhaar/initiate', { aadhaar, consent: true }); setTxn(r.txnId); setAadhaar(''); })}>{t('identity.sendOtp')}</Button>
            </div>
          )}
          <p className="mt-1 text-xs text-ink-muted">{t('identity.aadhaarNote')}</p>
        </div>
        <div>
          <p className="text-sm font-medium">{t('identity.apaar')}</p>
          {profile.identity.apaarId ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-success"><BadgeCheck className="h-4 w-4" aria-hidden />{t('identity.linked')} <span className="tabular-nums text-navy">{profile.identity.apaarId}</span></p>
          ) : (
            <div className="mt-2 flex gap-2">
              <Field label={t('identity.apaarId')} className="flex-1">{(f) => <Input id={f.id} inputMode="numeric" maxLength={12} value={apaar} onChange={(e) => setApaar(e.target.value)} />}</Field>
              <Button className="self-end" loading={busy} disabled={apaar.length !== 12} onClick={() => void run(async () => { await api.post('/me/identity/apaar', { apaarId: apaar }); await refresh(); })}>{t('identity.link')}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
