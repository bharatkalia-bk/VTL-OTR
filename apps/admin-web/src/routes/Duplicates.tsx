import { Button, Card, CardBody, EmptyState, Select } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';

interface Flag { id: string; type: string; status: string; notes: string | null; createdAt: string; candidates: Array<{ id: string; otrId: string | null; status: string; name: string | null; dob: string | null; photoUrl: string | null }> }

export default function Duplicates() {
  const [status, setStatus] = useState('OPEN');
  const q = useQuery({ queryKey: ['dups', status], queryFn: () => api.get<Flag[]>(`/admin/duplicates?status=${status}`) });
  const { run, banner } = useAction();
  return (
    <>
      <PageTitle title="Duplicate flags" description="Same photograph hash or same name + DOB + father's name across registrations." actions={<Select aria-label="Status" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option>OPEN</option><option>CLEARED</option><option>CONFIRMED</option></Select>} />
      {banner}
      {!q.data?.length && <EmptyState title="No flags" />}
      <div className="space-y-4">
        {q.data?.map((f) => (
          <Card key={f.id}><CardBody>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{f.type === 'PHOTO_HASH' ? 'Identical photograph' : 'Same identity details'} · <span className="text-sm text-ink-muted">{fmt.dt(f.createdAt)}</span></p><StatusBadge s={f.status} /></div>
            <div className="flex flex-wrap gap-4">
              {f.candidates.map((c) => (
                <Link key={c.id} to={`/candidates/${c.id}`} className="flex w-60 gap-3 rounded border border-border p-2 hover:bg-navy-50">
                  {c.photoUrl ? <img src={c.photoUrl} alt={`Photo of ${c.name}`} className="h-24 w-20 rounded object-cover" /> : <div className="h-24 w-20 rounded bg-navy-50" />}
                  <div className="text-sm"><p className="font-medium">{c.name}</p><p className="tabular-nums text-ink-muted">{c.otrId ?? 'draft'}</p><p className="tabular-nums text-ink-muted">DOB {c.dob}</p><StatusBadge s={c.status} /></div>
                </Link>
              ))}
            </div>
            {f.status === 'OPEN' && <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => void run(() => api.post(`/admin/duplicates/${f.id}/resolve`, { status: 'CLEARED', notes: 'Reviewed: distinct persons' }).then(() => q.refetch()), 'Flag cleared.')}>Clear (different persons)</Button>
              <Button size="sm" variant="danger" onClick={() => void run(() => api.post(`/admin/duplicates/${f.id}/resolve`, { status: 'CONFIRMED', notes: 'Confirmed duplicate' }).then(() => q.refetch()), 'Marked as duplicate. Block the offending registration from its profile.')}>Confirm duplicate</Button>
            </div>}
            {f.notes && <p className="mt-2 text-xs text-ink-muted">{f.notes}</p>}
          </CardBody></Card>
        ))}
      </div>
    </>
  );
}
