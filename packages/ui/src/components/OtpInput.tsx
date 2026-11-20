import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';

/** 6-box OTP input with paste support, autocomplete=one-time-code and full keyboard support. */
export function OtpInput({ value, onChange, length = 6, label, invalid, idPrefix = 'otp', disabled }: {
  value: string; onChange: (v: string) => void; length?: number; label: string; invalid?: boolean; idPrefix?: string; disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const set = (i: number, d: string) => {
    const arr = [...digits];
    arr[i] = d;
    onChange(arr.join('').slice(0, length));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (t) {
      e.preventDefault();
      onChange(t);
      refs.current[Math.min(t.length, length - 1)]?.focus();
    }
  };
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} id={`${idPrefix}-${i}`} inputMode="numeric" pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} value={d} disabled={disabled}
          aria-label={`${label} ${i + 1}`} aria-invalid={invalid || undefined}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) { onChange(v.slice(0, length)); return; }
            set(i, v);
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => onKey(i, e)} onPaste={onPaste}
          className={cn('h-12 w-11 rounded border bg-white text-center font-heading text-xl tabular-nums text-navy focus:outline-none focus:ring-2 focus:ring-orange',
            invalid ? 'border-danger' : 'border-border')} />
      ))}
    </div>
  );
}
