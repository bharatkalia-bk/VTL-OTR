import { Button, CursorPager, DataTable, Select } from '@vtl/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ReasonDialog, StatusBadge, useAction, useCursorList } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt, qs } from '../lib/api';

interface Doc { id: string; kind: string; fileName: string; sizeBytes: number; verificationStatus: string; createdAt: string; candidate: { id: string; otrId: string | null } }

export default function Verification() {
  const [status, setStatus] = useState('PENDING');
  const list = useCursorList<Doc>(['docs', status], (c) => `/admin/documents${qs({ status, cursor: c, limit: 25 })}`);
  const { run, banner } = useAction();
  const [reject, setReject] = useState<string | null>(null);
  const open = async (id: string) => window.open((await api.get<{ url: string }>(`/admin/documents/${id}/url`)).url, '_blank', 'noopener');
  return (
    <>
      <PageTitle title="Document verification" description="Certificates from submitted OTR profiles, oldest first." actions={<Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></Select>} />
      {banner}
      <DataTable caption="Documents" rows={list.items} rowKey={(r) => r.id} empty="Nothing to verify"
        columns={[
          { key: 'c', header: 'Candidate', cell: (r) => <Link className="text-info underline tabular-nums" to={`/candidates/${r.candidate.id}`}>{r.candidate.otrId}</Link> },
          { key: 'k', header: 'Document', cell: (r) => r.kind },
          { key: 'f', header: 'File', cell: (r) => <button type="button" className="text-info underline" onClick={() => void open(r.id)}>{r.fileName} ({Math.round(r.sizeBytes / 1024)} KB)</button> },
          { key: 'd', header: 'Uploaded', cell: (r) => fmt.dt(r.createdAt) },
          { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.verificationStatus} /> },
          { key: 'a', header: 'Action', cell: (r) => r.verificationStatus === 'PENDING' && <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => void run(() => api.post(`/admin/documents/${r.id}/approve`).then(() => list.refetch()), 'Approved.')}>Approve</Button><Button size="sm" onClick={() => setReject(r.id)}>Reject</Button></span> },
        ]} />
      <CursorPager hasMore={!!list.hasNextPage} onMore={() => void list.fetchNextPage()} label="Load more" />
      <ReasonDialog open={!!reject} title="Reject document" confirm="Reject" onClose={() => setReject(null)} onSubmit={(reason) => run(() => api.post(`/admin/documents/${reject}/reject`, { reason }).then(() => list.refetch()), 'Rejected; candidate notified.')} />
    </>
  );
}
