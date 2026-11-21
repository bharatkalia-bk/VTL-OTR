import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Fades and slides its content in when it scrolls into view (once). Respects reduced motion via CSS. */
export function Reveal({ children, delay = 0, className, as: Tag = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: ElementType }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={cn('reveal', shown && 'is-visible', className)} style={{ ['--reveal-delay' as string]: `${delay}s` }}>{children}</Tag>;
}
