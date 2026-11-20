import { DEFAULT_PHOTO_SPEC, FACE_CHECK_THRESHOLDS, type LivenessMethod, type PhotoMetadata, type PhotoSpec } from '@vtl/shared';
import { Camera, CameraOff, RefreshCw, ShieldCheck, SwitchCamera } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { Alert } from '../components/Feedback';
import { Select } from '../components/Field';
import { cn } from '../lib/cn';
import { computePassportCrop, laplacianVariance, meanLuminance, toGray, type Rect } from '../lib/image/analysis';
import { createCanvas, encodeJpegInRange, grabFrame, renderPassport } from '../lib/image/browser';
import { BlinkDetector, evaluateFrame, HeadTurnDetector, yawFromLandmarks, type FrameIssue, type FrameScores } from './faceChecks';
import { createFaceEngine, type FaceEngine } from './faceEngine';
import { captureReducer, classifyMediaError, detectBrowser, type CameraError } from './machine';

export interface PhotoAttemptInfo { attemptNo: number; scores: FrameScores; liveness: { passed: boolean; method: LivenessMethod }; accepted: boolean }

export interface LivePhotoCaptureProps {
  candidateName: string;
  spec?: Partial<PhotoSpec>;
  /** Attempts already used (from server), counts towards spec.maxAttempts. */
  attemptsUsed?: number;
  livenessMethods?: LivenessMethod[];
  assetBase?: string;
  /** Called when the camera starts; returns a single-use capture session id issued by the API. */
  startSession: () => Promise<string>;
  onAttempt?: (info: PhotoAttemptInfo) => void;
  onComplete: (blob: Blob, meta: PhotoMetadata) => Promise<void>;
  /** For tests/storybook: inject an engine. */
  engineFactory?: (assetBase: string) => Promise<FaceEngine>;
  className?: string;
}

const ANALYSIS_INTERVAL_MS = 110;

function stopStream(s: MediaStream | null) {
  s?.getTracks().forEach((t) => t.stop());
}

/**
 * Live, in-browser photograph capture. There is intentionally NO file input in this component:
 * the photograph must come from the device camera.
 */
