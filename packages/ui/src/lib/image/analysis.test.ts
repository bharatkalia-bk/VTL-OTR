import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { compressToRange, computePassportCrop, contentBounds, fitContain, laplacianVariance, meanLuminance, toGray } from './analysis';

function solid(w: number, h: number, v: number) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i += 4) { a[i] = v; a[i + 1] = v; a[i + 2] = v; a[i + 3] = 255; }
  return a;
}

describe('luminance & blur', () => {
  it('computes mean luminance', () => {
    expect(meanLuminance(solid(4, 4, 0))).toBe(0);
    expect(meanLuminance(solid(4, 4, 200))).toBeCloseTo(200, 3);
  });
  it('sharp checkerboard has far higher Laplacian variance than flat or smooth image', () => {
    const w = 40, h = 40;
    const checker = new Uint8ClampedArray(w * h * 4);
    const ramp = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const c = (x + y) % 2 ? 255 : 0;
      checker.set([c, c, c, 255], p);
      const r = Math.round((x / w) * 255);
      ramp.set([r, r, r, 255], p);
    }
    const sharp = laplacianVariance(toGray(checker, w, h), w, h);
    const smooth = laplacianVariance(toGray(ramp, w, h), w, h);
    const flat = laplacianVariance(toGray(solid(w, h, 128), w, h), w, h);
    expect(flat).toBeCloseTo(0, 5);
    expect(sharp).toBeGreaterThan(1000);
    expect(smooth).toBeLessThan(10);
  });
});

describe('computePassportCrop', () => {
  it('produces a 3.5:4.5 crop centred on the face inside the frame', () => {
    const face = { x: 540, y: 200, width: 200, height: 260 };
    const c = computePassportCrop(face, 1280, 720);
    expect(c.width / c.height).toBeCloseTo(3.5 / 4.5, 2);
    expect(c.x + c.width / 2).toBeCloseTo(640, 0);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(1280);
    expect(c.y + c.height).toBeLessThanOrEqual(720);
    expect(face.width / c.width).toBeCloseTo(0.55, 1);
  });
  it('clamps and shrinks when face is near the edge or very large', () => {
    const c = computePassportCrop({ x: 0, y: 0, width: 600, height: 700 }, 1280, 720);
    expect(c.height).toBeLessThanOrEqual(720);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBe(0);
    expect(c.width / c.height).toBeCloseTo(3.5 / 4.5, 2);
  });
});

describe('compressToRange', () => {
  it('binary-searches quality with a synthetic encoder', async () => {
    const enc = async (q: number, s: number) => ({ size: Math.round(100_000 * q * s * s), data: new Uint8Array() });
    const r = await compressToRange(enc, 20_000, 50_000);
    expect(r.withinRange).toBe(true);
    expect(r.size).toBeGreaterThanOrEqual(20_000);
    expect(r.size).toBeLessThanOrEqual(50_000);
    expect(r.tries).toBeLessThan(12);
  });
  it('falls back to a smaller scale when quality alone is not enough', async () => {
    const enc = async (q: number, s: number) => ({ size: Math.round(60_000 + 100_000 * q * s * s - 60_000 * (1 - s) * 10), data: new Uint8Array() });
    const r = await compressToRange(enc, 20_000, 50_000);
    expect(r.withinRange).toBe(true);
    expect(r.scale).toBeLessThan(1);
  });
  it('reports undersized output instead of looping', async () => {
    const r = await compressToRange(async () => ({ size: 5_000, data: new Uint8Array() }), 10_000, 20_000);
    expect(r.withinRange).toBe(false);
  });
  it('hits 20 to 50 KB for a real 350x450 JPEG', async () => {
    const c = createCanvas(350, 450);
    const ctx = c.getContext('2d');
    // synthetic "photo": gradients + noise
    const img = ctx.createImageData(350, 450);
    let s = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const px = (i / 4) % 350, py = Math.floor(i / 4 / 350);
      img.data[i] = (px * 0.6 + (s % 40)) & 255; img.data[i + 1] = (py * 0.5 + (s % 30)) & 255; img.data[i + 2] = 150 + (s % 50); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const r = await compressToRange(async (q) => {
      const buf = c.toBuffer('image/jpeg', Math.round(q * 100));
      return { size: buf.length, data: buf };
    }, 20 * 1024, 50 * 1024);
    expect(r.withinRange).toBe(true);
    const buf = r.data as Uint8Array;
    expect(buf[0]).toBe(0xff); expect(buf[1]).toBe(0xd8);
  });
});

describe('signature helpers', () => {
  it('finds ink bounds', () => {
    const w = 20, h = 10;
    const a = solid(w, h, 255);
    for (const [x, y] of [[5, 2], [12, 7]] as const) a.set([0, 0, 0, 255], (y * w + x) * 4);
    expect(contentBounds(a, w, h)).toEqual({ x: 5, y: 2, width: 8, height: 6 });
    expect(contentBounds(solid(w, h, 255), w, h)).toBeNull();
  });
  it('fits contain', () => {
    const r = fitContain(200, 50, 140, 60, 4);
    expect(r.width).toBeCloseTo(132);
    expect(r.height).toBeCloseTo(33);
    expect(r.x).toBeCloseTo(4);
  });
});
