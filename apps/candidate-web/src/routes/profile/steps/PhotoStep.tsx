import type { LivenessMethod, PhotoMetadata, PhotoSpec } from '@vtl/shared';
import { Alert, Button, Card, CardBody, CardHeader, LivePhotoCapture, SignaturePad, Spinner } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetProfile, type Profile } from '../../../features/profile';
import { api, ApiError } from '../../../lib/api';
import { errorMessage } from '../../../lib/forms';
import type { StepProps } from '../Wizard';

interface Session { captureSessionId: string; attemptsUsed: number; maxAttempts: number; spec: PhotoSpec; livenessMethods: LivenessMethod[] }

export function PhotoStep({ profile, onNext, onBack, readOnly }: StepProps) {
  const { t } = useTranslation();
  const setProfile = useSetProfile();
  const [retake, setRetake] = useState(!profile.photo);
  const [sigEdit, setSigEdit] = useState(!profile.signature);
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<{ photoSpec: PhotoSpec; livenessMethods: LivenessMethod[]; signatureSpec: { width: number; height: number; minBytes: number; maxBytes: number } }>('/public/config') });
  const [attemptsUsed, setAttemptsUsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => setProfile(await api.get<Profile>('/me/profile'));

  if (cfg.isLoading || !cfg.data) return <Spinner label={t('app.loading')} />;
  const canContinue = !!profile.photo && !!profile.signature;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('photo.title')} description={t('photo.desc', { w: cfg.data.photoSpec.width, h: cfg.data.photoSpec.height, min: Math.round(cfg.data.photoSpec.minBytes / 1024), max: Math.round(cfg.data.photoSpec.maxBytes / 1024) })} />
        <CardBody>
          {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
          {profile.photo && !retake ? (
            <div className="flex flex-wrap items-center gap-4">
              <img src={profile.photo.url} alt={t('photo.current')} width={175} height={225} className="rounded border border-border" data-testid="current-photo" />
              <div className="text-sm">
                <p className="font-semibold text-success">{t('photo.saved')}</p>
                <p className="tabular-nums text-ink-muted">{profile.photo.width}×{profile.photo.height} px · {(profile.photo.sizeBytes / 1024).toFixed(1)} KB</p>
                {!readOnly && <Button className="mt-3" onClick={() => setRetake(true)}>{t('photo.retakePhoto')}</Button>}
              </div>
            </div>
          ) : readOnly ? (
            <Alert tone="info">{t('photo.locked')}</Alert>
          ) : (
            <LivePhotoCapture
              candidateName={profile.personal.fullName ?? ''}
              spec={cfg.data.photoSpec}
              livenessMethods={cfg.data.livenessMethods}
              attemptsUsed={attemptsUsed ?? undefined}
              startSession={async () => {
                try {
                  const s = await api.post<Session>('/me/photo/session');
                  setAttemptsUsed(s.attemptsUsed);
                  return s.captureSessionId;
                } catch (e) {
                  setError(errorMessage(e, t));
                  throw e;
                }
              }}
              onAttempt={(a) => void api.post('/me/photo/attempts', { attemptNo: a.attemptNo, scores: a.scores, liveness: a.liveness }).catch((e: unknown) => { if (e instanceof ApiError) setError(errorMessage(e, t)); })}
              onComplete={async (blob: Blob, meta: PhotoMetadata) => {
                const fd = new FormData();
                fd.append('meta', JSON.stringify(meta));
                fd.append('file', blob, 'photo.jpg');
                try {
                  await api.upload('/me/photo', fd);
                } catch (e) {
                  throw new Error(errorMessage(e, t));
                }
                await refresh();
                setRetake(false);
              }}
            />
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('signature.title')} description={t('signature.desc')} />
        <CardBody>
          {profile.signature && !sigEdit ? (
            <div className="flex flex-wrap items-center gap-4">
              <img src={profile.signature.url} alt={t('signature.current')} width={140} height={60} className="rounded border border-border bg-white" data-testid="current-signature" />
              {!readOnly && <Button onClick={() => setSigEdit(true)}>{t('signature.change')}</Button>}
            </div>
          ) : readOnly ? (
            <Alert tone="info">{t('photo.locked')}</Alert>
          ) : (
            <SignaturePad spec={cfg.data.signatureSpec} onComplete={async (blob, method) => {
              const fd = new FormData();
              fd.append('method', method);
              fd.append('file', blob, 'signature.jpg');
              try { await api.upload('/me/signature', fd); } catch (e) { throw new Error(errorMessage(e, t)); }
              await refresh();
              setSigEdit(false);
            }} />
          )}
        </CardBody>
      </Card>
      {([['THUMB', 'thumb', 'thumbTitle', 'thumbDesc'], ['DECLARATION', 'declarationImage', 'declTitle', 'declDesc']] as const).map(([kind, key, title, desc]) => {
        const cur = profile[key];
        return (
          <Card key={kind}>
            <CardHeader title={t(`aux.${title}`)} description={t(`aux.${desc}`)} />
            <CardBody className="flex flex-wrap items-center gap-4">
              {cur && <><img src={cur.url} alt={t(`aux.${title}`)} className="h-24 rounded border border-border bg-white object-contain" /><p className="text-sm text-success">{t('aux.saved', { kb: (cur.sizeBytes / 1024).toFixed(1) })}</p></>}
              {!(readOnly && cur) && (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-border px-4 py-2 text-sm font-medium hover:bg-navy-50">
                  {cur ? t('aux.replace') : t('aux.upload')}
                  <input type="file" accept="image/jpeg" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const fd = new FormData(); fd.append('file', f); setError(null); void api.upload(`/me/media/${kind === 'THUMB' ? 'thumb' : 'declaration'}`, fd).then(refresh).catch((err: unknown) => setError(errorMessage(err, t))); }} />
                </label>
              )}
            </CardBody>
          </Card>
        );
      })}
      {!readOnly && (
        <div className="flex justify-between">
          <Button onClick={onBack}>{t('app.back')}</Button>
          <Button variant="primary" disabled={!canContinue} onClick={onNext} data-testid="step-continue">{t('wizard.continue')}</Button>
        </div>
      )}
    </div>
  );
}
