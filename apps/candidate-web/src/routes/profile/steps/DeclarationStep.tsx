import { WIZARD_STEPS } from '@vtl/shared';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Field, Input } from '@vtl/ui';
import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSetProfile, useStates, type Profile } from '../../../features/profile';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/forms';
import { fmtDate, fmtDateTime } from '../../../lib/format';
import type { StepProps } from '../Wizard';

function Row({ k, v }: { k: string; v: ReactNode }) {
  return <div className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2 border-b border-border py-2 text-sm last:border-0"><dt className="text-ink-muted">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>;
}

export function Preview({ profile, editable }: { profile: Profile; editable: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const states = useStates();
  const sname = (c: string | null | undefined) => states.data?.find((s) => s.code === c)?.[lang === 'hi' ? 'nameHi' : 'nameEn'] ?? c ?? '';
  const sec = (step: string, title: string, children: ReactNode) => (
    <section className="rounded border border-border">
      <div className="flex items-center justify-between bg-surface px-4 py-2"><h3 className="text-sm font-semibold">{title}</h3>{editable && <Link className="text-sm text-info underline" to={`/profile/${step}`}>{t('app.edit')}</Link>}</div>
      <dl className="px-4">{children}</dl>
    </section>
  );
  const p = profile.personal, c = profile.category, a = profile.address;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
      <div className="space-y-4">
        {sec('personal', t('wizard.steps.personal'), <>
          <Row k={t('fields.fullName')} v={p.fullName} /><Row k={t('fields.fatherName')} v={p.fatherName} /><Row k={t('fields.motherName')} v={p.motherName} />
          <Row k={t('fields.dob')} v={<span className="tabular-nums">{fmtDate(p.dob, lang)}</span>} /><Row k={t('fields.gender')} v={p.gender && t(`enums.gender.${p.gender}`)} />
          <Row k={t('fields.maritalStatus')} v={p.maritalStatus && t(`enums.marital.${p.maritalStatus}`)} /><Row k={t('fields.idMark1')} v={p.identificationMark1} />
          <Row k={t('fields.mobile')} v={<span className="tabular-nums">{profile.mobile}</span>} /><Row k={t('fields.email')} v={profile.email} />
        </>)}
        {sec('category', t('wizard.steps.category'), <>
          <Row k={t('fields.category')} v={c.category && t(`enums.category.${c.category}`)} />
          <Row k={t('fields.pwd')} v={c.pwd ? `${t('app.yes')} · ${t(`enums.pwd.${c.pwdType}`)} · ${c.pwdPercent}%` : t('app.no')} />
          <Row k={t('fields.exServiceman')} v={c.exServiceman ? `${t('app.yes')} · ${c.serviceYears}` : t('app.no')} />
          <Row k={t('fields.domicile')} v={sname(c.domicileStateCode)} />
        </>)}
        {sec('address', t('wizard.steps.address'), <>
          <Row k={t('fields.permanentAddress')} v={a && [a.permanent.line1, a.permanent.line2, a.permanent.city, sname(a.permanent.stateCode), a.permanent.pin].filter(Boolean).join(', ')} />
          <Row k={t('fields.correspondenceAddress')} v={a?.correspondenceSameAsPermanent ? t('fields.sameAddress') : a?.correspondence && [a.correspondence.line1, a.correspondence.city, a.correspondence.pin].join(', ')} />
        </>)}
        {sec('education', t('wizard.steps.education'), profile.education.map((e) => (
          <Row key={e.id} k={t(`enums.education.${e.level}`)} v={`${e.qualificationName}, ${e.boardOrUniversity}, ${e.yearOfPassing} · ${e.status === 'APPEARING' ? t('enums.eduStatus.APPEARING') : e.resultType === 'CGPA' ? `${e.marks} CGPA` : `${e.marks}${e.maxMarks ? `/${e.maxMarks}` : '%'}`}`} />
        )))}
      </div>
      <div className="space-y-3">
        {profile.photo && <img src={profile.photo.url} alt={t('photo.current')} className="w-full max-w-[200px] rounded border border-border" />}
        {profile.signature && <img src={profile.signature.url} alt={t('signature.current')} className="w-full max-w-[200px] rounded border border-border bg-white" />}
        {editable && <Link className="text-sm text-info underline" to="/profile/photo">{t('app.edit')}</Link>}
      </div>
    </div>
  );
}

export function DeclarationStep({ profile, onBack }: StepProps) {
  const { t, i18n } = useTranslation();
  const setProfile = useSetProfile();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [truth, setTruth] = useState(!!profile.declaration.at);
  const [consent, setConsent] = useState(!!profile.declaration.at);
  const [place, setPlace] = useState(profile.declaration.place ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitted = profile.status === 'SUBMITTED';
  const missing = WIZARD_STEPS.filter((s) => s !== 'declaration' && !profile.completedSteps.includes(s));

  const finalSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      setProfile(await api.put<Profile>('/me/profile/declaration', { agreeTruth: truth, agreeConsent: consent, place }));
      const r = await api.post<{ otrId: string }>('/me/submit');
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['profile'] });
      nav(`/profile-submitted?otr=${encodeURIComponent(r.otrId)}`);
    } catch (e) {
      setError(errorMessage(e, t));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={submitted ? t('wizard.submittedTitle') : t('wizard.steps.declaration')} description={submitted ? t('wizard.submittedOn', { date: fmtDateTime(profile.submittedAt, i18n.language) }) : t('wizard.declarationDesc')}
        actions={submitted ? <Badge tone="success">{profile.otrId}</Badge> : undefined} />
      <CardBody className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {missing.length > 0 && !submitted && <Alert tone="warning" title={t('wizard.incompleteTitle')}>{missing.map((m) => <Link key={m} to={`/profile/${m}`} className="mr-3 text-info underline">{t(`wizard.steps.${m}`)}</Link>)}</Alert>}
        <Preview profile={profile} editable={!submitted} />
        {submitted ? (
          <Button variant="primary" onClick={() => void api.download('/me/otr-slip.pdf', `OTR-Slip-${profile.otrId}.pdf`)}><Download className="h-4 w-4" aria-hidden />{t('submitted.downloadSlip')}</Button>
        ) : (
          <div className="rounded border border-border bg-surface p-4">
            <h3 className="font-semibold">{t('declaration.title')}</h3>
            <div className="mt-3 space-y-3">
              <Checkbox label={t('declaration.truth')} checked={truth} onChange={(e) => setTruth(e.target.checked)} data-testid="decl-truth" />
              <Checkbox label={t('declaration.consent')} checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="decl-consent" />
              <Field label={t('declaration.place')} required className="max-w-xs">{(f) => <Input id={f.id} value={place} onChange={(e) => setPlace(e.target.value)} data-testid="decl-place" />}</Field>
            </div>
            <Alert tone="warning" className="mt-4">{t('declaration.lockWarning')}</Alert>
            <div className="mt-4 flex justify-between">
              <Button onClick={onBack}>{t('app.back')}</Button>
              <Button variant="primary" size="lg" disabled={!truth || !consent || place.length < 2 || missing.length > 0} onClick={() => setConfirm(true)} data-testid="otr-submit">{t('declaration.submit')}</Button>
            </div>
          </div>
        )}
      </CardBody>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('declaration.confirmTitle')} closeLabel={t('app.close')}
        footer={<><Button onClick={() => setConfirm(false)}>{t('app.cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void finalSubmit()} data-testid="otr-confirm">{t('declaration.confirm')}</Button></>}>
        <p className="text-sm">{t('declaration.confirmBody')}</p>
      </Dialog>
    </Card>
  );
}