export function LivePhotoCapture(props: LivePhotoCaptureProps) {
  const { t } = useTranslation('ui');
  const spec: PhotoSpec = { ...DEFAULT_PHOTO_SPEC, ...props.spec };
  const methods = props.livenessMethods?.length ? props.livenessMethods : (['BLINK', 'HEAD_TURN'] as LivenessMethod[]);
  const [state, dispatch] = useReducer(captureReducer, { phase: 'intro' });
  const [issue, setIssue] = useState<FrameIssue | null>('NO_FACE');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; meta: PhotoMetadata } | null>(null);
  const [attempts, setAttempts] = useState(props.attemptsUsed ?? 0);
  const [sizeInfo, setSizeInfo] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<FaceEngine | null>(null);
  const sessionRef = useRef<string | null>(null);
  const lastBoxRef = useRef<Rect | null>(null);
  const lastScoresRef = useRef<FrameScores | null>(null);
  const stableSinceRef = useRef<number | null>(null);
  const blinkRef = useRef(new BlinkDetector());
  const turnRef = useRef(new HeadTurnDetector());
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  const methodRef = useRef<LivenessMethod>('BLINK');

  const release = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Always release the camera on unmount and when the tab is hidden.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && streamRef.current) { release(); dispatch({ type: 'RESET' }); } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', release);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', release);
      release();
      engineRef.current?.close();
      engineRef.current = null;
    };
  }, [release]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const openCamera = useCallback(async (devId?: string) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) return dispatch({ type: 'FAIL', error: 'INSECURE_CONTEXT' });
    if (!navigator.mediaDevices?.getUserMedia) return dispatch({ type: 'FAIL', error: 'UNSUPPORTED' });
    release();
    try {
      const video: MediaTrackConstraints = devId
        ? { deviceId: { exact: devId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setDevices(all.filter((d) => d.kind === 'videoinput'));
      setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId);
      if (!engineRef.current) {
        try {
          engineRef.current = await (props.engineFactory ?? createFaceEngine)(props.assetBase ?? '/mediapipe');
        } catch (e) {
          release();
          return dispatch({ type: 'FAIL', error: 'MODEL_LOAD_FAILED', message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (!sessionRef.current) sessionRef.current = await props.startSession();
      blinkRef.current = new BlinkDetector();
      turnRef.current = new HeadTurnDetector();
      stableSinceRef.current = null;
      dispatch({ type: 'STREAM_READY' });
    } catch (e) {
      release();
      dispatch({ type: 'FAIL', error: classifyMediaError(e), message: e instanceof Error ? e.message : String(e) });
    }
  }, [props, release]);

  useEffect(() => {
    if (state.phase === 'requesting') void openCamera(deviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Frame analysis loop
  useEffect(() => {
    if (!['checking', 'liveness', 'countdown'].includes(state.phase)) return;
    const analysis = createCanvas(160, 90);
    const actx = analysis.getContext('2d', { willReadFrequently: true });
    let timer: number | undefined;
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      const v = videoRef.current;
      const engine = engineRef.current;
      if (v && engine && actx && v.readyState >= 2 && v.videoWidth > 0) {
        const faces = engine.detect(v, performance.now());
        // luminance and blur on the face region (or full frame when no face)
        const f = faces[0];
        const sx = f ? Math.max(0, f.box.x) : 0;
        const sy = f ? Math.max(0, f.box.y) : 0;
        const sw = f ? Math.min(v.videoWidth - sx, f.box.width) : v.videoWidth;
        const sh = f ? Math.min(v.videoHeight - sy, f.box.height) : v.videoHeight;
        let lum = 0;
        let blur = 0;
        if (sw > 4 && sh > 4) {
          const aw = 160;
          const ah = Math.max(8, Math.round((aw * sh) / sw));
          analysis.width = aw;
          analysis.height = ah;
          actx.drawImage(v, sx, sy, sw, sh, 0, 0, aw, ah);
          const data = actx.getImageData(0, 0, aw, ah).data;
          lum = meanLuminance(data);
          blur = laplacianVariance(toGray(data, aw, ah), aw, ah);
        }
        const verdict = evaluateFrame({ faces: faces.map((x) => ({ box: x.box, score: x.score })), frameW: v.videoWidth, frameH: v.videoHeight, luminance: lum, blurVariance: blur });
        lastScoresRef.current = verdict.scores;
        if (f) lastBoxRef.current = f.box;
        const phase = phaseRef.current;
        if (phase === 'checking') {
          setIssue(verdict.issue);
          if (verdict.ok) {
            const now = performance.now();
            stableSinceRef.current ??= now;
            if (now - stableSinceRef.current >= FACE_CHECK_THRESHOLDS.stableMs) {
              const m = methods[Math.floor(Math.random() * methods.length)] ?? 'BLINK';
              methodRef.current = m;
              dispatch({ type: 'CHECKS_PASSED', method: m });
            }
          } else stableSinceRef.current = null;
        } else if (phase === 'liveness') {
          setIssue(verdict.issue === 'BLURRY' ? null : verdict.issue);
          if (f && faces.length === 1) {
            const yaw = yawFromLandmarks(f.landmarks);
            const passed = methodRef.current === 'BLINK' ? blinkRef.current.update(f.blink.left, f.blink.right) : yaw !== null && turnRef.current.update(yaw);
            if (passed) dispatch({ type: 'LIVENESS_PASSED' });
          }
        } else if (phase === 'countdown') {
          setIssue(verdict.issue);
          if (!verdict.ok && verdict.issue !== 'BLURRY') dispatch({ type: 'CHECKS_LOST' });
        }
      }
      timer = window.setTimeout(loop, ANALYSIS_INTERVAL_MS);
    };
    loop();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Countdown + capture
  useEffect(() => {
    if (state.phase !== 'countdown') return;
    const id = window.setTimeout(async () => {
      if (state.n === 1) await capture();
      dispatch({ type: 'TICK' });
    }, 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const capture = async () => {
    const v = videoRef.current;
    const box = lastBoxRef.current;
    if (!v || !box) return;
    const frame = grabFrame(v);
    release(); // stop camera as soon as the frame is captured
    const crop = computePassportCrop(box, frame.width, frame.height, spec.width / spec.height);
    const capturedAt = new Date();
    const dateStr = capturedAt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const out = renderPassport(frame, crop, spec.width, spec.height, spec.nameDateStrip ? { name: props.candidateName, date: dateStr } : null);
    const enc = await encodeJpegInRange(out, spec.minBytes, spec.maxBytes);
    const blob = enc.data as Blob;
    const attemptNo = attempts + 1;
    setAttempts(attemptNo);
    const scores = lastScoresRef.current ?? { faceConfidence: 0, centreOffset: 0, areaRatio: 0, luminance: 0, blurVariance: 0 };
    const meta: PhotoMetadata = {
      captureSessionId: sessionRef.current ?? '',
      capturedAt: capturedAt.toISOString(),
      userAgent: navigator.userAgent.slice(0, 500),
      attemptNo,
      liveness: { passed: true, method: methodRef.current },
      scores,
    };
    setSizeInfo(`${spec.width}×${spec.height} px · ${(blob.size / 1024).toFixed(1)} KB`);
    setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), blob, meta }; });
    props.onAttempt?.({ attemptNo, scores, liveness: meta.liveness, accepted: false });
  };

  const maxAttempts = spec.maxAttempts;
  const remaining = Math.max(0, maxAttempts - attempts);

  const accept = async () => {
    if (!preview) return;
    dispatch({ type: 'ACCEPT', method: preview.meta.liveness.method });
    try {
      await props.onComplete(preview.blob, preview.meta);
      sessionRef.current = null;
      dispatch({ type: 'UPLOADED' });
    } catch (e) {
      dispatch({ type: 'FAIL', error: 'UPLOAD_FAILED', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const retake = () => {
    setPreview(null);
    dispatch({ type: 'RETAKE', attempts, maxAttempts });
  };

  const guidance = (() => {
    switch (state.phase) {
      case 'checking': return issue ? t(`camera.issue.${issue}`) : t('camera.holdStill');
      case 'liveness': return issue && issue !== 'CENTRE_FACE' ? t(`camera.issue.${issue}`) : t(state.method === 'BLINK' ? 'camera.liveness.blink' : 'camera.liveness.turn');
      case 'countdown': return t('camera.holdStill');
      default: return '';
    }
  })();

  const showVideo = ['requesting', 'checking', 'liveness', 'countdown'].includes(state.phase);
  const ovalOk = (state.phase === 'checking' && !issue) || state.phase === 'liveness' || state.phase === 'countdown';

  return (
    <section className={cn('mx-auto w-full max-w-xl', props.className)} aria-label={t('camera.title')} data-testid="live-photo-capture" data-phase={state.phase}>
      {state.phase === 'intro' && (
        <div className="rounded-card border border-border bg-white p-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange"><Camera className="h-7 w-7" aria-hidden /></div>
          <h3 className="text-lg font-semibold">{t('camera.introTitle')}</h3>
          <p className="mt-2 text-sm text-ink-muted">{t('camera.introBody')}</p>
          <ul className="mx-auto mt-4 max-w-sm space-y-1.5 text-left text-sm text-navy">
            {(['tip1', 'tip2', 'tip3', 'tip4'] as const).map((k) => <li key={k} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{t(`camera.${k}`)}</li>)}
          </ul>
          <p className="mt-4 text-xs text-ink-muted">{t('camera.privacy')}</p>
          <p className="mt-1 text-xs tabular-nums text-ink-muted">{t('camera.attemptsLeft', { count: remaining })}</p>
          <Button variant="primary" size="lg" className="mt-5" onClick={() => dispatch({ type: remaining > 0 ? 'START' : 'RETAKE', attempts, maxAttempts })} disabled={remaining <= 0} data-testid="camera-start">
            <Camera className="h-5 w-5" aria-hidden />{t('camera.allow')}
          </Button>
        </div>
      )}

      {state.phase === 'error' && (
        <CameraErrorPanel error={state.error} message={state.message}
          onRetry={() => (state.error === 'UPLOAD_FAILED' && preview ? void accept() : dispatch({ type: 'START' }))} />
      )}

      {state.phase === 'limit' && (
        <Alert tone="danger" title={t('camera.limitTitle')}>{t('camera.limitBody', { count: maxAttempts })}</Alert>
      )}

      <div className={cn('relative overflow-hidden rounded-card bg-navy', !showVideo && 'hidden')}>
        <video ref={videoRef} playsInline muted autoPlay aria-hidden className="block aspect-[4/3] w-full -scale-x-100 object-cover" />
        {/* Oval face guide */}
        <svg viewBox="0 0 400 300" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMid slice">
          <defs><mask id="vtl-oval"><rect width="400" height="300" fill="white" /><ellipse cx="200" cy="135" rx="78" ry="102" fill="black" /></mask></defs>
          <rect width="400" height="300" fill="rgb(7 16 45 / 0.45)" mask="url(#vtl-oval)" />
          <ellipse cx="200" cy="135" rx="78" ry="102" fill="none" strokeWidth="3" strokeDasharray={ovalOk ? undefined : '8 6'}
            stroke={ovalOk ? 'rgb(var(--success-rgb))' : 'rgb(var(--vtl-orange-rgb))'} />
        </svg>
        {state.phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center"><span className="font-heading text-7xl font-bold text-white drop-shadow" aria-hidden>{state.n}</span></div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-navy/80 px-3 py-2 text-center text-sm font-medium text-white" aria-live="polite" data-testid="camera-guidance">
          {state.phase === 'requesting' ? t('camera.starting') : guidance}
        </div>
        {devices.length > 1 && showVideo && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-white/90 p-1">
            <SwitchCamera className="ml-1 h-4 w-4 text-navy" aria-hidden />
            <Select aria-label={t('camera.switch')} className="h-8 w-40 border-0 text-xs" value={deviceId}
              onChange={(e) => { setDeviceId(e.target.value); void openCamera(e.target.value); }}>
              {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `${t('camera.cameraN')} ${i + 1}`}</option>)}
            </Select>
          </div>
        )}
      </div>
      {showVideo && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" onClick={() => { release(); dispatch({ type: 'RESET' }); }}>{t('camera.cancel')}</Button>
        </div>
      )}

      {(state.phase === 'review' || state.phase === 'uploading') && preview && (
        <div className="rounded-card border border-border bg-white p-5">
          <h3 className="text-center text-lg font-semibold">{t('camera.reviewTitle')}</h3>
          <img src={preview.url} alt={t('camera.previewAlt')} width={spec.width} height={spec.height} data-testid="photo-preview"
            className="mx-auto mt-3 h-auto w-[175px] rounded border border-border sm:w-[210px]" />
          <p className="mt-2 text-center text-xs tabular-nums text-ink-muted" data-testid="photo-size">{sizeInfo}</p>
          <p className="mt-1 text-center text-xs tabular-nums text-ink-muted">{t('camera.attemptsLeft', { count: remaining })}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={retake} disabled={remaining <= 0 || state.phase === 'uploading'} data-testid="photo-retake"><RefreshCw className="h-4 w-4" aria-hidden />{t('camera.retake')}</Button>
            <Button variant="primary" onClick={() => void accept()} loading={state.phase === 'uploading'} data-testid="photo-accept">{t('camera.use')}</Button>
          </div>
        </div>
      )}

      {state.phase === 'done' && (
        <Alert tone="success" title={t('camera.doneTitle')}>{t('camera.doneBody')}</Alert>
      )}
    </section>
  );
}

function CameraErrorPanel({ error, message, onRetry }: { error: CameraError; message?: string; onRetry: () => void }) {
  const { t } = useTranslation('ui');
  const browser = typeof navigator !== 'undefined' ? detectBrowser(navigator.userAgent) : 'other';
  return (
    <div className="rounded-card border border-danger/30 bg-white p-5" role="alert" data-testid="camera-error" data-error={error}>
      <div className="flex items-start gap-3">
        <CameraOff className="mt-0.5 h-6 w-6 shrink-0 text-danger" aria-hidden />
        <div>
          <h3 className="font-semibold">{t(`camera.error.${error}.title`)}</h3>
          <p className="mt-1 text-sm text-ink-muted">{t(`camera.error.${error}.body`)}</p>
          {error === 'PERMISSION_DENIED' && (
            <div className="mt-3 rounded bg-surface p-3 text-sm">
              <p className="font-medium">{t('camera.howToEnable')}</p>
              <p className="mt-1 text-ink-muted">{t(`camera.browserSteps.${browser}`)}</p>
            </div>
          )}
          {message && error === 'UPLOAD_FAILED' && <p className="mt-2 text-xs text-danger">{message}</p>}
          {error !== 'INSECURE_CONTEXT' && error !== 'UNSUPPORTED' && (
            <Button className="mt-4" variant="secondary" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden />{t('camera.tryAgain')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}
