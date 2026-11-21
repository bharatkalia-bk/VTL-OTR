import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hasJpegMetadata, isJpeg, isPdf, isPng, stripJpegMetadata } from './jpeg';

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 350, height: 450, channels: 3, background: { r: 200, g: 180, b: 160 } } })
    .jpeg({ quality: 90 })
    .withMetadata({ exif: { IFD0: { Copyright: 'test', Software: 'camera-x' } } })
    .toBuffer();
}

describe('jpeg utils', () => {
  it('detects formats by magic bytes', async () => {
    const j = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const p = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer();
    expect(isJpeg(j)).toBe(true);
    expect(isJpeg(p)).toBe(false);
    expect(isPng(p)).toBe(true);
    expect(isPdf(Buffer.from('%PDF-1.4\n...%%EOF'))).toBe(true);
    expect(isPdf(Buffer.from('<html>'))).toBe(false);
  });

  it('strips EXIF losslessly and keeps a decodable image of same dimensions', async () => {
    const withExif = await jpegWithExif();
    expect(hasJpegMetadata(withExif)).toBe(true);
    const stripped = stripJpegMetadata(withExif);
    expect(hasJpegMetadata(stripped)).toBe(false);
    expect(stripped.length).toBeLessThan(withExif.length);
    const meta = await sharp(stripped).metadata();
    expect(meta.width).toBe(350);
    expect(meta.height).toBe(450);
    expect(meta.exif).toBeUndefined();
    // pixel data unchanged
    const a = await sharp(withExif).raw().toBuffer();
    const b = await sharp(stripped).raw().toBuffer();
    expect(a.equals(b)).toBe(true);
  });

  it('rejects corrupt input', () => {
    expect(() => stripJpegMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toThrow();
    expect(() => stripJpegMetadata(Buffer.from('not a jpeg'))).toThrow('NOT_JPEG');
  });
});
