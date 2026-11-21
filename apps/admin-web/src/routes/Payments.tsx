import { Button, CursorPager, DataTable, Dialog, Field, Input, Select, StatCard } from '@vtl/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ReasonDialog, StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt, qs } from '../lib/api';
import { useAuth } from '../lib/auth';

interface P { id: string; merchantTxnId: string; gatewayTxnId: string | null; amount: number; status: string; reconciledAt: string | null; reconciliationNote: string | null; createdAt: string; application: { applicationNo: string; exam: { code: string }; candidate: { otrId: string } } }
interface Res { items: P[]; nextCursor: string | null; totals: Array<{ status: string; _count: number; _sum: { amount: number | null } }> }

export default function Payments() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [txn, setTxn] = useState('');
  const q = useInfiniteQuery({ queryKey: ['payments', status, txn], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => api.get<Res>(`/admin/payments${qs({ status, txn, cursor: pageParam })}`), getNextPageParam: (l) => l.nextCursor ?? undefined });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = q.data?.pages[0]?.totals ?? [];
  const { run, banner, busy } = useAction();
  const [verify, setVerify] = useState<P | null>(null);
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [refund, setRefund] = useState<string | null>(null);
  return (
    <>
      <PageTitle title="Payments" description="Gateway callbacks are signature-verified and idempotent. Pending payments are reconciled every 5 minutes."
        actions={can('EXAM_ADMIN') && <Button loading={busy} onClick={() => void run(async () => { await api.post('/admin/payments/reconcile'); await q.refetch(); }, 'Reconciliation run complete.')}>Reconcile now</Button>} />
      {banner}
      <div className="mb-4 grid gap-3 sm:grid-cols-5">{totals.map((t) => <StatCard key={t.status} label={t.status} value={fmt.n(t._count)} hint={fmt.inr(t._sum.amount ?? 0)} />)}</div>
      <div className="mb-4 flex gap-2">
        <Select aria-label="Status" className="w-48" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUND_MARKED'].map((s) => <option key={s}>{s}</option>)}</Select>
        <Input aria-label="Transaction ID" placeholder="Merchant / gateway transaction ID" className="max-w-sm" value={txn} onChange={(e) => setTxn(e.target.value.trim())} />
      </div>
      <DataTable caption="Payments" rows={items} rowKey={(r) => r.id} empty="No payments"
        columns={[
          { key: 'm', header: 'Merchant txn', cell: (r) => <span className="tabular-nums text-xs">{r.merchantTxnId}</span> }, { key: 'g', header: 'Gateway ref', cell: (r) => <span className="tabular-nums text-xs">{r.gatewayTxnId ?? '—'}</span> },
          { key: 'a', header: 'Application', cell: (r) => <span className="tabular-nums text-xs">{r.application.exam.code} · {r.application.applicationNo}</span> },
          { key: 'amt', header: 'Amount', numeric: true, cell: (r) => fmt.inr(r.amount) }, { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
          { key: 'r', header: 'Reconciliation', cell: (r) => <span className="text-xs">{r.reconciliationNote ?? (r.reconciledAt ? `Checked ${fmt.dt(r.reconciledAt)}` : '—')}</span> },
          { key: 'c', header: 'Created', cell: (r) => <span className="text-xs">{fmt.dt(r.createdAt)}</span> },
          { key: 'x', header: '', cell: (r) => can('EXAM_ADMIN') && (r.status === 'SUCCESS' ? <Button size="sm" variant="ghost" onClick={() => setRefund(r.id)}>Mark refund</Button> : ['PENDING', 'FAILED', 'INITIATED'].includes(r.status) ? <Button size="sm" onClick={() => setVerify(r)}>Verify manually</Button> : null) },
        ]} />
      <CursorPager hasMore={!!q.hasNextPage} onMore={() => void q.fetchNextPage()} label="Load more" />
      <Dialog open={!!verify} onClose={() => setVerify(null)} title="Manual payment verification" closeLabel="Close"
        footer={<><Button onClick={() => setVerify(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={ref.length < 4 || note.length < 5} onClick={() => void run(async () => { await api.post(`/admin/payments/${verify!.id}/verify`, { gatewayTxnId: ref, note }); setVerify(null); await q.refetch(); }, 'Payment verified and application marked paid.')}>Verify</Button></>}>
        <p className="mb-3 text-sm text-ink-muted">Use only after confirming the credit in the bank settlement statement. This action is audited.</p>
        <Field label="Bank / gateway reference" required>{(f) => <Input id={f.id} value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
        <Field label="Note" required className="mt-3">{(f) => <Input id={f.id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </Dialog>
      <ReasonDialog open={!!refund} title="Mark payment for refund" confirm="Mark refund" onClose={() => setRefund(null)} onSubmit={(reason) => run(() => api.post(`/admin/payments/${refund}/refund-marker`, { reason }).then(() => q.refetch()), 'Marked for refund.')} />
    </>
  );
}
