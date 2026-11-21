import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Dialog, Field, Input, Select, Textarea } from '@vtl/ui';
import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
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
  ['APPROVED', 'SUCCESS', 'PAID', 'FEE_EXEMPT', 'SUBMITTED', 'PUBLISHED', 'DONE', 'RESOLVED', 'CLEARED', 'PRESENT', 'VERIFIED', 'ACCEPTED', 'DECLARED_CLEAR', 'DV_CLEARED', 'QUALIFIED', 'ACTIVE_KEY', 'COMPENSATED', 'MATCH'].includes(s) ? 'success'
    : ['PENDING', 'PAYMENT_PENDING', 'DRAFT', 'OPEN', 'QUEUED', 'RUNNING', 'INITIATED', 'IN_PROGRESS', 'PENDING_APPROVAL', 'PROPOSED', 'PROVISIONAL', 'SCHEDULED', 'SHORTLISTED', 'CALLED', 'REPORTED', 'DEFICIENT', 'WAIVED'].includes(s) ? 'warning'
    : ['REJECTED', 'FAILED', 'BLOCKED', 'CONFIRMED', 'CLOSED', 'ARCHIVED', 'ABSENT', 'CONFLICT', 'DECLINED', 'DV_FAILED', 'ACTIVE', 'MISMATCH', 'RE_EXAM', 'NOT_QUALIFIED', 'WITHHELD', 'HIGH'].includes(s) ? 'danger' : 'info';
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

export interface ExamLite { id: string; code: string; titleEn: string; status: string; stages?: string[] }
const EXAM_KEY = 'vtl.admin.exam';
/** Exam selector shared by lifecycle pages; remembers the last exam per browser. */
export function useExamPicker(path = '/admin/exams') {
  const q = useQuery({ queryKey: ['exam-list', path], queryFn: () => api.get<ExamLite[] | { items: ExamLite[] }>(path) });
  const list = Array.isArray(q.data) ? q.data : q.data?.items ?? [];
  const [id, setIdState] = useState<string>(() => { try { return localStorage.getItem(EXAM_KEY) ?? ''; } catch { return ''; } });
  const setId = (v: string) => { setIdState(v); try { localStorage.setItem(EXAM_KEY, v); } catch { /* private mode */ } };
  const current = list.find((e) => e.id === id) ?? list.find((e) => e.status !== 'DRAFT') ?? list[0];
  const picker = (
    <Select aria-label="Exam" className="w-72" value={current?.id ?? ''} onChange={(e) => setId(e.target.value)}>
      {list.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.titleEn}</option>)}
    </Select>
  );
  return { exam: current, examId: current?.id, picker, loading: q.isLoading };
}

/** Compact labelled input for dense admin forms. */
export function LInput({ label, ...p }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <Field label={label}>{(f) => <Input id={f.id} {...p} />}</Field>;
}
export function LSelect({ label, children, ...p }: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <Field label={label}>{(f) => <Select id={f.id} {...p}>{children}</Select>}</Field>;
}

/** Reads a chosen file as text (CSV uploads). */
export const readText = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); });
