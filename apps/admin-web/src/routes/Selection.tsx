import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, DataTable, Tabs } from '@vtl/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { LInput, LSelect, StatusBadge, useAction, useExamPicker } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Call { id: string; rollNo: string | null; name: string; category: string; stage: string; status: string; panel: string | null; slotAt: string | null; letterReleasedAt: string | null }
interface Panel { id: string; name: string; date: string; venue: string; members: Array<{ id: string; name: string }>; candidates: number; criteria: Array<{ key: string; label: string; max: number }> }
interface Vac { id: string; postId: string; postTitle: string; orgCode: string; orgName: string; category: string; count: number; filled: number }
interface Allot { id: string; name: string; applicationNo: string; orgName: string; category: string; meritRank: number; prefNo: number; round: number; status: string }
interface Staff { id: string; name: string }
interface ExamFull { posts: Array<{ id: string; titleEn: string }> }
const CATS = ['GEN', 'EWS', 'OBC_NCL', 'SC', 'ST'];

export default function Selection() {
  const { can } = useAuth();
  const admin = can('EXAM_ADMIN');
  const { exam, examId, picker } = useExamPicker();
  const [tab, setTab] = useState<'shortlist' | 'panels' | 'vacancies' | 'allotment'>('shortlist');
  const { run, banner, busy } = useAction();
  const later = (exam?.stages ?? []).filter((s) => s !== 'TIER1');
  const [stage, setStage] = useState('INTERVIEW');
  const calls = useQuery({ queryKey: ['calls', examId, stage], queryFn: () => api.get<Call[]>(`/admin/exams/${examId}/stage-calls?stage=${stage}`), enabled: !!examId && tab === 'shortlist' });
  const panels = useQuery({ queryKey: ['panels', examId], queryFn: () => api.get<Panel[]>(`/admin/exams/${examId}/panels`), enabled: !!examId && tab === 'panels' });
  const staff = useQuery({ queryKey: ['staff', 'INTERVIEW_PANEL'], queryFn: () => api.get<Staff[]>('/admin/staff?role=INTERVIEW_PANEL'), enabled: tab === 'panels' });
  const vac = useQuery({ queryKey: ['vac', examId], queryFn: () => api.get<Vac[]>(`/admin/exams/${examId}/vacancies`), enabled: !!examId && (tab === 'vacancies' || tab === 'allotment') });
  const allot = useQuery({ queryKey: ['allot', examId], queryFn: () => api.get<Allot[]>(`/admin/exams/${examId}/allotments`), enabled: !!examId && tab === 'allotment' });
  const full = useQuery({ queryKey: ['exam', examId], queryFn: () => api.get<ExamFull>(`/admin/exams/${examId}`), enabled: !!examId && tab === 'vacancies' });
  const [mult, setMult] = useState('3');
  const [pf, setPf] = useState({ name: '', date: '', venue: '', members: [] as string[] });
  const [rows, setRows] = useState<Array<{ postId: string; orgCode: string; orgName: string; category: string; count: string }> | null>(null);
  const [dv, setDv] = useState({ date: '', venue: '', slots: '10:00,12:00,14:30', perSlot: '20' });
  const vrows = rows ?? (vac.data ?? []).map((v) => ({ postId: v.postId, orgCode: v.orgCode, orgName: v.orgName, category: v.category, count: String(v.count) }));

  return (
    <>
      <PageTitle title="Interviews & allotment" description={`Stages: ${(exam?.stages ?? []).join(' → ')} · final merit then preference-based allotment and DV`} actions={picker} />
      {banner}
      <Tabs label="Selection sections" value={tab} onChange={setTab} tabs={[{ value: 'shortlist', label: 'Shortlist & call letters' }, { value: 'panels', label: 'Interview panels' }, { value: 'vacancies', label: 'Vacancies' }, { value: 'allotment', label: 'Allotment & DV' }]} />
      <div className="mt-4 space-y-4">
        {tab === 'shortlist' && (
          <>
            {admin && later.length > 0 && (
              <Card><CardHeader title="Shortlist for next stage" description="Unreserved list on merit first, then each category list, up to seats × multiplier. Needs the previous stage's result published." />
                <CardBody className="flex flex-wrap items-end gap-3">
                  <LSelect label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>{later.map((s) => <option key={s}>{s}</option>)}</LSelect>
                  <div className="w-36"><LInput label="Multiplier" type="number" step="0.5" min={1} value={mult} onChange={(e) => setMult(e.target.value)} /></div>
                  <Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.post(`/admin/exams/${examId}/shortlist`, { toStage: stage, multiplier: Number(mult) }); await calls.refetch(); }, 'Shortlisted.')}>Shortlist</Button>
                  <Button loading={busy} onClick={() => void run(async () => { await api.post(`/admin/exams/${examId}/stage-calls/${stage}/release`); await calls.refetch(); }, 'Call letters released; candidates notified.')}>Release call letters</Button>
                </CardBody>
              </Card>
            )}
            {later.length === 0 && <p className="text-sm text-ink-muted">This exam has a single written stage. Final merit is computed from it directly on the Results page.</p>}
            <DataTable caption="Shortlisted candidates" rows={calls.data ?? []} rowKey={(r) => r.id} empty="Nobody shortlisted yet" columns={[
              { key: 'r', header: 'Roll no.', cell: (r) => <span className="tabular-nums">{r.rollNo}</span> }, { key: 'n', header: 'Name', cell: (r) => r.name }, { key: 'c', header: 'Category', cell: (r) => r.category },
              { key: 'p', header: 'Panel / slot', cell: (r) => r.panel ? `${r.panel} · ${fmt.dt(r.slotAt)}` : '-' }, { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
              { key: 'l', header: 'Letter', cell: (r) => (r.letterReleasedAt ? fmt.d(r.letterReleasedAt) : '-') },
            ]} />
          </>
        )}

        {tab === 'panels' && (
          <>
            {admin && (
              <Card><CardHeader title="New interview panel" description="Panel members see only their candidates' name, photo and education, never category." />
                <CardBody className="grid gap-3 md:grid-cols-3">
                  <LInput label="Panel name" value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} placeholder="Panel A" />
                  <LInput label="Date" type="date" value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} />
                  <LInput label="Venue" value={pf.venue} onChange={(e) => setPf({ ...pf, venue: e.target.value })} />
                  <fieldset className="md:col-span-3"><legend className="text-sm font-medium">Members</legend><div className="mt-1 flex flex-wrap gap-3">{staff.data?.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pf.members.includes(s.id)} onChange={(e) => setPf({ ...pf, members: e.target.checked ? [...pf.members, s.id] : pf.members.filter((m) => m !== s.id) })} />{s.name}</label>)}</div></fieldset>
                  <div className="flex gap-2 md:col-span-3">
                    <Button variant="primary" loading={busy} disabled={!pf.name || !pf.date || !pf.venue || !pf.members.length} onClick={() => void run(async () => { await api.post(`/admin/exams/${examId}/panels`, { name: pf.name, date: pf.date, venue: pf.venue, memberIds: pf.members, criteria: [{ key: 'knowledge', label: 'Subject knowledge', max: 40 }, { key: 'communication', label: 'Communication', max: 30 }, { key: 'personality', label: 'Personality & aptitude', max: 30 }] }); await panels.refetch(); }, 'Panel created (criteria: knowledge 40, communication 30, personality 30).')}>Create panel</Button>
                    <Button loading={busy} onClick={() => void run(async () => { await api.post(`/admin/exams/${examId}/panels/schedule`); await panels.refetch(); }, 'Interview slots assigned (20 minutes each, from 09:30 IST).')}>Schedule interviews</Button>
                  </div>
                </CardBody>
              </Card>
            )}
            <DataTable caption="Panels" rows={panels.data ?? []} rowKey={(r) => r.id} empty="No panels" columns={[
              { key: 'n', header: 'Panel', cell: (r) => <span className="font-semibold">{r.name}</span> }, { key: 'd', header: 'Date', cell: (r) => fmt.d(r.date) }, { key: 'v', header: 'Venue', cell: (r) => r.venue },
              { key: 'm', header: 'Members', cell: (r) => r.members.map((m) => m.name).join(', ') }, { key: 'c', header: 'Candidates', numeric: true, cell: (r) => r.candidates },
              { key: 'k', header: 'Criteria', cell: (r) => <span className="text-xs">{r.criteria.map((c) => `${c.label} /${c.max}`).join(' · ')}</span> },
            ]} />
          </>
        )}

        {tab === 'vacancies' && (
          <Card><CardHeader title="Vacancies by organisation and category" description="Used for shortlisting multipliers and for allotment." actions={admin && <Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.put(`/admin/exams/${examId}/vacancies`, { rows: vrows.map((r) => ({ ...r, count: Number(r.count) })) }); setRows(null); await vac.refetch(); }, 'Vacancies saved.')}>Save</Button>} />
            <CardBody className="space-y-2">
              {vrows.map((r, i) => (
                <div key={i} className="grid items-end gap-2 md:grid-cols-[2fr_1fr_2fr_1fr_1fr_auto]">
                  <LSelect label="Post" value={r.postId} onChange={(e) => setRows(vrows.map((x, j) => (j === i ? { ...x, postId: e.target.value } : x)))}><option value="">Choose</option>{full.data?.posts.map((p) => <option key={p.id} value={p.id}>{p.titleEn}</option>)}</LSelect>
                  <LInput label="Org code" value={r.orgCode} onChange={(e) => setRows(vrows.map((x, j) => (j === i ? { ...x, orgCode: e.target.value.toUpperCase() } : x)))} />
                  <LInput label="Organisation" value={r.orgName} onChange={(e) => setRows(vrows.map((x, j) => (j === i ? { ...x, orgName: e.target.value } : x)))} />
                  <LSelect label="Category" value={r.category} onChange={(e) => setRows(vrows.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}>{CATS.map((c) => <option key={c}>{c}</option>)}</LSelect>
                  <LInput label="Seats" type="number" min={0} value={r.count} onChange={(e) => setRows(vrows.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} />
                  <Button size="icon" variant="ghost" aria-label="Remove row" onClick={() => setRows(vrows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {admin && <Button size="sm" onClick={() => setRows([...vrows, { postId: full.data?.posts[0]?.id ?? '', orgCode: '', orgName: '', category: 'GEN', count: '1' }])}><Plus className="h-4 w-4" aria-hidden />Add row</Button>}
            </CardBody>
          </Card>
        )}

        {tab === 'allotment' && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader title="Allotment" description="Merit-cum-preference. Each run keeps accepted seats and refills declined ones." />
                <CardBody className="space-y-2 text-sm">
                  <p>{vac.data?.reduce((a, b) => a + b.count, 0) ?? 0} seats · {vac.data?.reduce((a, b) => a + b.filled, 0) ?? 0} filled</p>
                  {admin && <Button variant="primary" loading={busy} onClick={() => void run(async () => { const r = await api.post<{ round: number; allotted: number; unallotted: number }>(`/admin/exams/${examId}/allotment/run`); await Promise.all([allot.refetch(), vac.refetch()]); return r; }, 'Allotment round complete; candidates notified.')}>Run allotment round</Button>}
                </CardBody>
              </Card>
              {admin && (
                <Card><CardHeader title="Schedule document verification" description="Candidates who accepted their allotment get a DV slot and call letter." />
                  <CardBody className="grid gap-2 sm:grid-cols-2">
                    <LInput label="Date" type="date" value={dv.date} onChange={(e) => setDv({ ...dv, date: e.target.value })} />
                    <LInput label="Candidates per slot" type="number" value={dv.perSlot} onChange={(e) => setDv({ ...dv, perSlot: e.target.value })} />
                    <LInput label="Venue" value={dv.venue} onChange={(e) => setDv({ ...dv, venue: e.target.value })} />
                    <LInput label="Slots (comma separated)" value={dv.slots} onChange={(e) => setDv({ ...dv, slots: e.target.value })} />
                    <div><Button loading={busy} disabled={!dv.date || dv.venue.length < 3} onClick={() => void run(() => api.post(`/admin/exams/${examId}/dv/schedule`, { date: dv.date, venue: dv.venue, slots: dv.slots.split(',').map((s) => s.trim()).filter(Boolean), perSlot: Number(dv.perSlot) }), 'DV scheduled.')}>Schedule DV</Button></div>
                  </CardBody>
                </Card>
              )}
            </div>
            <DataTable caption="Allotments" rows={allot.data ?? []} rowKey={(r) => r.id} empty="No allotment yet" columns={[
              { key: 'r', header: 'Merit rank', numeric: true, cell: (r) => r.meritRank }, { key: 'n', header: 'Candidate', cell: (r) => <div><p>{r.name}</p><p className="text-xs text-ink-muted tabular-nums">{r.applicationNo}</p></div> },
              { key: 'o', header: 'Allotted', cell: (r) => r.orgName }, { key: 'c', header: 'Seat', cell: (r) => r.category }, { key: 'p', header: 'Preference', numeric: true, cell: (r) => r.prefNo },
              { key: 'rd', header: 'Round', numeric: true, cell: (r) => r.round }, { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
            ]} />
          </>
        )}
      </div>
    </>
  );
}
