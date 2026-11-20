import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const controlBase =
  'w-full rounded border bg-white px-3 text-[15px] text-navy placeholder:text-ink-muted/70 transition-colors focus:outline-none focus:ring-2 focus:ring-orange focus:border-orange disabled:bg-surface disabled:text-ink-muted aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(controlBase, 'h-11 border-border', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(controlBase, 'min-h-[96px] border-border py-2', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(controlBase, 'h-11 border-border pr-8 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2307102d' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...p}>
      {children}
    </select>
  );
});

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + hint + error, wired with aria-describedby / aria-invalid. */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-navy">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error && <p id={hintId} className="text-xs text-ink-muted">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, className, id, ...p }, ref) {
  const gen = useId();
  const cid = id ?? gen;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input ref={ref} id={cid} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-[rgb(var(--vtl-orange-600-rgb))]" {...p} />
      <label htmlFor={cid} className="text-sm text-navy">
        {label}
        {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
      </label>
    </div>
  );
});

export interface RadioGroupProps {
  name: string;
  legend: ReactNode;
  options: Array<{ value: string; label: ReactNode }>;
  value?: string;
  onChange: (v: string) => void;
  error?: ReactNode;
  required?: boolean;
  inline?: boolean;
}
export function RadioGroup({ name, legend, options, value, onChange, error, required, inline = true }: RadioGroupProps) {
  const id = useId();
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="text-sm font-medium text-navy">
        {legend}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </legend>
      <div className={cn('flex gap-2', inline ? 'flex-wrap' : 'flex-col')}>
        {options.map((o) => (
          <label key={o.value}
            className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded border px-3 text-sm',
              value === o.value ? 'border-orange bg-orange-50 text-navy' : 'border-border bg-white')}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)}
              className="h-4 w-4 accent-[rgb(var(--vtl-orange-600-rgb))]" />
            {o.label}
          </label>
        ))}
      </div>
      {error && <p id={`${id}-err`} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
