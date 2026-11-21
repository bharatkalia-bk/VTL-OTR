import { useQuery } from '@tanstack/react-query';
import { FIELD_ROLES, ROLE_LABELS, type AdminRole } from '@vtl/shared';
import { Logo, SkipLink, cn } from '@vtl/ui';
import {
  Award, BadgeCheck, BarChart3, Bell, Building2, CalendarClock, ClipboardCheck, Copy, CreditCard, FileClock, FileEdit, FileKey2, GitBranch, GraduationCap,
  Headset, LayoutDashboard, LogOut, Megaphone, Menu, MessagesSquare, Route, ScanLine, Search, Settings, ShieldBan, ShieldCheck, Upload, Users, X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface NavItem { to: string; label: string; icon: ReactNode; roles: AdminRole[]; exact?: boolean }
const STAFF: AdminRole[] = ['EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR'];
export const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard />, roles: STAFF },
    { to: '/journey', label: 'Journey trace', icon: <Route />, roles: STAFF },
  ] },
  { group: 'Registration', items: [
    { to: '/candidates', label: 'Candidates', icon: <Users />, roles: STAFF },
    { to: '/verification', label: 'Document verification', icon: <ClipboardCheck />, roles: ['VERIFIER', 'AUDITOR'] },
    { to: '/duplicates', label: 'Duplicate flags', icon: <Copy />, roles: ['VERIFIER', 'AUDITOR'] },
    { to: '/corrections', label: 'Correction requests', icon: <FileEdit />, roles: ['VERIFIER', 'AUDITOR'] },
  ] },
  { group: 'Examination', items: [
    { to: '/exams', label: 'Exams & admit cards', icon: <GraduationCap />, roles: STAFF },
    { to: '/exam-day', label: 'Exam day', icon: <CalendarClock />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
    { to: '/answer-keys', label: 'Answer keys & objections', icon: <FileKey2 />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
    { to: '/results', label: 'Results', icon: <Award />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
    { to: '/debarments', label: 'Debarment', icon: <ShieldBan />, roles: ['EXAM_ADMIN', 'VERIFIER', 'AUDITOR'] },
  ] },
  { group: 'Selection', items: [
    { to: '/selection', label: 'Interviews & allotment', icon: <GitBranch />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
    { to: '/dv', label: 'DV desk', icon: <BadgeCheck />, roles: ['VERIFIER', 'EXAM_ADMIN', 'AUDITOR'] },
  ] },
  { group: 'Operations', items: [
    { to: '/payments', label: 'Payments', icon: <CreditCard />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
    { to: '/comms', label: 'Communication', icon: <Megaphone />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
    { to: '/reports', label: 'Reports & exports', icon: <BarChart3 />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
    { to: '/tickets', label: 'Helpdesk', icon: <Headset />, roles: ['HELPDESK_AGENT', 'AUDITOR'] },
  ] },
  { group: 'Field workspaces', items: [
    { to: '/centre', label: 'Centre desk', icon: <ScanLine />, roles: ['CENTRE_SUPERINTENDENT'], exact: true },
    { to: '/observer', label: 'Observer', icon: <Building2 />, roles: ['OBSERVER'], exact: true },
    { to: '/agency', label: 'Agency gateway', icon: <Upload />, roles: ['AGENCY', 'EXAM_ADMIN'] },
    { to: '/panel', label: 'Interview panel', icon: <MessagesSquare />, roles: ['INTERVIEW_PANEL'], exact: true },
  ] },
  { group: 'Administration', items: [
    { to: '/audit', label: 'Audit logs', icon: <FileClock />, roles: ['AUDITOR'] },
    { to: '/users', label: 'Staff users', icon: <ShieldCheck />, roles: ['AUDITOR'] },
    { to: '/settings', label: 'Settings & account', icon: <Settings />, roles: [...STAFF, ...FIELD_ROLES] },
  ] },
];

/** Where a user lands: field staff go straight to their workspace. */
export function homeFor(roles: AdminRole[]): string {
  if (roles.some((r) => !(FIELD_ROLES as readonly string[]).includes(r))) return '/';
  if (roles.includes('CENTRE_SUPERINTENDENT')) return '/centre';
  if (roles.includes('OBSERVER')) return '/observer';
  if (roles.includes('AGENCY')) return '/agency';
  if (roles.includes('INTERVIEW_PANEL')) return '/panel';
  return '/settings';
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, can } = useAuth();
  const visible = (n: NavItem) => (n.exact ? n.roles.some((r) => user?.roles.includes(r)) : can(...n.roles));
  return (
    <>
      <div className="bg-gradient-to-r from-navy via-navy-700 to-orange-700 px-5 py-4 text-white">
        <Logo variant="white" height={30} />
        <p className="mt-1.5 font-heading text-sm font-bold tracking-wide">VTL OTR · Staff console</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Staff navigation">
        {NAV.map((g) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={g.group} className="mb-3">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{g.group}</p>
              <ul className="space-y-0.5">
                {items.map((n) => (
                  <li key={n.to}>
                    <NavLink to={n.to} end={n.to === '/'} onClick={onNavigate}
                      className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink transition-all duration-200 hover:translate-x-0.5 hover:bg-surface [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-ink-muted',
                        isActive && 'bg-orange-50 font-semibold text-orange-700 shadow-[inset_3px_0_0_rgb(var(--vtl-orange-rgb))] [&_svg]:text-orange-600')}>
                      <span aria-hidden>{n.icon}</span>{n.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3 text-xs text-ink-muted">A product of Vensysco Technologies Limited</div>
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  const staff = can(...STAFF);
  const pending = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<{ pending: Record<string, number>; lifecycle?: Record<string, number> }>('/admin/dashboard'), enabled: staff, staleTime: 60000 });
  const alerts = pending.data ? Object.values(pending.data.pending).reduce((a, b) => a + b, 0) + (pending.data.lifecycle?.biometricOpen ?? 0) + (pending.data.lifecycle?.resultsAwaitingApproval ?? 0) : 0;
  const initials = (user?.name ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const search = (e: FormEvent) => { e.preventDefault(); if (term.trim()) nav(`/journey/${encodeURIComponent(term.trim())}`); };
  return (
    <div className="flex min-h-screen bg-surface">
      <SkipLink label="Skip to main content" />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-white md:flex">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-navy/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-white shadow-raised"><Sidebar onNavigate={() => setOpen(false)} /></aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur md:px-6">
          <button className="rounded-lg p-2 text-ink hover:bg-surface md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          {staff ? (
            <form onSubmit={search} className="hidden max-w-sm flex-1 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 sm:flex" role="search">
              <Search className="h-4 w-4 text-ink-muted" aria-hidden />
              <input value={term} onChange={(e) => setTerm(e.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted" placeholder="Trace a candidate by OTR ID" aria-label="Trace a candidate by OTR ID" />
            </form>
          ) : <p className="flex-1 truncate font-heading text-sm font-semibold">{user?.roles.map((r) => ROLE_LABELS[r]).join(' · ')}</p>}
          <div className="ml-auto flex items-center gap-2">
            {staff && (
              <NavLink to="/" className="relative rounded-full p-2 text-ink hover:bg-surface" aria-label={`${alerts} items need attention`}>
                <Bell className="h-5 w-5" aria-hidden />
                {alerts > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-orange-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{alerts > 99 ? '99+' : alerts}</span>}
              </NavLink>
            )}
            <div className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-navy to-orange-700 text-xs font-bold text-white" aria-hidden>{initials}</span>
              <span className="hidden text-left text-xs leading-tight sm:block"><span className="block font-semibold">{user?.name}</span><span className="text-ink-muted">{user?.roles.map((r) => ROLE_LABELS[r]).join(', ')}</span></span>
            </div>
            <button onClick={() => void logout()} className="rounded-full p-2 text-ink hover:bg-surface" aria-label="Log out" title="Log out"><LogOut className="h-5 w-5" aria-hidden /></button>
          </div>
        </header>
        <main id="main" key={loc.pathname} tabIndex={-1} className="anim-fade-in flex-1 p-4 focus:outline-none md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-heading text-2xl font-bold">{title}</h1>{description && <p className="text-sm text-ink-muted">{description}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
