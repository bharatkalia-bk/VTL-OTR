import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'info' | 'success' | 'warning' | 'danger';
const toneCls: Record<Tone, string> = {
  info: 'border-info/30 bg-info-50 text-info',
  success: 'border-success/30 bg-success-50 text-success',
  warning: 'border-warning/30 bg-warning-50 text-warning',
  danger: 'border-danger/30 bg-danger-50 text-danger',
};
const toneIcon: Record<Tone, ReactNode> = {
  info: <Info className="h-5 w-5" aria-hidden />,
  success: <CheckCircle2 className="h-5 w-5" aria-hidden />,
  warning: <AlertTriangle className="h-5 w-5" aria-hidden />,
  danger: <XCircle className="h-5 w-5" aria-hidden />,
};

export function Alert({ tone = 'info', title, children, className, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded border p-3 sm:p-4', toneCls[tone], className)}>
      <span className="mt-0.5 shrink-0">{toneIcon[tone]}</span>
      <div className="min-w-0 flex-1 text-sm text-navy">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-1')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

const badgeTone: Record<Tone | 'neutral' | 'brand', string> = {
  neutral: 'bg-navy-50 text-navy',
  brand: 'bg-orange-50 text-orange-700',
  info: 'bg-info-50 text-info-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof badgeTone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTone[tone], className)}>{children}</span>;
}

export function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-ink-muted', className)}>
      <Loader2 className="h-5 w-5 animate-spin text-orange" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-navy-50', className)} aria-hidden />;
}

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icon && <div className="mb-3 text-ink-muted" aria-hidden>{icon}</div>}
      <p className="font-heading font-semibold text-navy">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-ink-muted"><span>{label}</span><span className="tabular-nums">{v}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-50" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-orange transition-all" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
