import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, CardBody, CardHeader, DataTable, Select, Textarea } from '@vtl/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LInput, StatusBadge, useAction, useExamPicker } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Item { item: string; status: string; note?: string }
interface Session { id: string; date: string; slot: string; venue: string; status: string; name: string; rollNo: string | null; category: string; otrId: string | null; candidateId: string; checklist: Item[]; aiFindings: { items?: Array<{ severity: string; text: string }>; note?: string | null; provider?: string }; remarks: string | null; allotment: { orgName: string; category: string } | null }

export default function DvDesk() {
  const { can } = useAuth();
  const { examId, picker } = useExamPicker();
  const [date, setDate] = useState('');
  const { run, banner, busy } = useAction();
  const list = useQuery({ queryKey: ['dv', examId, date], queryFn: () => api.get<Session[]>(`/admin/exams/${examId}/dv${date ? `?date=${date}` : ''}`), enabled: !!examId });
  const [sel, setSel] = useState<string | null>(null);
  const s = list.data?.find((x) => x.id === sel) ?? null;
  const [items, setItems] = useState<Item[] | null>(null);
  const [remarks, setRemarks] = useState('');
  const checklist = items ?? s?.checklist ?? [];
  const save = (status: string) => run(async () => { await api.put(`/admin/dv/${s!.id}`, { status, checklist: checklist.map((c) => ({ ...c, status: c.status === 'PENDING' ? 'NA' : c.status })), remarks: remarks || undefined }); setItems(null); await list.refetch(); }, `Marked ${status.toLowerCase()}.`);

  return (
    <>
      <PageTitle title="Document verification desk" description="Check originals against the online record; discrepancy checks highlight what to examine" actions={<div className="flex gap-2">{picker}<div className="w-44"><LInput label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>} />
      {banner}
      <div className="grid gap-4 xl:grid-cols-[1fr_460px]">
        <DataTable caption="DV schedule" rows={list.data ?? []} rowKey={(r) => r.id} selectedKey={sel ?? undefined} onRowClick={(r) => { setSel(r.id); setItems(null); setRemarks(r.remarks ?? ''); }} empty="No DV scheduled" columns={[
          { key: 't', header: 'Slot', cell: (r) => `${r.date} ${r.slot}` }, { key: 'r', header: 'Roll no.', cell: (r) => <span className="tabular-nums">{r.rollNo}</span> },
          { key: 'n', header: 'Candidate', cell: (r) => r.name }, { key: 'c', header: 'Category', cell: (r) => r.category }, { key: 'a', header: 'Allotted', cell: (r) => r.allotment?.orgName ?? '-' }, { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
        ]} />
        {s && (
          <Card>
            <CardHeader title={s.name} description={`${s.otrId} · ${s.category} · ${s.allotment ? `${s.allotment.orgName} (${s.allotment.category} seat)` : ''}`} actions={<Link className="text-sm text-info underline" to={`/candidates/${s.candidateId}`}>Profile</Link>} />
            <CardBody className="space-y-3">
              {can('VERIFIER') && <Button size="sm" loading={busy} onClick={() => void run(async () => { await api.post(`/admin/dv/${s.id}/checks`); await list.refetch(); })}><Sparkles className="h-4 w-4" aria-hidden />Run discrepancy checks</Button>}
              {s.aiFindings?.items && (
                <div className="space-y-1">{s.aiFindings.items.length === 0 ? <Alert tone="success">No discrepancies found in the online record.</Alert> : s.aiFindings.items.map((f, i) => <Alert key={i} tone={f.severity === 'HIGH' ? 'danger' : f.severity === 'MEDIUM' ? 'warning' : 'info'}>{f.text}</Alert>)}
                  {s.aiFindings.note && <p className="text-sm text-ink-muted">{s.aiFindings.note}</p>}</div>
              )}
              <ul className="divide-y divide-border rounded border border-border">
                {checklist.map((c, i) => (
                  <li key={c.item} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>{c.item}</span>
                    <Select aria-label={`${c.item} status`} className="w-36" value={c.status} disabled={!can('VERIFIER')} onChange={(e) => setItems(checklist.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}>
                      {['PENDING', 'OK', 'MISMATCH', 'MISSING', 'NA'].map((o) => <option key={o} value={o}>{o === 'NA' ? 'Not applicable' : o.toLowerCase()}</option>)}
                    </Select>
                  </li>
                ))}
              </ul>
              <Textarea aria-label="Remarks" placeholder="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              {can('VERIFIER') && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void save('REPORTED')}>Reported</Button>
                  <Button size="sm" variant="primary" loading={busy} onClick={() => void save('VERIFIED')}>Verified</Button>
                  <Button size="sm" onClick={() => void save('DEFICIENT')}>Deficient</Button>
                  <Button size="sm" variant="danger" onClick={() => void save('ABSENT')}>Absent</Button>
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
