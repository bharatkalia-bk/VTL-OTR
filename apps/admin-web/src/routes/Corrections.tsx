import { Button, CursorPager, DataTable, Select } from '@vtl/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ReasonDialog, StatusBadge, useAction, useCursorList } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt, qs } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Row { id: string; candidateId: string; otrId: string; field: string; currentValue: string | null; requestedValue: string; reason: string; documentId: string | null; status: string; decisionReason: string | null; createdAt: string }

export default function Corrections() {
  const { can } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const list = useCursorList<Row>(['corr', status], (c) => `/admin/corrections${qs({ status, cursor: c })}`);
  const { run, banner } = useAction();
  const [dlg, setDlg] = useState<{ id: string; approve: boolean } | null>(null);
  const openDoc = async (id: string) => window.open((await api.get<{ url: string }>(`/admin/documents/${id}/url`)).url, '_blank', 'noopener');
  return (
    <>
      <PageTitle title="Correction requests" description="Approval applies the change immediately (photo/signature approvals unlock re-capture). Approvals ask for a one-time code sent to your email." actions={<Select aria-label="Status" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></Select>} />
      {banner}
      <DataTable caption="Corrections" rows={list.items} rowKey={(r) => r.id} empty="No requests"
        columns={[
          { key: 'o', header: 'OTR ID', cell: (r) => <Link className="text-info underline tabular-nums" to={`/candidates/${r.candidateId}`}>{r.otrId}</Link> },
          { key: 'f', header: 'Field', cell: (r) => r.field },
          { key: 'c', header: 'Change', cell: (r) => <span>{r.currentValue ?? '—'} → <b>{r.requestedValue}</b></span> },
          { key: 'r', header: 'Reason', cell: (r) => <span className="text-xs">{r.reason}</span> },
          { key: 'd', header: 'Proof', cell: (r) => r.documentId && <button type="button" className="text-info underline" onClick={() => void openDoc(r.documentId!)}>View</button> },
          { key: 't', header: 'Raised', cell: (r) => fmt.dt(r.createdAt) },
          { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
          { key: 'a', header: '', cell: (r) => r.status === 'PENDING' && can('VERIFIER') && <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => setDlg({ id: r.id, approve: true })} data-testid="corr-approve">Approve</Button><Button size="sm" onClick={() => setDlg({ id: r.id, approve: false })}>Reject</Button></span> },
        ]} />
      <CursorPager hasMore={!!list.hasNextPage} onMore={() => void list.fetchNextPage()} label="Load more" />
      <ReasonDialog open={!!dlg} required={!dlg?.approve} title={dlg?.approve ? 'Approve correction' : 'Reject correction'} label={dlg?.approve ? 'Note (optional)' : 'Reason'} confirm={dlg?.approve ? 'Approve' : 'Reject'} onClose={() => setDlg(null)}
        onSubmit={(reason) => run(() => api.post(`/admin/corrections/${dlg!.id}/${dlg!.approve ? 'approve' : 'reject'}`, { reason: reason || undefined }).then(() => list.refetch()), 'Decision recorded; candidate notified.')} />
    </>
  );
}
