import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, DataTable, Textarea } from '@vtl/ui';
import { useState } from 'react';
import { LInput, LSelect, ReasonDialog, StatusBadge, useAction, useExamPicker } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface D { id: string; otrId: string | null; scope: string; reason: string; sourceType: string; fromDate: string; untilDate: string | null; status: string; proposedBy: string | null; approvedBy: string | null; revokeReason: string | null; createdAt: string }

export default function Debarments() {
  const { can, user } = useAuth();
  const { examId, picker } = useExamPicker();
  const { run, banner, busy } = useAction();
  const [status, setStatus] = useState('');
  const list = useQuery({ queryKey: ['debarments', status], queryFn: () => api.get<D[]>(`/admin/debarments${status ? `?status=${status}` : ''}`) });
  const [f, setF] = useState({ otrId: '', scope: 'ALL', reason: '', sourceType: 'MANUAL', fromDate: new Date().toISOString().slice(0, 10), untilDate: '' });
  const [revoke, setRevoke] = useState<string | null>(null);
  void user;
  return (
    <>
      <PageTitle title="Debarment" description="Proposed by one officer, approved by another, enforced when applying and at the centre gate" actions={<LSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['PROPOSED', 'ACTIVE', 'REJECTED', 'REVOKED'].map((s) => <option key={s}>{s}</option>)}</LSelect>} />
      {banner}
      {can('EXAM_ADMIN', 'VERIFIER') && (
        <Card className="mb-4"><CardHeader title="Propose debarment" description="Attach the source: observer report, confirmed biometric alert or integrity flag." />
          <CardBody className="grid gap-3 md:grid-cols-3">
            <LInput label="Candidate OTR ID" value={f.otrId} onChange={(e) => setF({ ...f, otrId: e.target.value.toUpperCase() })} placeholder="VTL-OTR-2026-…" />
            <LSelect label="Scope" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="ALL">All exams</option><option value="EXAM">Selected exam only</option></LSelect>
            {f.scope === 'EXAM' ? <div className="flex items-end">{picker}</div> : <span />}
            <LSelect label="Source" value={f.sourceType} onChange={(e) => setF({ ...f, sourceType: e.target.value })}>{['MANUAL', 'OBSERVER_REPORT', 'BIOMETRIC', 'ANOMALY'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}</LSelect>
            <LInput label="From" type="date" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value })} />
            <LInput label="Until (blank = permanent)" type="date" value={f.untilDate} onChange={(e) => setF({ ...f, untilDate: e.target.value })} />
            <div className="md:col-span-3"><label className="text-sm font-medium" htmlFor="deb-reason">Reason and evidence summary</label><Textarea id="deb-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
            <div><Button variant="primary" loading={busy} disabled={f.reason.length < 10 || !f.otrId} onClick={() => void run(async () => { await api.post('/admin/debarments', { ...f, examId: f.scope === 'EXAM' ? examId : undefined, untilDate: f.untilDate || undefined }); setF({ ...f, otrId: '', reason: '' }); await list.refetch(); }, 'Proposed. Another officer must approve.')}>Propose</Button></div>
          </CardBody>
        </Card>
      )}
      <DataTable caption="Debarments" rows={list.data ?? []} rowKey={(r) => r.id} empty="No debarments" columns={[
        { key: 'o', header: 'OTR ID', cell: (r) => <span className="tabular-nums">{r.otrId}</span> }, { key: 'sc', header: 'Scope', cell: (r) => r.scope },
        { key: 'r', header: 'Reason', cell: (r) => <div><p>{r.reason}</p><p className="text-xs text-ink-muted">Source {r.sourceType.toLowerCase()} · proposed by {r.proposedBy}{r.approvedBy && ` · decided by ${r.approvedBy}`}</p>{r.revokeReason && <p className="text-xs">Note: {r.revokeReason}</p>}</div> },
        { key: 'p', header: 'Period', cell: (r) => `${fmt.d(r.fromDate)} to ${r.untilDate ? fmt.d(r.untilDate) : 'permanent'}` }, { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
        { key: 'a', header: '', cell: (r) => <div className="flex gap-1">
          {r.status === 'PROPOSED' && can('EXAM_ADMIN') && <><Button size="sm" variant="danger" onClick={() => void run(async () => { await api.post(`/admin/debarments/${r.id}/decision`, { approve: true }); await list.refetch(); }, 'Debarment active.')}>Approve</Button><Button size="sm" onClick={() => void run(async () => { await api.post(`/admin/debarments/${r.id}/decision`, { approve: false }); await list.refetch(); }, 'Rejected.')}>Reject</Button></>}
          {r.status === 'ACTIVE' && can('SUPER_ADMIN') && <Button size="sm" onClick={() => setRevoke(r.id)}>Revoke</Button>}
        </div> },
      ]} />
      <ReasonDialog open={!!revoke} title="Revoke debarment" onClose={() => setRevoke(null)} onSubmit={(reason) => run(async () => { await api.post(`/admin/debarments/${revoke}/revoke`, { reason }); await list.refetch(); }, 'Revoked.')} />
    </>
  );
}
