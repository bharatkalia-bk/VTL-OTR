import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-border bg-white shadow-card', className)} {...p} />;
}
export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4 sm:px-6 sm:py-5', className)} {...p} />;
}
export function CardFooter({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6', className)} {...p} />;
}

export function StatCard({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">{label}</p>
        {icon && <span className="text-orange" aria-hidden>{icon}</span>}
      </div>
      <p className="mt-2 font-heading text-2xl font-bold tabular-nums text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

const tileTone = {
  navy: 'from-navy to-navy-600',
  orange: 'from-orange-700 to-orange-600',
  dusk: 'from-navy-700 to-orange-700',
  steel: 'from-navy-600 to-info-700',
} as const;

/** Brand-gradient KPI tile with an optional decorative mini chart. White text on dark gradients only (AA). */
export function GradientTile({ label, value, hint, icon, tone = 'navy', bars, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: keyof typeof tileTone; bars?: number[]; className?: string }) {
  const max = Math.max(1, ...(bars ?? [1]));
  return (
    <div className={cn('relative overflow-hidden rounded-card bg-gradient-to-br p-5 text-white shadow-raised', tileTone[tone], className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-white/90">{label}</p>
        {icon && <span className="rounded-full bg-white/15 p-2 [&_svg]:h-4 [&_svg]:w-4" aria-hidden>{icon}</span>}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        {bars && bars.length > 0 && (
          <div className="flex h-12 items-end gap-1" aria-hidden>
            {bars.map((b, i) => <span key={i} className="w-1.5 rounded-t bg-white/80" style={{ height: `${Math.max(8, (b / max) * 100)}%` }} />)}
          </div>
        )}
        <div className="ml-auto text-right">
          <p className="font-heading text-3xl font-bold tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-white/85">{hint}</p>}
        </div>
      </div>
      <span className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-white/10" aria-hidden />
    </div>
  );
}

/** Small circular icon + figure, used in summary strips under charts. */
export function MiniStat({ label, value, icon, tone = 'orange' }: { label: ReactNode; value: ReactNode; icon: ReactNode; tone?: 'orange' | 'navy' | 'success' | 'info' }) {
  const bg = { orange: 'bg-orange-600', navy: 'bg-navy', success: 'bg-success', info: 'bg-info' }[tone];
  return (
    <div className="flex items-center gap-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white [&_svg]:h-4 [&_svg]:w-4', bg)} aria-hidden>{icon}</span>
      <div className="min-w-0"><p className="truncate text-xs text-ink-muted">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>
    </div>
  );
}
