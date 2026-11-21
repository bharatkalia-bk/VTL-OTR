import { Button, Card, CardBody, CardHeader, Checkbox, CursorPager, DataTable, Dialog, Select, Tabs, Textarea } from '@vtl/ui';
import { TICKET_CATEGORIES } from '@vtl/shared';
import { PhoneCall } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LInput, LSelect, StatusBadge, useAction, useCursorList } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt, qs } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Ivr { id: string; callerMasked: string; lang: string; path: string[]; outcome: string | null; ticketId: string | null; startedAt: string; transcript: Array<{ d: string; say: string }> }
interface T { id: string; ticketNo: string; channel?: string; category: string; subject: string; status: string; createdAt: string; updatedAt: string; candidate: { otrId: string | null } | null }
interface D extends T { contact?: { name: string; mobile: string; email: string } | null; messages: Array<{ id: string; authorType: string; message: string; createdAt: string }> }

export default function Tickets() {
  const { can } = useAuth();
  const [status, setStatus] = useState('OPEN');
  const list = useCursorList<T>(['tickets', status], (c) => `/admin/tickets${qs({ status, cursor: c })}`);
  const [sel, setSel] = useState<string | null>(null);
  const d = useQuery({ queryKey: ['ticket', sel], queryFn: () => api.get<D>(`/admin/tickets/${sel}`), enabled: !!sel });
  const [reply, setReply] = useState('');
  const { run, banner, busy } = useAction();
  const [tab, setTab] = useState<'tickets' | 'ivr'>('tickets');
  const ivr = useQuery({ queryKey: ['ivr'], queryFn: () => api.get<Ivr[]>('/admin/ivr-calls'), enabled: tab === 'ivr' });
  const [phone, setPhone] = useState(false);
  const [pf, setPf] = useState({ callerName: '', mobile: '', otrId: '', category: 'OTHER', subject: '', notes: '', resolved: false });
  return (
    <>
      <PageTitle title="Helpdesk" description="Web tickets, chat escalations, IVR call-backs and logged phone calls" actions={<>{can('HELPDESK_AGENT') && <Button variant="primary" onClick={() => setPhone(true)}><PhoneCall className="h-4 w-4" aria-hidden />Log phone call</Button>}<Select aria-label="Status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}</Select></>} />
      {banner}
      <Tabs label="Helpdesk sections" value={tab} onChange={setTab} tabs={[{ value: 'tickets', label: 'Tickets' }, { value: 'ivr', label: 'IVR calls' }]} />
      <div className="mt-4" />
      {tab === 'ivr' && <DataTable caption="IVR calls" rows={ivr.data ?? []} rowKey={(r) => r.id} empty="No IVR calls" columns={[
        { key: 't', header: 'Started', cell: (r) => <span className="text-xs">{fmt.dt(r.startedAt)}</span> }, { key: 'c', header: 'Caller', cell: (r) => <span className="tabular-nums">{r.callerMasked}</span> }, { key: 'l', header: 'Language', cell: (r) => r.lang.toUpperCase() },
        { key: 'p', header: 'Keys pressed', cell: (r) => r.path.join(' › ') || '-' }, { key: 'o', header: 'Outcome', cell: (r) => (r.outcome ? <StatusBadge s={r.outcome} /> : '-') },
        { key: 's', header: 'Last prompt', cell: (r) => <span className="text-xs">{r.transcript.at(-1)?.say.slice(0, 120)}</span> },
      ]} />}
      {tab === 'tickets' && (
      <div className="grid gap-4 xl:grid-cols-[1fr_480px]">
        <div>
          <DataTable caption="Tickets" rows={list.items} rowKey={(r) => r.id} selectedKey={sel ?? undefined} onRowClick={(r) => setSel(r.id)} empty="No tickets" columns={[
            { key: 'n', header: 'Ticket', cell: (r) => <span className="tabular-nums">{r.ticketNo}</span> }, { key: 'ch', header: 'Channel', cell: (r) => <StatusBadge s={r.channel ?? 'WEB'} /> }, { key: 'c', header: 'Category', cell: (r) => r.category }, { key: 's', header: 'Subject', cell: (r) => r.subject },
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
      )}
      <Dialog open={phone} onClose={() => setPhone(false)} title="Log a phone call" closeLabel="Close" size="lg"
        footer={<><Button onClick={() => setPhone(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={pf.callerName.length < 2 || !/^[6-9]\d{9}$/.test(pf.mobile) || pf.subject.length < 5 || pf.notes.length < 5} onClick={() => void run(async () => { await api.post('/admin/tickets/phone', { ...pf, otrId: pf.otrId || undefined }); setPhone(false); setPf({ callerName: '', mobile: '', otrId: '', category: 'OTHER', subject: '', notes: '', resolved: false }); await list.refetch(); }, 'Call logged as a ticket.')}>Save</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <LInput label="Caller name" value={pf.callerName} onChange={(e) => setPf({ ...pf, callerName: e.target.value })} />
          <LInput label="Mobile" inputMode="numeric" value={pf.mobile} onChange={(e) => setPf({ ...pf, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <LInput label="OTR ID (if known)" value={pf.otrId} onChange={(e) => setPf({ ...pf, otrId: e.target.value.toUpperCase() })} />
          <LSelect label="Category" value={pf.category} onChange={(e) => setPf({ ...pf, category: e.target.value })}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ').toLowerCase()}</option>)}</LSelect>
          <div className="sm:col-span-2"><LInput label="Subject" value={pf.subject} onChange={(e) => setPf({ ...pf, subject: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="text-sm font-medium" htmlFor="call-notes">Call notes</label><Textarea id="call-notes" value={pf.notes} onChange={(e) => setPf({ ...pf, notes: e.target.value })} /></div>
          <Checkbox label="Resolved during the call" checked={pf.resolved} onChange={(e) => setPf({ ...pf, resolved: e.target.checked })} />
        </div>
      </Dialog>
    </>
  );
}
