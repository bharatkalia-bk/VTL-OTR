/** Pure pixel utilities used by the live photo pipeline. No DOM dependencies. */

export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
  }
  return out;
}

/** Mean luma (0..255). */
export function meanLuminance(rgba: Uint8ClampedArray | Uint8Array): number {
  let sum = 0;
  const n = rgba.length / 4;
  for (let p = 0; p < rgba.length; p += 4) sum += 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
  return n ? sum / n : 0;
}

/** Variance of the 4-neighbour Laplacian: low values indicate blur. */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export interface Rect { x: number; y: number; width: number; height: number }

/**
 * Passport-style crop around a detected face box.
 * Face width ~ 55% of crop width, face box top at ~ 18% of crop height (room for hair),
 * crop centred horizontally on the face, clamped inside the frame (shrinking if needed).
 */
export function computePassportCrop(face: Rect, frameW: number, frameH: number, ratio = 3.5 / 4.5): Rect {
  let cw = face.width / 0.55;
  let ch = cw / ratio;
  // shrink to fit frame
  if (ch > frameH) { ch = frameH; cw = ch * ratio; }
  if (cw > frameW) { cw = frameW; ch = cw / ratio; }
  const cx = face.x + face.width / 2;
  let x = cx - cw / 2;
  let y = face.y - ch * 0.18;
  x = Math.max(0, Math.min(frameW - cw, x));
  y = Math.max(0, Math.min(frameH - ch, y));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(cw), height: Math.round(ch) };
}

export interface EncodeResult { size: number; data: Blob | Uint8Array }
export type Encoder = (quality: number, scale: number) => Promise<EncodeResult>;

/**
 * Find a JPEG encoding whose size lies within [minBytes, maxBytes].
 * Binary search on quality; if even the lowest quality is too large, retries with a smaller scale
 * (the caller re-pads to the target dimensions). If the highest quality is still below min, returns
 * it with `withinRange=false` so the caller can decide (server enforces the final rule).
 */
export async function compressToRange(encode: Encoder, minBytes: number, maxBytes: number, opts: { minQ?: number; maxQ?: number; iterations?: number } = {}): Promise<EncodeResult & { quality: number; scale: number; withinRange: boolean; tries: number }> {
  const minQ = opts.minQ ?? 0.3;
  const maxQ = opts.maxQ ?? 0.98;
  const iterations = opts.iterations ?? 8;
  let tries = 0;
  for (const scale of [1, 0.9, 0.8]) {
    let lo = minQ;
    let hi = maxQ;
    let best: (EncodeResult & { quality: number }) | null = null;
    const top = await encode(hi, scale); tries++;
    if (top.size >= minBytes && top.size <= maxBytes) return { ...top, quality: hi, scale, withinRange: true, tries };
    if (top.size < minBytes) return { ...top, quality: hi, scale, withinRange: false, tries };
    for (let i = 0; i < iterations; i++) {
      const q = (lo + hi) / 2;
      const r = await encode(q, scale); tries++;
      if (r.size > maxBytes) hi = q;
      else if (r.size < minBytes) lo = q;
      else { best = { ...r, quality: q }; break; }
    }
    if (best) return { ...best, scale, withinRange: true, tries };
    const low = await encode(lo, scale); tries++;
    if (low.size <= maxBytes && low.size >= minBytes) return { ...low, quality: lo, scale, withinRange: true, tries };
  }
  const last = await encode(minQ, 0.8); tries++;
  return { ...last, quality: minQ, scale: 0.8, withinRange: last.size >= minBytes && last.size <= maxBytes, tries };
}

/** Bounding box of "ink" pixels (dark enough and opaque) for auto-cropping signatures. */
export function contentBounds(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 200): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const a = rgba[p + 3]!;
      const l = 0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!;
      if (a > 32 && l < threshold) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Fit a rect into target box preserving aspect ratio; returns draw rect centred in the target. */
export function fitContain(srcW: number, srcH: number, dstW: number, dstH: number, padding = 0): Rect {
  const w = dstW - padding * 2;
  const h = dstH - padding * 2;
  const s = Math.min(w / srcW, h / srcH);
  const rw = srcW * s;
  const rh = srcH * s;
  return { x: (dstW - rw) / 2, y: (dstH - rh) / 2, width: rw, height: rh };
}
