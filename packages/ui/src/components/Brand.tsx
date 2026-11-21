import logo from '../assets/vtl-logo.png';
import logoWhite from '../assets/vtl-logo-white.png';
import mark from '../assets/vtl-mark.png';
import { cn } from '../lib/cn';

/**
 * Logo with enforced clear space (padding equal to roughly the height of the "V", i.e. ~ 0.25 of logo height)
 * and fixed aspect ratio. `variant="white"` is for navy backgrounds.
 */
export function Logo({ variant = 'default', height = 40, className, alt = 'Vensysco Technologies Limited' }: { variant?: 'default' | 'white' | 'mark'; height?: number; className?: string; alt?: string }) {
  const src = variant === 'white' ? logoWhite : variant === 'mark' ? mark : logo;
  return <img src={src} alt={alt} style={{ height }} className={cn('w-auto select-none object-contain', className)} draggable={false} />;
}

export function SkipLink({ href = '#main', label }: { href?: string; label: string }) {
  return (
    <a href={href} className="sr-only-focusable fixed left-2 top-2 z-[100] rounded bg-orange-600 px-4 py-2 font-medium text-white">
      {label}
    </a>
  );
}

export function ProductName({ short, full, onNavy }: { short: string; full: string; onNavy?: boolean }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className={cn('font-heading text-base font-bold', onNavy ? 'text-white' : 'text-navy')}>{short}</span>
      <span className={cn('hidden text-[11px] sm:block', onNavy ? 'text-white/70' : 'text-ink-muted')}>{full}</span>
    </span>
  );
}
