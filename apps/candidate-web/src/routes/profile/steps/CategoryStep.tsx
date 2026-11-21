import { CATEGORIES, LANGUAGES, PWD_TYPES } from '@vtl/shared';
import { Alert, Checkbox, Field, Input, RadioGroup, Select } from '@vtl/ui';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DocUpload } from '../../../features/DocUpload';
import { useAutoSave, useSetProfile, useStates, type Profile } from '../../../features/profile';
import { api } from '../../../lib/api';
import { applyServerErrors } from '../../../lib/forms';
import { StepCard, StepNav, type StepProps } from '../Wizard';

interface Form { category: string; pwd: boolean; pwdType: string | null; pwdPercent: number | null; exServiceman: boolean; serviceYears: number | null; domicileStateCode: string; categoryCertDocId: string | null; pwdCertDocId: string | null; exsmCertDocId: string | null; languages: string[] }

export function CategoryStep({ profile, onNext, onBack, readOnly }: StepProps) {
  const { t, i18n } = useTranslation();
  const setProfile = useSetProfile();
  const states = useStates();
  const [formError, setFormError] = useState<string | null>(null);
  const c = profile.category;
  const { register, control, watch, handleSubmit, setValue, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    defaultValues: { category: c.category ?? '', pwd: c.pwd, pwdType: c.pwdType, pwdPercent: c.pwdPercent, exServiceman: c.exServiceman, serviceYears: c.serviceYears, domicileStateCode: c.domicileStateCode ?? '', categoryCertDocId: c.categoryCertDocId, pwdCertDocId: c.pwdCertDocId, exsmCertDocId: c.exsmCertDocId, languages: c.languages ?? [] },
    disabled: readOnly,
  });
  const v = watch();
  const norm = (x: Form) => ({ ...x, pwdPercent: x.pwdPercent ? Number(x.pwdPercent) : null, serviceYears: x.serviceYears !== null && x.serviceYears !== undefined && String(x.serviceYears) !== '' ? Number(x.serviceYears) : null, pwdType: x.pwdType || null });
  const save = useAutoSave(v, async (x) => {
    const d = Object.fromEntries(Object.entries(norm(x)).filter(([, val]) => val !== '' && val !== null));
    setProfile(await api.put<Profile>('/me/profile/category', { final: false, data: d }));
  }, !readOnly);
  const submit = handleSubmit(async (x) => {
    setFormError(null);
    try {
      setProfile(await api.put<Profile>('/me/profile/category', { final: true, data: norm(x) }));
      onNext();
    } catch (e) {
      setFormError(applyServerErrors(e, setError, t));
    }
  }, () => setFormError(t('errors.VALIDATION_FAILED')));
  const fe = (k: keyof Form) => (errors[k]?.message ? String(errors[k]?.message).startsWith('validation.') ? t(String(errors[k]?.message)) : String(errors[k]?.message) : undefined);
  return (
    <form onSubmit={submit} noValidate>
      <StepCard title={t('wizard.steps.category')} description={t('wizard.categoryDesc')} saveStatus={save} footer={!readOnly && <StepNav onBack={onBack} loading={isSubmitting} />}>
        {formError && <Alert tone="danger" className="mb-4">{formError}</Alert>}
        <div className="space-y-5">
          <Controller control={control} name="category" render={({ field }) => (
            <RadioGroup name="category" legend={t('fields.category')} required value={field.value} onChange={field.onChange} error={fe('category')} options={CATEGORIES.map((x) => ({ value: x, label: t(`enums.category.${x}`) }))} />
          )} />
          {v.category && v.category !== 'GEN' && (
            <Controller control={control} name="categoryCertDocId" render={({ field }) => (
              <DocUpload label={t('fields.categoryCert', { category: t(`enums.category.${v.category}`) })} kind={v.category === 'EWS' ? 'EWS_CERT' : 'CATEGORY_CERT'} value={field.value} onChange={field.onChange} docs={profile.documents} disabled={readOnly} error={fe('categoryCertDocId')} />
            )} />
          )}
          <Field label={t('fields.domicile')} hint={t('fields.domicileHint')} error={fe('domicileStateCode')} required>
            {(f) => <Select id={f.id} {...register('domicileStateCode')} data-testid="cat-domicile"><option value="">{t('app.select')}</option>{states.data?.map((s) => <option key={s.code} value={s.code}>{i18n.language === 'hi' ? s.nameHi : s.nameEn}</option>)}</Select>}
          </Field>
          <fieldset className="rounded border border-border p-4">
            <legend className="px-1 text-sm font-medium">{t('languages.label')}</legend>
            <p className="mb-2 text-xs text-ink-muted">{t('languages.hint')}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LANGUAGES.map((l) => <Checkbox key={l} label={l} checked={(v.languages ?? []).includes(l)} disabled={readOnly} onChange={(e) => setValue('languages', e.target.checked ? [...(v.languages ?? []), l] : (v.languages ?? []).filter((x) => x !== l))} />)}
            </div>
          </fieldset>
          <fieldset className="rounded border border-border p-4">
            <legend className="px-1 text-sm font-medium">{t('fields.pwdSection')}</legend>
            <Checkbox label={t('fields.pwd')} description={t('fields.pwdHint')} {...register('pwd')} onChange={(e) => setValue('pwd', e.target.checked)} checked={v.pwd} />
            {v.pwd && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label={t('fields.pwdType')} error={fe('pwdType')} required>{(f) => <Select id={f.id} {...register('pwdType')}><option value="">{t('app.select')}</option>{PWD_TYPES.map((p) => <option key={p} value={p}>{t(`enums.pwd.${p}`)}</option>)}</Select>}</Field>
                <Field label={t('fields.pwdPercent')} hint={t('fields.pwdPercentHint')} error={fe('pwdPercent')} required>{(f) => <Input id={f.id} type="number" min={40} max={100} {...register('pwdPercent')} />}</Field>
                <div className="sm:col-span-2"><Controller control={control} name="pwdCertDocId" render={({ field }) => <DocUpload label={t('fields.pwdCert')} kind="PWD_CERT" value={field.value} onChange={field.onChange} docs={profile.documents} disabled={readOnly} />} /></div>
              </div>
            )}
          </fieldset>
          <fieldset className="rounded border border-border p-4">
            <legend className="px-1 text-sm font-medium">{t('fields.exsmSection')}</legend>
            <Checkbox label={t('fields.exServiceman')} {...register('exServiceman')} onChange={(e) => setValue('exServiceman', e.target.checked)} checked={v.exServiceman} />
            {v.exServiceman && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label={t('fields.serviceYears')} error={fe('serviceYears')} required>{(f) => <Input id={f.id} type="number" min={0} max={40} {...register('serviceYears')} />}</Field>
                <div className="sm:col-span-2"><Controller control={control} name="exsmCertDocId" render={({ field }) => <DocUpload label={t('fields.exsmCert')} kind="EXSM_CERT" value={field.value} onChange={field.onChange} docs={profile.documents} disabled={readOnly} />} /></div>
              </div>
            )}
          </fieldset>
        </div>
      </StepCard>
    </form>
  );
}
