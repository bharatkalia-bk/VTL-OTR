import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminRole } from '@vtl/shared';
import { Button, Dialog, Field, Input } from '@vtl/ui';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, setStepUpPrompt } from './api';

export interface AdminUser { id: string; name: string; email: string; roles: AdminRole[]; totpVerified: boolean; totpEnrolled: boolean }
interface Ctx { user: AdminUser | null; loading: boolean; refetch: () => Promise<unknown>; logout: () => Promise<void>; can: (...roles: AdminRole[]) => boolean }
const C = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-me'],
    queryFn: async () => { try { return await api.get<AdminUser>('/admin/auth/me'); } catch (e) { if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null; throw e; } },
    retry: false,
  });
  const user = q.data ?? null;
  const can = (...roles: AdminRole[]) => !!user && (user.roles.includes('SUPER_ADMIN') || roles.some((r) => user.roles.includes(r)));
  const logout = async () => { await api.post('/admin/auth/logout').catch(() => undefined); qc.clear(); await q.refetch(); };
  return <C.Provider value={{ user, loading: q.isLoading, refetch: q.refetch, logout, can }}>{children}</C.Provider>;
}
export const useAuth = () => { const c = useContext(C); if (!c) throw new Error('no auth'); return c; };

/** Prompts for a fresh authenticator code when the API requires step-up verification. */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);
  useEffect(() => {
    setStepUpPrompt(() => new Promise((resolve) => { resolver.current = resolve; setCode(''); setOpen(true); }));
    return () => setStepUpPrompt(null);
  }, []);
  const done = (v: string | null) => { setOpen(false); resolver.current?.(v); resolver.current = null; };
  return (
    <>
      {children}
      <Dialog open={open} onClose={() => done(null)} title="Confirm with authenticator" closeLabel="Close" size="sm"
        footer={<><Button onClick={() => done(null)}>Cancel</Button><Button variant="primary" disabled={code.length !== 6} onClick={() => done(code)} data-testid="stepup-confirm">Confirm</Button></>}>
        <p className="mb-3 text-sm text-ink-muted">This is a sensitive action. Enter the current 6-digit code from your authenticator app.</p>
        <Field label="Authenticator code">{(f) => <Input id={f.id} autoFocus inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && done(code)} data-testid="stepup-code" />}</Field>
      </Dialog>
    </>
  );
}
