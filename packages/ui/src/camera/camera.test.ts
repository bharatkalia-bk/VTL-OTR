import { describe, expect, it } from 'vitest';
import { BlinkDetector, evaluateFrame, HeadTurnDetector, yawFromLandmarks } from './faceChecks';
import { captureReducer, classifyMediaError, detectBrowser, type CaptureState } from './machine';

const W = 1280, H = 720;
const centred = { x: 540, y: 140, width: 200, height: 250 };
const base = { frameW: W, frameH: H, luminance: 130, blurVariance: 200 };

describe('evaluateFrame', () => {
  it('passes a good frame', () => {
    expect(evaluateFrame({ ...base, faces: [{ box: centred, score: 0.9 }] })).toMatchObject({ ok: true, issue: null });
  });
  it.each([
    [{ faces: [] }, 'NO_FACE'],
    [{ faces: [{ box: centred, score: 0.9 }, { box: centred, score: 0.8 }] }, 'MULTIPLE_FACES'],
    [{ faces: [{ box: { x: 620, y: 300, width: 60, height: 70 }, score: 0.9 }] }, 'MOVE_CLOSER'],
    [{ faces: [{ box: { x: 240, y: 0, width: 800, height: 720 }, score: 0.9 }] }, 'MOVE_BACK'],
    [{ faces: [{ box: { x: 100, y: 140, width: 200, height: 250 }, score: 0.9 }] }, 'CENTRE_FACE'],
    [{ faces: [{ box: centred, score: 0.9 }], luminance: 40 }, 'TOO_DARK'],
    [{ faces: [{ box: centred, score: 0.9 }], luminance: 240 }, 'TOO_BRIGHT'],
    [{ faces: [{ box: centred, score: 0.9 }], blurVariance: 10 }, 'BLURRY'],
  ])('flags %#', (patch, issue) => {
    expect(evaluateFrame({ ...base, ...patch } as Parameters<typeof evaluateFrame>[0]).issue).toBe(issue);
  });
});

describe('liveness', () => {
  it('detects a blink only after open -> closed -> open', () => {
    const d = new BlinkDetector();
    expect(d.update(0.6, 0.6)).toBe(false); // starts closed: ignored until open seen
    expect(d.update(0.05, 0.05)).toBe(false);
    expect(d.update(0.7, 0.8)).toBe(false);
    expect(d.update(0.1, 0.1)).toBe(true);
  });
  it('detects head turn and return', () => {
    const d = new HeadTurnDetector(0.12);
    [0, 0.01, -0.01].forEach((y) => expect(d.update(y)).toBe(false));
    expect(d.update(0.05)).toBe(false);
    expect(d.update(0.2)).toBe(false);
    expect(d.update(0.02)).toBe(true);
  });
  it('computes yaw from landmarks', () => {
    const lm = Array.from({ length: 300 }, () => ({ x: 0, y: 0 }));
    lm[33] = { x: 100, y: 0 }; lm[263] = { x: 200, y: 0 }; lm[1] = { x: 150, y: 0 };
    expect(yawFromLandmarks(lm)).toBe(0);
    lm[1] = { x: 180, y: 0 };
    expect(yawFromLandmarks(lm)).toBeCloseTo(0.3);
    expect(yawFromLandmarks([])).toBeNull();
  });
});

describe('captureReducer', () => {
  it('walks the happy path', () => {
    let s: CaptureState = { phase: 'intro' };
    s = captureReducer(s, { type: 'START' }); expect(s.phase).toBe('requesting');
    s = captureReducer(s, { type: 'STREAM_READY' }); expect(s.phase).toBe('checking');
    s = captureReducer(s, { type: 'CHECKS_PASSED', method: 'BLINK' }); expect(s).toEqual({ phase: 'liveness', method: 'BLINK' });
    s = captureReducer(s, { type: 'LIVENESS_PASSED' }); expect(s).toMatchObject({ phase: 'countdown', n: 3 });
    s = captureReducer(s, { type: 'TICK' }); s = captureReducer(s, { type: 'TICK' }); expect(s).toMatchObject({ n: 1 });
    s = captureReducer(s, { type: 'TICK' }); expect(s.phase).toBe('review');
    s = captureReducer(s, { type: 'ACCEPT', method: 'BLINK' }); expect(s.phase).toBe('uploading');
    s = captureReducer(s, { type: 'UPLOADED' }); expect(s.phase).toBe('done');
  });
  it('ignores out-of-order events and enforces retake limit', () => {
    expect(captureReducer({ phase: 'intro' }, { type: 'LIVENESS_PASSED' })).toEqual({ phase: 'intro' });
    expect(captureReducer({ phase: 'review', method: 'BLINK' }, { type: 'RETAKE', attempts: 2, maxAttempts: 5 }).phase).toBe('requesting');
    expect(captureReducer({ phase: 'review', method: 'BLINK' }, { type: 'RETAKE', attempts: 5, maxAttempts: 5 }).phase).toBe('limit');
    expect(captureReducer({ phase: 'countdown', n: 2, method: 'BLINK' }, { type: 'CHECKS_LOST' }).phase).toBe('checking');
  });
  it('allows retrying a failed upload', () => {
    expect(captureReducer({ phase: 'error', error: 'UPLOAD_FAILED' }, { type: 'ACCEPT', method: 'HEAD_TURN' })).toEqual({ phase: 'uploading', method: 'HEAD_TURN' });
    expect(captureReducer({ phase: 'error', error: 'NO_CAMERA' }, { type: 'ACCEPT', method: 'BLINK' }).phase).toBe('error');
  });
});

describe('error classification', () => {
  it.each([
    ['NotAllowedError', 'PERMISSION_DENIED'], ['NotFoundError', 'NO_CAMERA'], ['NotReadableError', 'CAMERA_IN_USE'], ['TypeError', 'UNSUPPORTED'],
  ])('%s -> %s', (name, code) => expect(classifyMediaError({ name })).toBe(code));
  it('detects browsers', () => {
    expect(detectBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit Version/16.0 Mobile Safari/604.1')).toBe('safari-ios');
    expect(detectBrowser('Mozilla/5.0 (Linux; Android 13) AppleWebKit Chrome/120.0 Mobile Safari/537.36')).toBe('android-chrome');
    expect(detectBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120.0 Safari/537.36 Edg/120.0')).toBe('edge');
    expect(detectBrowser('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/121.0')).toBe('firefox');
  });
});
