import { FileText, Upload, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface UploadedFileInfo { id: string; name: string; sizeBytes: number; status?: string }

/** Document upload (PDF etc). NOTE: never used for the candidate photograph, which is live-capture only. */
export function FileUpload({ label, accept, maxBytes, onUpload, value, onRemove, hint, error, labels, disabled }: {
  label: ReactNode; accept: string; maxBytes: number; onUpload: (f: File) => Promise<void>; value?: UploadedFileInfo | null; onRemove?: () => void;
  hint?: ReactNode; error?: ReactNode; disabled?: boolean;
  labels: { choose: string; uploading: string; remove: string; tooLarge: string; wrongType: string };
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setLocalErr(null);
    const okType = accept.split(',').some((a) => a.trim() === f.type || (a.trim().startsWith('.') && f.name.toLowerCase().endsWith(a.trim())));
    if (!okType) return setLocalErr(labels.wrongType);
    if (f.size > maxBytes) return setLocalErr(labels.tooLarge);
    setBusy(true);
    try { await onUpload(f); } catch (e) { setLocalErr(e instanceof Error ? e.message : String(e)); } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  const err = localErr ?? error;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-navy">{label}</label>
      {value ? (
        <div className="flex items-center gap-3 rounded border border-border bg-white px-3 py-2">
          <FileText className="h-5 w-5 text-navy" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-navy">{value.name}</p>
            <p className="text-xs tabular-nums text-ink-muted">{(value.sizeBytes / 1024).toFixed(0)} KB {value.status ? `· ${value.status}` : ''}</p>
          </div>
          {onRemove && !disabled && <button type="button" onClick={onRemove} className="rounded p-2 hover:bg-navy-50" aria-label={labels.remove}><X className="h-4 w-4" aria-hidden /></button>}
        </div>
      ) : (
        <label htmlFor={id} className={cn('flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded border-2 border-dashed px-3 py-3 text-sm',
          err ? 'border-danger' : 'border-border hover:border-navy', disabled && 'pointer-events-none opacity-50')}>
          <Upload className="h-4 w-4 text-navy" aria-hidden />
          <span className="font-medium text-navy">{busy ? labels.uploading : labels.choose}</span>
        </label>
      )}
      <input ref={ref} id={id} type="file" accept={accept} className="sr-only" disabled={disabled || busy} onChange={(e) => void pick(e.target.files?.[0])} />
      {hint && !err && <p className="text-xs text-ink-muted">{hint}</p>}
      {err && <p role="alert" className="text-xs font-medium text-danger">{err}</p>}
    </div>
  );
}
