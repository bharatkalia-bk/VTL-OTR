import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Field, Textarea } from '@vtl/ui';
import { useState, type ReactNode } from 'react';
import { api, errMsg } from '../lib/api';

export function useCursorList<T>(key: unknown[], path: (cursor?: string) => string) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.get<{ items: T[]; nextCursor: string | null }>(path(pageParam as string | undefined)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.items) ?? [] };
}

export const tone = (s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' =>
  ['APPROVED', 'SUCCESS', 'PAID', 'FEE_EXEMPT', 'SUBMITTED', 'PUBLISHED', 'DONE', 'RESOLVED', 'CLEARED'].includes(s) ? 'success'
    : ['PENDING', 'PAYMENT_PENDING', 'DRAFT', 'OPEN', 'QUEUED', 'RUNNING', 'INITIATED', 'IN_PROGRESS'].includes(s) ? 'warning'
    : ['REJECTED', 'FAILED', 'BLOCKED', 'CONFIRMED', 'CLOSED', 'ARCHIVED'].includes(s) ? 'danger' : 'info';
export const StatusBadge = ({ s }: { s: string }) => <Badge tone={tone(s)}>{s.replace(/_/g, ' ')}</Badge>;

/** Run an action with inline error reporting. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true); setError(null); setOk(null);
    try { await fn(); if (success) setOk(success); return true; } catch (e) { setError(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const banner = <>{error && <Alert tone="danger" className="mb-4">{error}</Alert>}{ok && <Alert tone="success" className="mb-4">{ok}</Alert>}</>;
  return { busy, run, banner, setError };
}

export function ReasonDialog({ open, title, onClose, onSubmit, label = 'Reason', confirm = 'Submit', required = true, children }: { open: boolean; title: string; onClose: () => void; onSubmit: (reason: string) => Promise<unknown>; label?: string; confirm?: string; required?: boolean; children?: ReactNode }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onClose} title={title} closeLabel="Close"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={required && reason.trim().length < 3} onClick={async () => { setBusy(true); try { await onSubmit(reason); setReason(''); onClose(); } finally { setBusy(false); } }} data-testid="reason-submit">{confirm}</Button></>}>
      {children}
      <Field label={label} required={required}>{(f) => <Textarea id={f.id} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reason-input" />}</Field>
    </Dialog>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-border py-1.5 text-sm last:border-0"><dt className="text-ink-muted">{k}</dt><dd className="font-medium">{v ?? '—'}</dd></div>;
}
