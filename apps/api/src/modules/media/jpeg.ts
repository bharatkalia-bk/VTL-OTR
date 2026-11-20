/** Server-side image checks. Never trust client MIME types or extensions. */

export function isJpeg(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
export function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}
export function isPdf(buf: Buffer): boolean {
  return buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-' && buf.includes(Buffer.from('%%EOF'));
}

/** True if the JPEG contains APP1 (EXIF/XMP) or other APPn/COM metadata segments. */
export function hasJpegMetadata(buf: Buffer): boolean {
  let found = false;
  walk(buf, (marker) => {
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) found = true;
  });
  return found;
}

function walk(buf: Buffer, onSegment: (marker: number, start: number, end: number) => void): number {
  if (!isJpeg(buf)) throw new Error('NOT_JPEG');
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('CORRUPT_JPEG');
    let marker = buf[i + 1]!;
    while (marker === 0xff) { i++; marker = buf[i + 1]!; } // fill bytes
    if (marker === 0xd9) return i; // EOI
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (i + 3 >= buf.length) throw new Error('CORRUPT_JPEG');
    const len = buf.readUInt16BE(i + 2);
    const end = i + 2 + len;
    if (len < 2 || end > buf.length) throw new Error('CORRUPT_JPEG');
    onSegment(marker, i, end);
    if (marker === 0xda) return end; // SOS: entropy-coded data follows
    i = end;
  }
  throw new Error('CORRUPT_JPEG');
}

/**
 * Lossless metadata removal: drops APP1..APP15 (EXIF, XMP, ICC, ...) and COM segments
 * without re-encoding the image data (so size limits remain meaningful).
 */
export function stripJpegMetadata(buf: Buffer): Buffer {
  const parts: Buffer[] = [buf.subarray(0, 2)];
  const sosEnd = walk(buf, (marker, start, end) => {
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) parts.push(buf.subarray(start, end));
  });
  parts.push(buf.subarray(sosEnd));
  return Buffer.concat(parts);
}
