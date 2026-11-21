import { WIZARD_STEPS, type WizardStep } from '@vtl/shared';
import { Alert, Button, Card, CardBody, ProgressBar, Spinner, Stepper } from '@vtl/ui';
import { CheckCircle2, CloudOff, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Page, PageHeader } from '../../components/Layout';
import { useProfile, type Profile } from '../../features/profile';
import { AddressStep } from './steps/AddressStep';
import { CategoryStep } from './steps/CategoryStep';
import { DeclarationStep } from './steps/DeclarationStep';
import { EducationStep } from './steps/EducationStep';
import { PersonalStep } from './steps/PersonalStep';
import { PhotoStep } from './steps/PhotoStep';

export interface StepProps {
  profile: Profile;
  onNext: () => void;
  onBack: () => void;
  readOnly: boolean;
}

export default function Wizard() {
  const { t } = useTranslation();
  const { step } = useParams();
  const nav = useNavigate();
  const q = useProfile();
  if (q.isLoading || !q.data) return <div className="flex justify-center py-16"><Spinner label={t('app.loading')} /></div>;
  const p = q.data;
  if (!step) {
    const firstIncomplete = WIZARD_STEPS.find((s) => !p.completedSteps.includes(s)) ?? 'declaration';
    return <Navigate to={`/profile/${p.status === 'SUBMITTED' ? 'declaration' : firstIncomplete}`} replace />;
  }
  const idx = WIZARD_STEPS.indexOf(step as WizardStep);
  if (idx < 0) return <Navigate to="/profile" replace />;
  const go = (i: number) => nav(`/profile/${WIZARD_STEPS[Math.max(0, Math.min(WIZARD_STEPS.length - 1, i))]}`);
  const readOnly = p.status !== 'DRAFT' && step !== 'education';
  const props: StepProps = { profile: p, onNext: () => go(idx + 1), onBack: () => go(idx - 1), readOnly };
  const steps = WIZARD_STEPS.map((s) => ({ key: s, label: t(`wizard.steps.${s}`), done: p.completedSteps.includes(s) }));
  return (
    <>
      <PageHeader title={t('wizard.title')} description={p.status === 'SUBMITTED' ? t('wizard.submittedNote', { otrId: p.otrId }) : t('wizard.subtitle')}
        actions={<div className="w-56"><ProgressBar value={p.completion} label={t('wizard.completion')} /></div>} />
      <Page>
        <Card className="mb-4 p-4"><Stepper steps={steps} current={idx} onSelect={go} stepOfLabel={(c, n) => t('common.stepOf', { cur: c, total: n })} /></Card>
        {p.status === 'SUBMITTED' && step !== 'education' && step !== 'declaration' && (
          <Alert tone="info" className="mb-4" title={t('wizard.lockedTitle')}>{t('wizard.lockedBody')} <Link to="/corrections" className="text-info underline">{t('wizard.raiseCorrection')}</Link></Alert>
        )}
        {step === 'personal' && <PersonalStep {...props} />}
        {step === 'category' && <CategoryStep {...props} />}
        {step === 'address' && <AddressStep {...props} />}
        {step === 'education' && <EducationStep {...props} />}
        {step === 'photo' && <PhotoStep {...props} />}
        {step === 'declaration' && <DeclarationStep {...props} />}
      </Page>
    </>
  );
}

export function StepCard({ title, description, children, footer, saveStatus }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; saveStatus?: { status: string; savedAt: Date | null } }) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-ink-muted">{description}</p>}
        </div>
        {saveStatus && saveStatus.status !== 'idle' && (
          <span className="flex items-center gap-1 text-xs text-ink-muted" role="status" aria-live="polite">
            {saveStatus.status === 'saving' && <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{t('wizard.saving')}</>}
            {saveStatus.status === 'saved' && <><CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />{t('wizard.savedAt', { time: saveStatus.savedAt?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) })}</>}
            {saveStatus.status === 'error' && <><CloudOff className="h-3.5 w-3.5 text-danger" aria-hidden />{t('wizard.saveFailed')}</>}
          </span>
        )}
      </div>
      <CardBody>{children}</CardBody>
      {footer && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">{footer}</div>}
    </Card>
  );
}

export function StepNav({ onBack, submitLabel, loading, disabled, first, testId }: { onBack?: () => void; submitLabel?: string; loading?: boolean; disabled?: boolean; first?: boolean; testId?: string }) {
  const { t } = useTranslation();
  return (
    <>
      {!first ? <Button onClick={onBack}>{t('app.back')}</Button> : <span />}
      <Button type="submit" variant="primary" loading={loading} disabled={disabled} data-testid={testId ?? 'step-continue'}>{submitLabel ?? t('wizard.saveContinue')}</Button>
    </>
  );
}
