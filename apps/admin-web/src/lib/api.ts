export interface ApiIssue { path: string; message: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public issues: ApiIssue[] = []) { super(message); }
}
const csrf = () => decodeURIComponent(document.cookie.match(/(?:^|;\s*)vtl_csrf=([^;]+)/)?.[1] ?? '');
let csrfInit: Promise<unknown> | null = null;
const ensureCsrf = () => (csrf() ? Promise.resolve() : (csrfInit ??= fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })));

/** Registered by <StepUpProvider>: asks the admin for a fresh TOTP code. */
let stepUpPrompt: (() => Promise<string | null>) | null = null;
export const setStepUpPrompt = (fn: typeof stepUpPrompt) => { stepUpPrompt = fn; };

let refreshing: Promise<boolean> | null = null;
const refresh = () => (refreshing ??= fetch('/api/v1/admin/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf() } }).then((r) => r.ok).finally(() => setTimeout(() => (refreshing = null), 0)));

async function request<T>(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}, retried = false): Promise<T> {
  if (method !== 'GET') await ensureCsrf();
  const headers: Record<string, string> = { Accept: 'application/json', ...extra };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/v1${path}`, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : {};
  if (res.status === 401 && !retried && !path.startsWith('/admin/auth/')) {
    if (await refresh()) return request<T>(path, method, body, extra, true);
  }
  if (!res.ok) {
    if (data.code === 'STEP_UP_REQUIRED' && stepUpPrompt && !extra['X-TOTP-Code']) {
      const code = await stepUpPrompt();
      if (code) return request<T>(path, method, body, { ...extra, 'X-TOTP-Code': code }, retried);
    }
    throw new ApiError(res.status, data.code ?? 'ERROR', data.message ?? res.statusText, data.issues ?? []);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, b: unknown = {}) => request<T>(p, 'POST', b),
  put: <T>(p: string, b: unknown = {}) => request<T>(p, 'PUT', b),
  del: <T>(p: string) => request<T>(p, 'DELETE'),
};
export const errMsg = (e: unknown) => (e instanceof ApiError ? (e.issues.length ? `${e.message} ${e.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}` : e.message) : 'Network error. Please try again.');
export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const r = s.toString();
  return r ? `?${r}` : '';
};
export const fmt = {
  dt: (d?: string | null) => (d ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—'),
  d: (d?: string | null) => (d ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d.length === 10 ? `${d}T00:00:00+05:30` : d)) : '—'),
  n: (n: number) => new Intl.NumberFormat('en-IN').format(n),
  inr: (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n),
};
