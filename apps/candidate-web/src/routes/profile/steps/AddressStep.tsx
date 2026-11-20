import type { AddressInput, AddressLine } from '@vtl/shared';
import { addressSchema } from '@vtl/shared';
import { Alert, Checkbox, Field, Input, Select } from '@vtl/ui';
import { useState } from 'react';
import { useForm, type UseFormRegister, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useAutoSave, useDistricts, useSetProfile, useStates, type Profile } from '../../../features/profile';
import { api } from '../../../lib/api';
import { applyServerErrors, tr } from '../../../lib/forms';
import { StepCard, StepNav, type StepProps } from '../Wizard';

const empty: AddressLine = { line1: '', line2: '', city: '', stateCode: '', districtId: 0, pin: '' };

export function AddressStep({ profile, onNext, onBack, readOnly }: StepProps) {
  const { t } = useTranslation();
  const setProfile = useSetProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const a = profile.address;
  const { register, watch, handleSubmit, setValue, setError, formState: { errors, isSubmitting } } = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: { permanent: a?.permanent ?? empty, correspondenceSameAsPermanent: a?.correspondenceSameAsPermanent ?? true, correspondence: a?.correspondence ?? (a?.correspondenceSameAsPermanent === false ? empty : undefined) },
    disabled: readOnly,
    shouldUnregister: true,
  });
  const v = watch();
  const same = v.correspondenceSameAsPermanent;
  const save = useAutoSave(v, async (x) => {
    if (!x.permanent.line1) return;
    setProfile(await api.put<Profile>('/me/profile/address', { final: false, data: { permanent: { ...x.permanent, districtId: Number(x.permanent.districtId) || undefined }, correspondenceSameAsPermanent: x.correspondenceSameAsPermanent } }));
  }, !readOnly);
  const submit = handleSubmit(async (x) => {
    setFormError(null);
    try {
      const data = { ...x, correspondence: x.correspondenceSameAsPermanent ? undefined : x.correspondence };
      setProfile(await api.put<Profile>('/me/profile/address', { final: true, data }));
      onNext();
    } catch (e) {
      setFormError(applyServerErrors(e, setError, t));
    }
  }, () => setFormError(t('errors.VALIDATION_FAILED')));
  return (
    <form onSubmit={submit} noValidate>
      <StepCard title={t('wizard.steps.address')} description={t('wizard.addressDesc')} saveStatus={save} footer={!readOnly && <StepNav onBack={onBack} loading={isSubmitting} />}>
        {formError && <Alert tone="danger" className="mb-4">{formError}</Alert>}
        <h3 className="mb-3 font-semibold">{t('fields.permanentAddress')}</h3>
        <AddressFields prefix="permanent" register={register} errors={errors.permanent} stateCode={v.permanent.stateCode} onStateChange={() => setValue('permanent.districtId', 0)} />
        <div className="my-5 border-t border-border pt-5">
          <Checkbox label={t('fields.sameAddress')} {...register('correspondenceSameAsPermanent')} data-testid="addr-same" />
        </div>
        {!same && (
          <>
            <h3 className="mb-3 font-semibold">{t('fields.correspondenceAddress')}</h3>
            <AddressFields prefix="correspondence" register={register} errors={errors.correspondence} stateCode={v.correspondence?.stateCode} onStateChange={() => setValue('correspondence.districtId', 0)} />
          </>
        )}
      </StepCard>
    </form>
  );
}

function AddressFields({ prefix, register, errors, stateCode, onStateChange }: { prefix: 'permanent' | 'correspondence'; register: UseFormRegister<AddressInput>; errors?: FieldErrors<AddressLine>; stateCode?: string; onStateChange: () => void }) {
  const { t, i18n } = useTranslation();
  const states = useStates();
  const districts = useDistricts(stateCode);
  const e = (k: keyof AddressLine) => tr(t, errors?.[k]?.message);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('fields.line1')} error={e('line1')} required className="sm:col-span-2">{(f) => <Input id={f.id} aria-invalid={f.invalid} autoComplete="address-line1" {...register(`${prefix}.line1`)} data-testid={`${prefix}-line1`} />}</Field>
      <Field label={t('fields.line2')} error={e('line2')} className="sm:col-span-2">{(f) => <Input id={f.id} autoComplete="address-line2" {...register(`${prefix}.line2`)} />}</Field>
      <Field label={t('fields.state')} error={e('stateCode')} required>
        {(f) => <Select id={f.id} aria-invalid={f.invalid} {...register(`${prefix}.stateCode`, { onChange: onStateChange })} data-testid={`${prefix}-state`}><option value="">{t('app.select')}</option>{states.data?.map((s) => <option key={s.code} value={s.code}>{i18n.language === 'hi' ? s.nameHi : s.nameEn}</option>)}</Select>}
      </Field>
      <Field label={t('fields.district')} error={e('districtId')} required>
        {(f) => <Select id={f.id} aria-invalid={f.invalid} disabled={!stateCode} {...register(`${prefix}.districtId`, { valueAsNumber: true })} data-testid={`${prefix}-district`}><option value={0}>{t('app.select')}</option>{districts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
      </Field>
      <Field label={t('fields.city')} error={e('city')} required>{(f) => <Input id={f.id} aria-invalid={f.invalid} autoComplete="address-level2" {...register(`${prefix}.city`)} data-testid={`${prefix}-city`} />}</Field>
      <Field label={t('fields.pin')} error={e('pin')} required>{(f) => <Input id={f.id} aria-invalid={f.invalid} inputMode="numeric" maxLength={6} autoComplete="postal-code" className="tabular-nums" {...register(`${prefix}.pin`)} data-testid={`${prefix}-pin`} />}</Field>
    </div>
  );
}
