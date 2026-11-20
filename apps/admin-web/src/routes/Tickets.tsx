import { Button, Card, CardBody, CardHeader, CursorPager, DataTable, Select, Textarea } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StatusBadge, useAction, useCursorList } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt, qs } from '../lib/api';
import { useAuth } from '../lib/auth';

interface T { id: string; ticketNo: string; category: string; subject: string; status: string; createdAt: string; updatedAt: string; candidate: { otrId: string | null } | null }
interface D extends T { contact?: { name: string; mobile: string; email: string } | null; messages: Array<{ id: string; authorType: string; message: string; createdAt: string }> }

export default function Tickets() {
  const { can } = useAuth();
  const [status, setStatus] = useState('OPEN');
  const list = useCursorList<T>(['tickets', status], (c) => `/admin/tickets${qs({ status, cursor: c })}`);
  const [sel, setSel] = useState<string | null>(null);
  const d = useQuery({ queryKey: ['ticket', sel], queryFn: () => api.get<D>(`/admin/tickets/${sel}`), enabled: !!sel });
  const [reply, setReply] = useState('');
  const { run, banner, busy } = useAction();
  return (
    <>
      <PageTitle title="Helpdesk" actions={<Select aria-label="Status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</Select>} />
      {banner}
      <div className="grid gap-4 xl:grid-cols-[1fr_480px]">
        <div>
          <DataTable caption="Tickets" rows={list.items} rowKey={(r) => r.id} selectedKey={sel ?? undefined} onRowClick={(r) => setSel(r.id)} empty="No tickets" columns={[
            { key: 'n', header: 'Ticket', cell: (r) => <span className="tabular-nums">{r.ticketNo}</span> }, { key: 'c', header: 'Category', cell: (r) => r.category }, { key: 's', header: 'Subject', cell: (r) => r.subject },
            { key: 'o', header: 'OTR', cell: (r) => <span className="tabular-nums text-xs">{r.candidate?.otrId ?? 'public'}</span> }, { key: 'st', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> }, { key: 'u', header: 'Updated', cell: (r) => <span className="text-xs">{fmt.dt(r.updatedAt)}</span> },
          ]} />
          <CursorPager hasMore={!!list.hasNextPage} onMore={() => void list.fetchNextPage()} label="Load more" />
        </div>
        {d.data && (
          <Card><CardHeader title={`${d.data.ticketNo}: ${d.data.subject}`} actions={<StatusBadge s={d.data.status} />} />
            <CardBody className="space-y-3">
              {d.data.contact && <p className="text-sm">Contact: {d.data.contact.name} · {d.data.contact.mobile} · {d.data.contact.email}</p>}
              {d.data.messages.map((m) => <div key={m.id} className={`rounded p-3 text-sm ${m.authorType === 'ADMIN' ? 'border-l-4 border-orange bg-orange-50' : 'bg-surface'}`}><p className="text-xs text-ink-muted">{m.authorType} · {fmt.dt(m.createdAt)}</p><p className="whitespace-pre-wrap">{m.message}</p></div>)}
              {can('HELPDESK_AGENT') && <>
                <Textarea aria-label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to candidate" />
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={!reply} loading={busy} onClick={() => void run(async () => { await api.post(`/admin/tickets/${sel}/reply`, { message: reply }); setReply(''); await Promise.all([d.refetch(), list.refetch()]); }, 'Reply sent.')}>Send reply</Button>
                  {['RESOLVED', 'CLOSED'].map((s) => <Button key={s} onClick={() => void run(async () => { await api.post(`/admin/tickets/${sel}/status`, { status: s }); await Promise.all([d.refetch(), list.refetch()]); }, `Marked ${s}.`)}>Mark {s.toLowerCase()}</Button>)}
                </div>
              </>}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
