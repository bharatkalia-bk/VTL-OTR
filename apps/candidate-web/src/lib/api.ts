/** Thin fetch client: cookies (httpOnly) for auth, double-submit CSRF header, single refresh retry. */
export interface ApiIssue { path: string; message: string }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public issues: ApiIssue[] = [], public data: Record<string, unknown> = {}) {
    super(message);
  }
}

function csrfFromCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)vtl_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

let csrfReady: Promise<void> | null = null;
export function ensureCsrf(): Promise<void> {
  if (csrfFromCookie()) return Promise.resolve();
  csrfReady ??= fetch('/api/v1/auth/csrf', { credentials: 'same-origin' }).then(() => undefined);
  return csrfReady;
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(prefix: string): Promise<boolean> {
  refreshing ??= fetch(`/api/v1/${prefix}/refresh`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfFromCookie() ?? '' } })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export interface RequestOpts { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal; noRefresh?: boolean }

export function createApi(refreshPrefix: 'auth' | 'admin/auth') {
  async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
    if (method !== 'GET') await ensureCsrf();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-CSRF-Token'] = csrfFromCookie() ?? '';
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`/api/v1${path}`, { method, headers, credentials: 'same-origin', signal: opts.signal, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
    if (res.status === 401 && !opts.noRefresh && !path.includes('/refresh') && !path.includes('/login')) {
      if (await tryRefresh(refreshPrefix)) return request<T>(path, { ...opts, noRefresh: true });
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('application/json') ? await res.json().catch(() => ({})) : null;
    if (!res.ok) {
      const d = (data ?? {}) as { code?: string; message?: string; issues?: ApiIssue[] };
      throw new ApiError(res.status, d.code ?? 'ERROR', d.message ?? res.statusText, d.issues ?? [], (data ?? {}) as Record<string, unknown>);
    }
    return data as T;
  }

  /** Download a file (PDF/XLSX) through fetch so auth + refresh apply; triggers save. */
  async function download(path: string, filename: string): Promise<void> {
    let res = await fetch(`/api/v1${path}`, { credentials: 'same-origin' });
    if (res.status === 401 && (await tryRefresh(refreshPrefix))) res = await fetch(`/api/v1${path}`, { credentials: 'same-origin' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new ApiError(res.status, d.code ?? 'ERROR', d.message ?? 'Download failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return {
    get: <T>(p: string, o?: RequestOpts) => request<T>(p, o),
    post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: body ?? {} }),
    put: <T>(p: string, body?: unknown) => request<T>(p, { method: 'PUT', body: body ?? {} }),
    del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
    upload: <T>(p: string, form: FormData) => request<T>(p, { method: 'POST', form }),
    download,
  };
}

export const api = createApi('auth');
