import { Button, Logo, SkipLink, cn } from '@vtl/ui';
import { Globe, LogOut, Menu, UserRound, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Language switch: both options are always visible and the current one is highlighted. */
export function LanguageToggle({ onNavy }: { onNavy?: boolean }) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const current = i18n.language === 'hi' ? 'hi' : 'en';
  const choose = (lang: 'en' | 'hi') => {
    if (lang === current) return;
    void i18n.changeLanguage(lang);
    if (user) void api.post('/me/language', { language: lang }).catch(() => undefined);
  };
  const opts = [{ v: 'en' as const, label: 'English' }, { v: 'hi' as const, label: 'हिंदी' }];
  return (
    <div role="group" aria-label={t('app.switchLanguage')} className={cn('inline-flex items-center gap-1 rounded-full p-1', onNavy ? 'bg-white/10' : 'bg-navy-50')}>
      <Globe className={cn('ml-1.5 h-4 w-4', onNavy ? 'text-white/80' : 'text-ink-muted')} aria-hidden />
      {opts.map((o) => (
        <button key={o.v} type="button" lang={o.v} aria-pressed={current === o.v} onClick={() => choose(o.v)} data-testid={`lang-${o.v}`}
          className={cn('min-h-8 rounded-full px-3 text-sm font-medium transition-colors duration-200',
            current === o.v ? (onNavy ? 'bg-white text-navy shadow-sm' : 'bg-navy text-white shadow-sm') : (onNavy ? 'text-white hover:bg-white/15' : 'text-navy hover:bg-white'))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<{ demoMode?: boolean; demoFixedOtp?: string | null }>('/public/config'), staleTime: Infinity });
  const links = user
    ? [{ to: '/dashboard', label: t('nav.dashboard') }, { to: '/profile', label: t('nav.profile') }, { to: '/exams', label: t('nav.exams') }, { to: '/applications', label: t('nav.applications') }, { to: '/results', label: t('nav.results') }, { to: '/helpdesk', label: t('nav.helpdesk') }]
    : [{ to: '/', label: t('nav.home') }, { to: '/helpline', label: t('nav.helpline') }, { to: '/helpdesk', label: t('nav.helpdesk') }];
  // Full reload to the homepage: no data from the old session stays in memory, and no protected page can redirect first.
  const doLogout = async () => { setOpen(false); await logout(); window.location.replace('/'); };

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink label={t('app.skipToContent')} />
      {cfg.data?.demoMode && (
        <div className="bg-warning-50 text-warning-700" role="note" data-testid="demo-banner">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs font-medium">
            <span>{t('demo.banner')}{cfg.data.demoFixedOtp && <strong className="ml-1">{t('demo.fixedOtp', { code: cfg.data.demoFixedOtp })}</strong>}</span>
            <Link to="/demo-inbox" className="underline">{t('demo.inboxLink')}</Link>
          </div>
        </div>
      )}
      <div className="bg-navy-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1 text-xs">
          <span>{t('app.govNotice')}</span>
          <LanguageToggle onNavy />
        </div>
      </div>
      <header className="sticky top-0 z-40 bg-navy text-white shadow">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-3 rounded py-2">
            <Logo variant="white" height={32} className="hidden sm:block" />
            <Logo variant="mark" height={30} className="rounded bg-white p-0.5 sm:hidden" alt="" />
            <span className="border-l border-white/20 pl-3 leading-tight">
              <span className="block font-heading text-base font-bold">{t('app.name')}</span>
              <span className="hidden text-[11px] text-white/70 md:block">{t('app.fullName')}</span>
            </span>
          </Link>
          <nav aria-label={t('nav.main')} className="ml-auto hidden items-center gap-0.5 lg:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => cn('whitespace-nowrap rounded px-3 py-2 text-sm font-medium hover:bg-navy-700', isActive && 'bg-navy-700 shadow-[inset_0_-3px_0_rgb(var(--vtl-orange-rgb))]')}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            {user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="hidden items-center gap-1.5 text-sm xl:flex"><UserRound className="h-4 w-4" aria-hidden /><span className="max-w-[140px] truncate">{user.name}</span></span>
                <Button variant="onNavy" size="sm" className="whitespace-nowrap" onClick={() => void doLogout()}><LogOut className="h-4 w-4" aria-hidden />{t('app.logout')}</Button>
              </div>
            ) : (
              <div className="hidden gap-2 sm:flex">
                <Link to="/login" className="inline-flex h-9 items-center rounded border border-white/30 px-3 text-sm font-medium hover:bg-navy-700">{t('nav.login')}</Link>
                <Link to="/register" className="inline-flex h-9 items-center rounded bg-orange-600 px-3 text-sm font-medium hover:bg-orange-700">{t('nav.register')}</Link>
              </div>
            )}
            <button type="button" className="rounded p-2 hover:bg-navy-700 lg:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? t('app.closeMenu') : t('app.openMenu')} onClick={() => setOpen((o) => !o)}>
              {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label={t('nav.main')} className="border-t border-white/10 bg-navy lg:hidden">
            <ul className="mx-auto max-w-6xl px-4 py-2">
              {links.map((l) => <li key={l.to}><NavLink to={l.to} onClick={() => setOpen(false)} className="block rounded px-3 py-3 text-base hover:bg-navy-700">{l.label}</NavLink></li>)}
              {user ? (
                <li><button type="button" onClick={() => void doLogout()} className="w-full rounded px-3 py-3 text-left text-base hover:bg-navy-700">{t('app.logout')}</button></li>
              ) : (
                <>
                  <li><NavLink to="/login" onClick={() => setOpen(false)} className="block rounded px-3 py-3 hover:bg-navy-700">{t('nav.login')}</NavLink></li>
                  <li><NavLink to="/register" onClick={() => setOpen(false)} className="block rounded px-3 py-3 hover:bg-navy-700">{t('nav.register')}</NavLink></li>
                </>
              )}
            </ul>
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <footer className="mt-12 bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3">
          <div>
            <Logo variant="white" height={34} />
            <p className="mt-3 text-sm text-white/80">{t('app.footerProduct')}</p>
          </div>
          <nav aria-label={t('footer.policies')}>
            <p className="mb-2 font-heading font-semibold">{t('footer.policies')}</p>
            <ul className="space-y-1.5 text-sm text-white/80">
              {(['privacy', 'terms', 'accessibility', 'hyperlink', 'copyright'] as const).map((p) => <li key={p}><Link className="hover:text-white hover:underline" to={`/legal/${p}`}>{t(`legal.${p}.title`)}</Link></li>)}
            </ul>
          </nav>
          <div>
            <p className="mb-2 font-heading font-semibold">{t('footer.help')}</p>
            <ul className="space-y-1.5 text-sm text-white/80">
              <li><Link className="hover:text-white hover:underline" to="/helpdesk">{t('nav.helpdesk')}</Link></li>
              <li><Link className="hover:text-white hover:underline" to="/#faqs">{t('landing.faqTitle')}</Link></li>
              <li><Link className="hover:text-white hover:underline" to="/styleguide">{t('footer.styleguide')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-3 text-xs text-white/70">
            <span>© {new Date().getFullYear()} Vensysco Technologies Limited. {t('footer.rights')}</span>
            <span className="tabular-nums">{t('footer.lastUpdated', { date: '20 Nov 2026' })}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-navy via-navy-700 to-navy-600 text-white">
      <span className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-orange/25 blur-2xl" aria-hidden />
      <span className="pointer-events-none absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-orange-600 via-orange to-transparent" aria-hidden />
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3 px-4 pb-6 pt-7 sm:pb-8 sm:pt-9">
        <div className="anim-fade-up">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-white/80">{description}</p>}
        </div>
        {actions && <div className="anim-fade-up anim-delay-1">{actions}</div>}
      </div>
    </div>
  );
}

export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <div className={cn('anim-fade-in mx-auto px-4 py-6', narrow ? 'max-w-xl' : 'max-w-6xl')}>{children}</div>;
}

/** Login, registration and recovery: the form beside a photo panel on wide screens. */
export function AuthPage({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="anim-fade-in mx-auto grid max-w-6xl items-start gap-8 px-4 py-6 lg:grid-cols-[1fr_minmax(0,560px)] lg:py-10">
      <aside className="relative hidden min-h-[520px] overflow-hidden rounded-2xl shadow-raised lg:block" aria-hidden>
        <img src="/images/login-hall.jpg" alt="" className="anim-slow-zoom absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/70 to-navy/10" />
        <div className="absolute inset-x-0 bottom-0 p-8 text-white">
          <p className="font-heading text-2xl font-bold leading-snug">{t('authAside.title')}</p>
          <ul className="mt-4 space-y-2 text-sm text-white/90">
            {(['b1', 'b2', 'b3'] as const).map((k, i) => <li key={k} className={`anim-fade-up anim-delay-${i + 1} flex items-center gap-2`}><span className="h-1.5 w-1.5 rounded-full bg-orange" />{t(`authAside.${k}`)}</li>)}
          </ul>
        </div>
      </aside>
      <div className="anim-fade-up">{children}</div>
    </div>
  );
}
