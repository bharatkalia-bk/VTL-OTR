import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Textarea } from '@vtl/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { LInput, StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';

interface Cand { stageCallId: string; rollNo: string | null; slotAt: string | null; status: string; name: string; photo: string | null; education: Array<{ level: string; name: string; year: number; board: string }>; myMarks: { marks: Record<string, number>; total: number; remarks: string | null } | null }
interface P { id: string; name: string; date: string; venue: string; criteria: Array<{ key: string; label: string; max: number }>; exam: { code: string; titleEn: string } | null; candidates: Cand[] }

export default function Panel() {
  const q = useQuery({ queryKey: ['panel-me'], queryFn: () => api.get<P[]>('/admin/panel/me') });
  const [sel, setSel] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');
  const [brief, setBrief] = useState<Record<string, string[]>>({});
  const { run, banner, busy } = useAction();
  if (q.data && !q.data.length) return <Alert tone="info" title="No panels yet">You will see your interview panels here once the exam administrator schedules them.</Alert>;
  return (
    <>
      <PageTitle title="Interview panel" description="Award marks independently. Category and community details are not shown to panels." />
      {banner}
      {q.data?.map((p) => {
        const total = p.criteria.reduce((a, b) => a + b.max, 0);
        return (
          <div key={p.id} className="mb-6">
            <h2 className="mb-2 font-heading text-lg font-bold">{p.name} · {p.exam?.code} · {fmt.d(p.date)} · {p.venue}</h2>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {p.candidates.map((c) => {
                const open = sel === c.stageCallId;
                return (
                  <Card key={c.stageCallId} className={open ? 'ring-2 ring-orange' : ''}>
                    <CardHeader title={c.name} description={`Roll ${c.rollNo} · ${c.slotAt ? new Date(c.slotAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : ''} IST`} actions={c.myMarks ? <Badge tone="success">{c.myMarks.total}/{total}</Badge> : <StatusBadge s={c.status} />} />
                    <CardBody className="space-y-3">
                      <div className="flex gap-3">
                        {c.photo && <img src={c.photo} alt={`Photograph of ${c.name}`} className="h-24 w-20 rounded object-cover" />}
                        <ul className="text-xs text-ink-muted">{c.education.map((e, i) => <li key={i}>{e.name} ({e.year}), {e.board}</li>)}</ul>
                      </div>
                      {brief[c.stageCallId] && <div className="rounded bg-surface p-2 text-xs">{brief[c.stageCallId]!.map((b, i) => <p key={i}>{b}</p>)}</div>}
                      {!open ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="primary" onClick={() => { setSel(c.stageCallId); setMarks(Object.fromEntries(Object.entries(c.myMarks?.marks ?? {}).map(([k, v]) => [k, String(v)]))); setRemarks(c.myMarks?.remarks ?? ''); }}>{c.myMarks ? 'Edit marks' : 'Award marks'}</Button>
                          <Button size="sm" onClick={() => void run(async () => { const r = await api.get<{ points: string[] }>(`/admin/panel/calls/${c.stageCallId}/brief`); setBrief({ ...brief, [c.stageCallId]: r.points }); })}><Sparkles className="h-4 w-4" aria-hidden />Brief</Button>
                          {!c.myMarks && <Button size="sm" variant="ghost" onClick={() => void run(async () => { await api.post(`/admin/panel/calls/${c.stageCallId}/absent`); await q.refetch(); }, 'Marked absent.')}>Absent</Button>}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {p.criteria.map((k) => <LInput key={k.key} label={`${k.label} (max ${k.max})`} type="number" min={0} max={k.max} value={marks[k.key] ?? ''} onChange={(e) => setMarks({ ...marks, [k.key]: e.target.value })} />)}
                          <Textarea aria-label="Remarks" placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                          <p className="text-sm font-semibold">Total {p.criteria.reduce((a, k) => a + (Number(marks[k.key]) || 0), 0)} / {total}</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="primary" loading={busy} onClick={() => void run(async () => { await api.post(`/admin/panel/calls/${c.stageCallId}/marks`, { marks: Object.fromEntries(p.criteria.map((k) => [k.key, Number(marks[k.key]) || 0])), remarks: remarks || undefined }); setSel(null); await q.refetch(); }, 'Marks submitted.')}>Submit</Button>
                            <Button size="sm" onClick={() => setSel(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
