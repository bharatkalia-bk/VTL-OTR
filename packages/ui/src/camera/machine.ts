import type { LivenessMethod } from '@vtl/shared';

export type CameraError = 'PERMISSION_DENIED' | 'NO_CAMERA' | 'CAMERA_IN_USE' | 'INSECURE_CONTEXT' | 'UNSUPPORTED' | 'MODEL_LOAD_FAILED' | 'UPLOAD_FAILED';

export type CaptureState =
  | { phase: 'intro' }
  | { phase: 'requesting' }
  | { phase: 'error'; error: CameraError; message?: string }
  | { phase: 'checking' }
  | { phase: 'liveness'; method: LivenessMethod }
  | { phase: 'countdown'; n: number; method: LivenessMethod }
  | { phase: 'review'; method: LivenessMethod }
  | { phase: 'uploading'; method: LivenessMethod }
  | { phase: 'done' }
  | { phase: 'limit' };

export type CaptureEvent =
  | { type: 'START' }
  | { type: 'STREAM_READY' }
  | { type: 'FAIL'; error: CameraError; message?: string }
  | { type: 'CHECKS_PASSED'; method: LivenessMethod }
  | { type: 'CHECKS_LOST' }
  | { type: 'LIVENESS_PASSED' }
  | { type: 'TICK' }
  | { type: 'RETAKE'; attempts: number; maxAttempts: number }
  | { type: 'ACCEPT'; method: LivenessMethod }
  | { type: 'UPLOADED' }
  | { type: 'RESET' };

export function captureReducer(s: CaptureState, e: CaptureEvent): CaptureState {
  switch (e.type) {
    case 'RESET': return { phase: 'intro' };
    case 'START': return s.phase === 'intro' || s.phase === 'error' ? { phase: 'requesting' } : s;
    case 'FAIL': return { phase: 'error', error: e.error, message: e.message };
    case 'STREAM_READY': return s.phase === 'requesting' ? { phase: 'checking' } : s;
    case 'CHECKS_PASSED': return s.phase === 'checking' ? { phase: 'liveness', method: e.method } : s;
    case 'CHECKS_LOST': return s.phase === 'countdown' ? { phase: 'checking' } : s;
    case 'LIVENESS_PASSED': return s.phase === 'liveness' ? { phase: 'countdown', n: 3, method: s.method } : s;
    case 'TICK':
      if (s.phase !== 'countdown') return s;
      return s.n > 1 ? { ...s, n: s.n - 1 } : { phase: 'review', method: s.method };
    case 'RETAKE':
      if (s.phase !== 'review' && s.phase !== 'error') return s;
      return e.attempts >= e.maxAttempts ? { phase: 'limit' } : { phase: 'requesting' };
    case 'ACCEPT': return s.phase === 'review' || (s.phase === 'error' && s.error === 'UPLOAD_FAILED') ? { phase: 'uploading', method: e.method } : s;
    case 'UPLOADED': return s.phase === 'uploading' ? { phase: 'done' } : s;
    default: return s;
  }
}

export function classifyMediaError(err: unknown): CameraError {
  const name = (err as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'PERMISSION_DENIED';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'NO_CAMERA';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'CAMERA_IN_USE';
    default:
      return 'UNSUPPORTED';
  }
}

export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'safari-ios' | 'safari-mac' | 'android-chrome' | 'other';
export function detectBrowser(ua: string): BrowserKind {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/iPhone|iPad|iPod/.test(ua)) return 'safari-ios';
  if (/Android/.test(ua) && /Chrome\//.test(ua)) return 'android-chrome';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'safari-mac';
  return 'other';
}
