import { EDUCATION_LEVELS, educationSchema, type EducationEntry, type EducationInput } from '@vtl/shared';
import { Alert, Button, Field, Input, Select } from '@vtl/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { CloudDownload, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { DocUpload } from '../../../features/DocUpload';
import { useMaster, useSetProfile, type Profile } from '../../../features/profile';
import { api } from '../../../lib/api';
import { applyServerErrors, errorMessage, tr } from '../../../lib/forms';
import { StepCard, StepNav, type StepProps } from '../Wizard';

const blank = (level: EducationEntry['level']): EducationEntry => ({ level, qualificationName: '', boardOrUniversity: '', yearOfPassing: new Date().getFullYear(), status: 'PASSED', resultType: 'PERCENT', marks: 0, maxMarks: null, cgpaScale: null, rollNo: '', documentId: null });
const DOC_KIND: Record<string, string> = { CLASS_10: 'EDU_CLASS_10', CLASS_12: 'EDU_CLASS_12', DIPLOMA: 'EDU_DIPLOMA', GRADUATION: 'EDU_GRADUATION', PG: 'EDU_PG', OTHER: 'EDU_OTHER' };

export function EducationStep({ profile, onNext, onBack }: StepProps) {
  const { t } = useTranslation();
  const setProfile = useSetProfile();
  const [sp, setSp] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const [dlMsg, setDlMsg] = useState<string | null>(null);
  const boards = useMaster<{ id: number; name: string }>('boards');
  const univs = useMaster<{ id: number; name: string }>('universities');
  const quals = useMaster<{ id: number; level: string; name: string }>('qualifications');
  const initial: EducationEntry[] = profile.education.length
    ? profile.education.map((e) => ({ ...e, level: e.level as EducationEntry['level'], status: e.status as EducationEntry['status'], resultType: e.resultType as EducationEntry['resultType'], rollNo: e.rollNo ?? '' }))
    : [blank('CLASS_10')];
  const { control, register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<EducationInput>({ resolver: zodResolver(educationSchema), defaultValues: { entries: initial } });
  const { fields, append, remove } = useFieldArray({ control, name: 'entries' });
  const entries = watch('entries');

  useEffect(() => {
    const s = sp.get('digilocker');
    if (s) {
      setDlMsg(s === 'ok' ? t('education.digilockerOk') : t('education.digilockerExpired'));
      void api.get<Profile>('/me/profile').then(setProfile);
      sp.delete('digilocker');
      setSp(sp, { replace: true });
    }
  }, [sp, setSp, t, setProfile]);

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const data = { entries: v.entries.map((e) => ({ ...e, yearOfPassing: Number(e.yearOfPassing), marks: Number(e.marks), maxMarks: e.maxMarks ? Number(e.maxMarks) : null, cgpaScale: e.resultType === 'CGPA' ? Number(e.cgpaScale ?? 10) : null })) };
      setProfile(await api.put<Profile>('/me/profile/education', { final: true, data }));
      onNext();
    } catch (e) {
      setFormError(applyServerErrors(e, setError, t));
    }
  }, () => setFormError(t('errors.VALIDATION_FAILED')));
  const connectDigiLocker = async () => {
    try {
      const r = await api.post<{ url: string }>('/me/identity/digilocker/connect');
      window.location.assign(r.url);
    } catch (e) {
      setDlMsg(errorMessage(e, t));
    }
  };
  const used = new Set(entries.map((e) => e.level));
  const nextLevel = EDUCATION_LEVELS.find((l) => !used.has(l) || l === 'OTHER') ?? 'OTHER';
  return (
    <form onSubmit={submit} noValidate>
      <StepCard title={t('wizard.steps.education')} description={t('wizard.educationDesc')} footer={<StepNav onBack={onBack} loading={isSubmitting} />}>
        {formError && <Alert tone="danger" className="mb-4">{formError}</Alert>}
        {errors.entries?.root?.message && <Alert tone="danger" className="mb-4">{tr(t, errors.entries.root.message)}</Alert>}
        {errors.entries?.message && <Alert tone="danger" className="mb-4">{tr(t, errors.entries.message)}</Alert>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-info/30 bg-info-50 p-3">
          <p className="text-sm text-navy">{profile.identity.digilockerLinkedAt ? t('education.digilockerLinked') : t('education.digilockerPrompt')}</p>
          <Button size="sm" variant="secondary" onClick={() => void connectDigiLocker()}><CloudDownload className="h-4 w-4" aria-hidden />{t('education.fetchDigilocker')}</Button>
        </div>
        {dlMsg && <Alert tone="info" className="mb-4">{dlMsg}</Alert>}
        <datalist id="boards-list">{[...(boards.data ?? []), ...(univs.data ?? [])].map((b) => <option key={`${b.id}-${b.name}`} value={b.name} />)}</datalist>
        <div className="space-y-4">
          {fields.map((f, i) => {
            const e = entries[i];
            const er = errors.entries?.[i];
            const qualOptions = quals.data?.filter((q) => q.level === e?.level) ?? [];
            return (
              <fieldset key={f.id} className="rounded border border-border p-4" data-testid={`edu-${i}`}>
                <legend className="px-1 text-sm font-semibold">{t(`enums.education.${e?.level ?? 'OTHER'}`)}</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label={t('fields.level')} required>{(x) => <Select id={x.id} {...register(`entries.${i}.level`)} disabled={i === 0 && e?.level === 'CLASS_10'}>{EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{t(`enums.education.${l}`)}</option>)}</Select>}</Field>
                  <Field label={t('fields.qualification')} error={tr(t, er?.qualificationName?.message)} required>
                    {(x) => (
                      <>
                        <Input id={x.id} list={`qual-${i}`} {...register(`entries.${i}.qualificationName`)} data-testid={`edu-${i}-qual`} />
                        <datalist id={`qual-${i}`}>{qualOptions.map((q) => <option key={q.id} value={q.name} />)}</datalist>
                      </>
                    )}
                  </Field>
                  <Field label={t('fields.board')} error={tr(t, er?.boardOrUniversity?.message)} required>{(x) => <Input id={x.id} list="boards-list" {...register(`entries.${i}.boardOrUniversity`)} data-testid={`edu-${i}-board`} />}</Field>
                  <Field label={t('fields.year')} error={tr(t, er?.yearOfPassing?.message)} required>{(x) => <Input id={x.id} type="number" min={1960} max={2035} className="tabular-nums" {...register(`entries.${i}.yearOfPassing`, { valueAsNumber: true })} data-testid={`edu-${i}-year`} />}</Field>
                  <Field label={t('fields.eduStatus')} required>{(x) => <Select id={x.id} {...register(`entries.${i}.status`)}><option value="PASSED">{t('enums.eduStatus.PASSED')}</option><option value="APPEARING">{t('enums.eduStatus.APPEARING')}</option></Select>}</Field>
                  <Field label={t('fields.rollNo')}>{(x) => <Input id={x.id} {...register(`entries.${i}.rollNo`)} />}</Field>
                  {e?.status === 'PASSED' && (
                    <>
                      <Field label={t('fields.resultType')} required>{(x) => <Select id={x.id} {...register(`entries.${i}.resultType`)}><option value="PERCENT">{t('enums.resultType.PERCENT')}</option><option value="CGPA">{t('enums.resultType.CGPA')}</option></Select>}</Field>
                      <Field label={e.resultType === 'CGPA' ? t('fields.cgpa') : t('fields.marks')} hint={e.resultType === 'PERCENT' ? t('fields.marksHint') : undefined} error={tr(t, er?.marks?.message)} required>{(x) => <Input id={x.id} type="number" step="0.01" className="tabular-nums" {...register(`entries.${i}.marks`, { valueAsNumber: true })} data-testid={`edu-${i}-marks`} />}</Field>
                      {e.resultType === 'CGPA'
                        ? <Field label={t('fields.cgpaScale')}>{(x) => <Input id={x.id} type="number" className="tabular-nums" {...register(`entries.${i}.cgpaScale`, { valueAsNumber: true })} />}</Field>
                        : <Field label={t('fields.maxMarks')} error={tr(t, er?.maxMarks?.message)}>{(x) => <Input id={x.id} type="number" className="tabular-nums" {...register(`entries.${i}.maxMarks`, { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })} />}</Field>}
                    </>
                  )}
                  <div className="sm:col-span-3">
                    <Controller control={control} name={`entries.${i}.documentId`} render={({ field }) => (
                      <DocUpload label={t('fields.marksheet')} kind={DOC_KIND[e?.level ?? 'OTHER']!} value={field.value} onChange={field.onChange} docs={profile.documents} />
                    )} />
                  </div>
                </div>
                {i > 0 && <Button size="sm" variant="ghost" className="mt-3 text-danger" onClick={() => remove(i)}><Trash2 className="h-4 w-4" aria-hidden />{t('education.remove')}</Button>}
              </fieldset>
            );
          })}
        </div>
        <Button className="mt-4" onClick={() => append(blank(nextLevel))} data-testid="edu-add"><Plus className="h-4 w-4" aria-hidden />{t('education.add')}</Button>
      </StepCard>
    </form>
  );
}
