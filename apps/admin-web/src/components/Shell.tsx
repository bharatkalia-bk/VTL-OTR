import type { AdminRole } from '@vtl/shared';
import { Button, Logo, SkipLink, cn } from '@vtl/ui';
import { BarChart3, ClipboardCheck, Copy, CreditCard, FileClock, FileEdit, GraduationCap, Headset, LayoutDashboard, LogOut, Megaphone, Settings, ShieldCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV: Array<{ to: string; label: string; icon: ReactNode; roles: AdminRole[] }> = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard />, roles: ['EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR'] },
  { to: '/candidates', label: 'Candidates', icon: <Users />, roles: ['EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR'] },
  { to: '/verification', label: 'Document verification', icon: <ClipboardCheck />, roles: ['VERIFIER', 'AUDITOR'] },
  { to: '/duplicates', label: 'Duplicate flags', icon: <Copy />, roles: ['VERIFIER', 'AUDITOR'] },
  { to: '/corrections', label: 'Correction requests', icon: <FileEdit />, roles: ['VERIFIER', 'AUDITOR'] },
  { to: '/exams', label: 'Exams & admit cards', icon: <GraduationCap />, roles: ['EXAM_ADMIN', 'VERIFIER', 'HELPDESK_AGENT', 'AUDITOR'] },
  { to: '/payments', label: 'Payments', icon: <CreditCard />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
  { to: '/comms', label: 'Communication', icon: <Megaphone />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
  { to: '/reports', label: 'Reports & exports', icon: <BarChart3 />, roles: ['EXAM_ADMIN', 'AUDITOR'] },
  { to: '/tickets', label: 'Helpdesk', icon: <Headset />, roles: ['HELPDESK_AGENT', 'AUDITOR'] },
  { to: '/audit', label: 'Audit logs', icon: <FileClock />, roles: ['AUDITOR'] },
  { to: '/users', label: 'Admin users', icon: <ShieldCheck />, roles: ['AUDITOR'] },
  { to: '/settings', label: 'Settings & masters', icon: <Settings />, roles: ['AUDITOR', 'EXAM_ADMIN'] },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, can, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <SkipLink label="Skip to main content" />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy text-white md:flex" aria-label="Admin navigation">
        <div className="border-b border-white/10 px-5 py-4"><Logo variant="white" height={34} /><p className="mt-2 font-heading text-sm font-bold">VTL OTR · Admin</p></div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {NAV.filter((n) => can(...n.roles)).map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => cn('flex items-center gap-3 rounded px-3 py-2 text-sm hover:bg-navy-700 [&_svg]:h-4 [&_svg]:w-4', isActive && 'bg-navy-700 shadow-[inset_3px_0_0_rgb(var(--vtl-orange-rgb))]')}>
                  <span aria-hidden>{n.icon}</span>{n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-white/10 px-5 py-3 text-xs text-white/70">A product of Vensysco Technologies Limited</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-white px-6">
          <p className="text-sm text-ink-muted md:hidden">VTL OTR Admin (use a desktop for the full console)</p>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{user?.name}</span>
            <span className="rounded bg-navy-50 px-2 py-0.5 text-xs font-semibold">{user?.roles.join(', ')}</span>
            <Button size="sm" variant="ghost" onClick={() => void logout()}><LogOut className="h-4 w-4" aria-hidden />Log out</Button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 p-6 focus:outline-none">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1>{description && <p className="text-sm text-ink-muted">{description}</p>}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
