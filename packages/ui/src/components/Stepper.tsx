import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export interface StepItem {
  key: string;
  label: string;
  done?: boolean;
}

/** Horizontal stepper on desktop, compact "Step x of y" with progress on mobile. */
export function Stepper({ steps, current, onSelect, stepOfLabel }: { steps: StepItem[]; current: number; onSelect?: (i: number) => void; stepOfLabel: (cur: number, total: number) => string }) {
  const cur = steps[current];
  return (
    <nav aria-label={stepOfLabel(current + 1, steps.length)}>
      <div className="sm:hidden">
        <p className="text-xs font-medium text-ink-muted">{stepOfLabel(current + 1, steps.length)}</p>
        <p className="font-heading font-semibold text-navy">{cur?.label}</p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.key} className={cn('h-1.5 flex-1 rounded-full', i < current || s.done ? 'bg-navy' : i === current ? 'bg-orange' : 'bg-border')} />
          ))}
        </div>
      </div>
      <ol className="hidden items-center sm:flex">
        {steps.map((s, i) => {
          const state = i === current ? 'current' : s.done || i < current ? 'done' : 'todo';
          const clickable = !!onSelect && (s.done || i <= current);
          const content = (
            <>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums',
                state === 'current' && 'border-orange bg-orange-50 text-navy',
                state === 'done' && 'border-navy bg-navy text-white',
                state === 'todo' && 'border-border bg-white text-ink-muted')}>
                {state === 'done' ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn('text-sm', state === 'current' ? 'font-semibold text-navy' : 'text-ink-muted')}>{s.label}</span>
            </>
          );
          return (
            <li key={s.key} className="flex flex-1 items-center last:flex-none" aria-current={state === 'current' ? 'step' : undefined}>
              {clickable ? (
                <button type="button" onClick={() => onSelect?.(i)} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-navy-50">{content}</button>
              ) : (
                <span className="flex items-center gap-2 px-1 py-1">{content}</span>
              )}
              {i < steps.length - 1 && <span className={cn('mx-2 h-0.5 flex-1', i < current ? 'bg-navy' : 'bg-border')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface TimelineItem { title: string; at?: string; note?: string; tone?: 'done' | 'current' | 'todo' | 'failed' }
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-border pl-5">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span className={cn('absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ring-2',
            it.tone === 'failed' ? 'bg-danger ring-danger/30' : it.tone === 'current' ? 'bg-orange ring-orange/30' : it.tone === 'todo' ? 'bg-border ring-border' : 'bg-navy ring-navy/20')} aria-hidden />
          <p className="text-sm font-semibold text-navy">{it.title}</p>
          {it.at && <p className="text-xs tabular-nums text-ink-muted">{it.at}</p>}
          {it.note && <p className="mt-0.5 text-sm text-ink-muted">{it.note}</p>}
        </li>
      ))}
    </ol>
  );
}
