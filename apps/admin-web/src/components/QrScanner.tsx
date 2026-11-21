import { Alert, Button } from '@vtl/ui';
import jsQR from 'jsqr';
import { Camera, CameraOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Camera QR scanner: native BarcodeDetector where available, jsQR fallback. Calls onScan once per new code. */
export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef<{ t: string; at: number } | null>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    type Detector = { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ['qr_code'] }) : null;
    const emit = (t: string) => {
      const now = Date.now();
      if (last.current && last.current.t === t && now - last.current.at < 4000) return;
      last.current = { t, at: now };
      onScan(t);
    };
    const tick = async () => {
      if (stopped) return;
      const v = video.current, c = canvas.current;
      if (v && c && v.readyState >= 2) {
        try {
          if (detector) {
            const r = await detector.detect(v);
            if (r[0]) emit(r[0].rawValue);
          } else {
            c.width = v.videoWidth; c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) emit(code.data);
          }
        } catch { /* keep scanning */ }
      }
      timer = window.setTimeout(() => void tick(), 250);
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; void video.current.play(); } void tick(); })
      .catch(() => { setErr('Camera unavailable. Allow camera access, or type the roll number instead.'); setOn(false); });
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on, onScan]);

  return (
    <div className="space-y-2">
      {err && <Alert tone="warning">{err}</Alert>}
      <div className="relative aspect-video overflow-hidden rounded-card bg-navy">
        <video ref={video} className="h-full w-full object-cover" muted playsInline aria-label="QR scanner camera preview" />
        {on && <div className="pointer-events-none absolute inset-[18%] rounded-lg border-4 border-orange/80" aria-hidden />}
        {!on && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Camera off</div>}
      </div>
      <canvas ref={canvas} className="hidden" />
      <Button onClick={() => { setErr(null); setOn((v) => !v); }} variant={on ? 'outline' : 'secondary'}>{on ? <><CameraOff className="h-4 w-4" aria-hidden />Stop camera</> : <><Camera className="h-4 w-4" aria-hidden />Scan admit card QR</>}</Button>
    </div>
  );
}
