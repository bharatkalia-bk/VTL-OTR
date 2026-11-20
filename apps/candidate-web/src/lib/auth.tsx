import type { SessionUser } from '@vtl/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@vtl/ui';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from './api';

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  setUser: (u: SessionUser | null) => void;
  logout: () => Promise<void>;
  refetch: () => Promise<unknown>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<SessionUser>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const setUser = useCallback((u: SessionUser | null) => qc.setQueryData(['me'], u), [qc]);
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
  }, [qc]);
  const value = useMemo(() => ({ user: q.data ?? null, loading: q.isLoading, setUser, logout, refetch: q.refetch }), [q.data, q.isLoading, setUser, logout, q.refetch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const { t } = useTranslation();
  if (loading) return <div className="flex justify-center py-16"><Spinner label={t('app.loading')} /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}
