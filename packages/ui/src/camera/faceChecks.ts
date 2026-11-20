import { FACE_CHECK_THRESHOLDS } from '@vtl/shared';
import type { Rect } from '../lib/image/analysis';

export type FrameIssue =
  | 'NO_FACE' | 'MULTIPLE_FACES' | 'MOVE_CLOSER' | 'MOVE_BACK' | 'CENTRE_FACE' | 'TOO_DARK' | 'TOO_BRIGHT' | 'BLURRY';

export interface FrameInput {
  faces: Array<{ box: Rect; score: number }>;
  frameW: number;
  frameH: number;
  luminance: number;
  blurVariance: number;
}
export interface FrameScores {
  faceConfidence: number;
  centreOffset: number;
  areaRatio: number;
  luminance: number;
  blurVariance: number;
}
export interface FrameVerdict { ok: boolean; issue: FrameIssue | null; scores: FrameScores }

type Thresholds = { -readonly [K in keyof typeof FACE_CHECK_THRESHOLDS]: number };

/** Order matters: report the most fundamental problem first. */
export function evaluateFrame(f: FrameInput, t: Thresholds = { ...FACE_CHECK_THRESHOLDS }): FrameVerdict {
  const face = f.faces[0];
  const scores: FrameScores = { faceConfidence: face?.score ?? 0, centreOffset: 1, areaRatio: 0, luminance: f.luminance, blurVariance: f.blurVariance };
  if (f.faces.length === 0 || !face) return { ok: false, issue: 'NO_FACE', scores };
  if (f.faces.length > 1) return { ok: false, issue: 'MULTIPLE_FACES', scores };
  const cx = (face.box.x + face.box.width / 2) / f.frameW;
  const cy = (face.box.y + face.box.height / 2) / f.frameH;
  // oval guide centre is slightly above frame centre
  scores.centreOffset = Math.hypot(cx - 0.5, cy - 0.45);
  scores.areaRatio = (face.box.width * face.box.height) / (f.frameW * f.frameH);
  if (f.luminance < t.minLuminance) return { ok: false, issue: 'TOO_DARK', scores };
  if (f.luminance > t.maxLuminance) return { ok: false, issue: 'TOO_BRIGHT', scores };
  if (scores.areaRatio < t.minFaceAreaRatio) return { ok: false, issue: 'MOVE_CLOSER', scores };
  if (scores.areaRatio > t.maxFaceAreaRatio) return { ok: false, issue: 'MOVE_BACK', scores };
  if (scores.centreOffset > t.maxCentreOffset) return { ok: false, issue: 'CENTRE_FACE', scores };
  if (f.blurVariance < t.minBlurVariance) return { ok: false, issue: 'BLURRY', scores };
  return { ok: true, issue: null, scores };
}

export interface Point { x: number; y: number }

/** Normalised yaw proxy from 2D landmarks: nose-tip offset from eye midpoint, divided by inter-ocular distance. */
export function yawFromLandmarks(lm: Point[]): number | null {
  const nose = lm[1];
  const le = lm[33];
  const re = lm[263];
  if (!nose || !le || !re) return null;
  const mid = (le.x + re.x) / 2;
  const d = Math.abs(re.x - le.x);
  if (d < 1e-6) return null;
  return (nose.x - mid) / d;
}

/** Blink: both eyes closed above `closed`, then reopened below `open`. */
export class BlinkDetector {
  private sawOpen = false;
  private sawClosed = false;
  constructor(private closed = FACE_CHECK_THRESHOLDS.blinkClosed, private open = FACE_CHECK_THRESHOLDS.blinkOpen) {}
  update(left: number, right: number): boolean {
    const v = (left + right) / 2;
    if (!this.sawOpen) { if (v < this.open) this.sawOpen = true; return false; }
    if (!this.sawClosed) { if (v > this.closed) this.sawClosed = true; return false; }
    return v < this.open;
  }
}

/** Head turn: yaw moves by at least `delta` from the baseline (first stable samples) in either direction, then returns. */
export class HeadTurnDetector {
  private baseline: number | null = null;
  private samples: number[] = [];
  private turned = false;
  constructor(private delta = FACE_CHECK_THRESHOLDS.headTurnYaw) {}
  update(yaw: number): boolean {
    if (this.baseline === null) {
      this.samples.push(yaw);
      if (this.samples.length >= 3) this.baseline = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      return false;
    }
    const d = Math.abs(yaw - this.baseline);
    if (!this.turned) { if (d >= this.delta) this.turned = true; return false; }
    return d < this.delta / 2;
  }
}
