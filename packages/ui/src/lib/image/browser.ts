import { compressToRange, contentBounds, fitContain, type Rect } from './analysis';

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not available');
  return ctx;
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality));
}

/** Grab the current video frame un-mirrored (the preview is mirrored only via CSS). */
export function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const c = createCanvas(video.videoWidth, video.videoHeight);
  ctx2d(c).drawImage(video, 0, 0);
  return c;
}

export interface StripOptions { name: string; date: string }

/** Crop to passport ratio, resize to spec, optional name/date strip at the bottom. */
export function renderPassport(frame: HTMLCanvasElement, crop: Rect, width: number, height: number, strip?: StripOptions | null): HTMLCanvasElement {
  const out = createCanvas(width, height);
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frame, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  if (strip) {
    const sh = Math.round(height * 0.11);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, height - sh, width, sh);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.round(sh * 0.36);
    ctx.font = `600 ${fs}px Inter, Arial, sans-serif`;
    ctx.fillText(strip.name.toUpperCase().slice(0, 32), width / 2, height - sh * 0.68, width - 8);
    ctx.font = `500 ${Math.round(fs * 0.85)}px Inter, Arial, sans-serif`;
    ctx.fillText(strip.date, width / 2, height - sh * 0.25, width - 8);
  }
  return out;
}

/** Add low-amplitude luminance noise (paper texture). Used only when an image is too small to reach the minimum file size. */
function withNoise(src: HTMLCanvasElement, amp: number, seed = 1): HTMLCanvasElement {
  const c = createCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  ctx.drawImage(src, 0, 0);
  if (amp <= 0) return c;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  let s = seed >>> 0;
  for (let p = 0; p < img.data.length; p += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s / 0xffffffff) * 2 - 1) * amp;
    img.data[p] = Math.max(0, Math.min(255, img.data[p]! + n));
    img.data[p + 1] = Math.max(0, Math.min(255, img.data[p + 1]! + n));
    img.data[p + 2] = Math.max(0, Math.min(255, img.data[p + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * JPEG-encode a canvas into [minBytes, maxBytes] keeping exact output dimensions.
 * Tiny, mostly-white images (e.g. a 140x60 signature) can be smaller than the minimum even at
 * maximum quality; in that case a faint texture is added and the search is repeated.
 */
export async function encodeJpegInRange(src: HTMLCanvasElement, minBytes: number, maxBytes: number) {
  const w = src.width;
  const h = src.height;
  let result: Awaited<ReturnType<typeof compressToRange>> | null = null;
  for (const amp of [0, 3, 6, 10, 16, 24, 32]) {
    const base = withNoise(src, amp);
    result = await compressToRange(async (quality, scale) => {
      let c = base;
      if (scale < 1) {
        const small = createCanvas(Math.round(w * scale), Math.round(h * scale));
        ctx2d(small).drawImage(base, 0, 0, small.width, small.height);
        c = createCanvas(w, h);
        ctx2d(c).drawImage(small, 0, 0, w, h);
      }
      const blob = await canvasToBlob(c, 'image/jpeg', quality);
      return { size: blob.size, data: blob };
    }, minBytes, maxBytes);
    if (result.withinRange || result.size > maxBytes) break;
  }
  return result!;
}

/** Trim whitespace around a signature, fit to target size on white, return canvas. */
export function normaliseSignature(src: HTMLCanvasElement | HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const tmp = createCanvas(sw, sh);
  const tctx = ctx2d(tmp);
  tctx.fillStyle = '#fff';
  tctx.fillRect(0, 0, sw, sh);
  tctx.drawImage(src, 0, 0);
  const data = tctx.getImageData(0, 0, sw, sh).data;
  const b = contentBounds(data, sw, sh, 180) ?? { x: 0, y: 0, width: sw, height: sh };
  const pad = 4;
  const out = createCanvas(width, height);
  const octx = ctx2d(out);
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, width, height);
  const r = fitContain(b.width, b.height, width, height, pad);
  octx.drawImage(tmp, b.x, b.y, b.width, b.height, r.x, r.y, r.width, r.height);
  return out;
}

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}
