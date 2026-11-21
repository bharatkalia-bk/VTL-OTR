import { DEFAULT_SIGNATURE_SPEC, type SignatureSpec } from '@vtl/shared';
import { Eraser, PenLine, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { Tabs } from '../components/Overlay';
import { encodeJpegInRange, loadImage, normaliseSignature } from '../lib/image/browser';

export interface SignaturePadProps {
  spec?: Partial<SignatureSpec>;
  onComplete: (blob: Blob, method: 'DRAWN' | 'UPLOADED') => Promise<void>;
  disabled?: boolean;
}

/** Signature via draw-on-screen pad or scanned upload; output auto-cropped to 140x60 JPEG, 10 to 20 KB. */
export function SignaturePad({ spec: specIn, onComplete, disabled }: SignaturePadProps) {
  const { t } = useTranslation('ui');
  const spec = { ...DEFAULT_SIGNATURE_SPEC, ...specIn };
  const [mode, setMode] = useState<'DRAWN' | 'UPLOADED'>('DRAWN');
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const fileId = useId();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
  };
  useEffect(() => { clear(); }, [mode]);

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const p = pos(e);
    if (!ctx || !last.current) return;
    ctx.strokeStyle = '#0a0a2a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const mx = (last.current.x + p.x) / 2;
    const my = (last.current.y + p.y) / 2;
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mx, my);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  };
  const up = () => { drawing.current = false; last.current = null; };

  const finish = async (src: HTMLCanvasElement | HTMLImageElement, method: 'DRAWN' | 'UPLOADED') => {
    setBusy(true);
    setError(null);
    try {
      const norm = normaliseSignature(src, spec.width, spec.height);
      const enc = await encodeJpegInRange(norm, spec.minBytes, spec.maxBytes);
      const blob = enc.data as Blob;
      setPreview((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), blob }; });
      await onComplete(blob, method);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="signature-pad">
      <Tabs label={t('signature.title')} value={mode} onChange={setMode}
        tabs={[{ value: 'DRAWN', label: <span className="inline-flex items-center gap-1"><PenLine className="h-4 w-4" aria-hidden />{t('signature.draw')}</span> },
          { value: 'UPLOADED', label: <span className="inline-flex items-center gap-1"><Upload className="h-4 w-4" aria-hidden />{t('signature.upload')}</span> }]} />
      {mode === 'DRAWN' ? (
        <div>
          <canvas ref={canvasRef} width={700} height={300} aria-label={t('signature.canvasLabel')} role="img" data-testid="signature-canvas"
            className="block aspect-[7/3] w-full touch-none rounded border-2 border-dashed border-border bg-white"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
          <p className="mt-1 text-xs text-ink-muted">{t('signature.drawHint')}</p>
          <div className="mt-2 flex gap-2">
            <Button onClick={clear} disabled={disabled || busy}><Eraser className="h-4 w-4" aria-hidden />{t('signature.clear')}</Button>
            <Button variant="secondary" disabled={!hasInk || disabled} loading={busy} onClick={() => canvasRef.current && void finish(canvasRef.current, 'DRAWN')} data-testid="signature-save">{t('signature.save')}</Button>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor={fileId} className="flex min-h-[72px] cursor-pointer items-center justify-center gap-2 rounded border-2 border-dashed border-border bg-white px-3 text-sm font-medium text-navy hover:border-navy">
            <Upload className="h-4 w-4" aria-hidden />{t('signature.choose')}
          </label>
          <input id={fileId} type="file" accept="image/jpeg,image/png" className="sr-only" disabled={disabled || busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > 2 * 1024 * 1024) return setError(t('signature.tooLarge'));
              try { await finish(await loadImage(f), 'UPLOADED'); } catch (er) { setError(er instanceof Error ? er.message : String(er)); }
            }} />
          <p className="mt-1 text-xs text-ink-muted">{t('signature.uploadHint')}</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {preview && (
        <div className="flex items-center gap-3">
          <img src={preview.url} alt={t('signature.previewAlt')} width={spec.width} height={spec.height} className="rounded border border-border bg-white" data-testid="signature-preview" />
          <span className="text-xs tabular-nums text-ink-muted">{spec.width}×{spec.height} px · {(preview.blob.size / 1024).toFixed(1)} KB</span>
        </div>
      )}
    </div>
  );
}
