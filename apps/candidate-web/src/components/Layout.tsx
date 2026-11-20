import { Button, Logo, SkipLink, cn } from '@vtl/ui';
import { Globe, LogOut, Menu, UserRound, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LanguageToggle({ onNavy }: { onNavy?: boolean }) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const next = i18n.language === 'hi' ? 'en' : 'hi';
  return (
    <button type="button" lang={next} onClick={() => { void i18n.changeLanguage(next); if (user) void api.post('/me/language', { language: next }).catch(() => undefined); }}
      className={cn('inline-flex min-h-10 items-center gap-1.5 rounded px-3 text-sm font-medium', onNavy ? 'text-white hover:bg-navy-700' : 'text-navy hover:bg-navy-50')}
      aria-label={t('app.switchLanguage')} data-testid="lang-toggle">
      <Globe className="h-4 w-4" aria-hidden />{next === 'hi' ? 'हिंदी' : 'English'}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const links = user
    ? [{ to: '/dashboard', label: t('nav.dashboard') }, { to: '/profile', label: t('nav.profile') }, { to: '/exams', label: t('nav.exams') }, { to: '/applications', label: t('nav.applications') }, { to: '/helpdesk', label: t('nav.helpdesk') }]
    : [{ to: '/', label: t('nav.home') }, { to: '/helpdesk', label: t('nav.helpdesk') }];
  const doLogout = async () => { await logout(); setOpen(false); nav('/login'); };

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink label={t('app.skipToContent')} />
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
          <nav aria-label={t('nav.main')} className="ml-auto hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => cn('rounded px-3 py-2 text-sm font-medium hover:bg-navy-700', isActive && 'bg-navy-700 shadow-[inset_0_-3px_0_rgb(var(--vtl-orange-rgb))]')}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            {user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="flex items-center gap-1.5 text-sm"><UserRound className="h-4 w-4" aria-hidden /><span className="max-w-[140px] truncate">{user.name}</span></span>
                <Button variant="onNavy" size="sm" onClick={() => void doLogout()}><LogOut className="h-4 w-4" aria-hidden />{t('app.logout')}</Button>
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
    <div className="mx-auto max-w-6xl px-4 pb-2 pt-6 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-ink-muted">{description}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <div className={cn('mx-auto px-4 py-4', narrow ? 'max-w-xl' : 'max-w-6xl')}>{children}</div>;
}
