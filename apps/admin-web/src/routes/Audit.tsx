import { Button, Card, CardBody, DataTable, Dialog, Input } from '@vtl/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageTitle } from '../components/Shell';
import { api, fmt, qs } from '../lib/api';

interface Log { id: string; at: string; actorType: string; actorId: string | null; action: string; entity: string; entityId: string | null; ip: string | null; requestId: string | null; hasBefore?: boolean; hasAfter?: boolean }

export default function Audit() {
  const [f, setF] = useState({ action: '', entity: '', entityId: '', actorId: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const q = useInfiniteQuery({ queryKey: ['audit', applied], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => api.get<{ items: Log[]; nextBefore: string | null }>(`/admin/audit-logs${qs({ ...applied, before: pageParam, limit: 50 })}`), getNextPageParam: (l) => l.nextBefore ?? undefined });
  const [detail, setDetail] = useState<{ before: unknown; after: unknown; action: string } | null>(null);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <PageTitle title="Audit logs" description="Append-only (enforced in the database). Before/after values are encrypted at rest and decrypted only for auditors on demand." />
      <Card className="mb-4"><CardBody className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {(['action', 'entity', 'entityId', 'actorId'] as const).map((k) => <Input key={k} aria-label={k} placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />)}
        <Input aria-label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input aria-label="To" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <Button variant="secondary" onClick={() => setApplied(f)}>Filter</Button>
      </CardBody></Card>
      <DataTable caption="Audit log" rows={rows} rowKey={(r) => r.id} empty="No entries" columns={[
        { key: 'at', header: 'Time (IST)', cell: (r) => <span className="tabular-nums text-xs">{fmt.dt(r.at)}</span> },
        { key: 'actor', header: 'Actor', cell: (r) => <span className="text-xs">{r.actorType}<br /><span className="font-mono text-ink-muted">{r.actorId?.slice(0, 8)}</span></span> },
        { key: 'action', header: 'Action', cell: (r) => <span className="font-medium">{r.action}</span> },
        { key: 'entity', header: 'Entity', cell: (r) => <span className="text-xs">{r.entity}<br /><span className="font-mono text-ink-muted">{r.entityId?.slice(0, 8)}</span></span> },
        { key: 'ip', header: 'IP', cell: (r) => <span className="font-mono text-xs">{r.ip}</span> },
        { key: 'd', header: '', cell: (r) => (r.hasBefore || r.hasAfter) && <Button size="sm" variant="ghost" onClick={() => void api.get<{ before: unknown; after: unknown; action: string }>(`/admin/audit-logs/${r.id}`).then(setDetail)}>Diff</Button> },
      ]} />
      {q.hasNextPage && <div className="mt-3 flex justify-center"><Button onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title={detail?.action ?? ''} size="lg" closeLabel="Close">
        <div className="grid gap-3 md:grid-cols-2">
          <div><p className="mb-1 text-xs font-semibold text-ink-muted">Before</p><pre className="max-h-96 overflow-auto rounded bg-surface p-2 text-xs">{JSON.stringify(detail?.before, null, 2)}</pre></div>
          <div><p className="mb-1 text-xs font-semibold text-ink-muted">After</p><pre className="max-h-96 overflow-auto rounded bg-surface p-2 text-xs">{JSON.stringify(detail?.after, null, 2)}</pre></div>
        </div>
      </Dialog>
    </>
  );
}
