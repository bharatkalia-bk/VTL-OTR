import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, DataTable, EmptyState, Tabs } from '@vtl/ui';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { LInput, LSelect, ReasonDialog, StatusBadge, useAction, useExamPicker } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Shift { id: string; code: string; stage: string; date: string; startTime: string; endTime: string; mode: string; _count: { admitCards: number } }
interface ExamFull { centreCities: Array<{ cityName: string; centres: Array<{ id: string; code: string; name: string }> }> }
interface Staff { id: string; name: string; email: string; scope: { homeDistrict?: string } }
interface Assignment { id: string; coiStatus: string; coiNote: string | null; autoCoiFlags: Array<{ code: string; detail: string }>; observer: { name: string } | null; centre: { name: string; code: string } | null; reports: Array<{ id: string; kind: string; severity: string; payload: Record<string, unknown>; capturedAt: string }> }
interface Alert { id: string; rollNo: string; kind: string; score: number | null; source: string; status: string; centre: string | null; details: { note?: string }; createdAt: string }
interface Exc { id: string; kind: string; minutesLost: number; description: string; rollNos: string[]; status: string; reportedVia: string; resolution: string | null; createdAt: string }

export default function ExamDay() {
  const { can } = useAuth();
  const { examId, picker } = useExamPicker();
  const [tab, setTab] = useState<'shifts' | 'observers' | 'alerts' | 'exceptions'>('shifts');
  const { run, banner, busy } = useAction();
  const shifts = useQuery({ queryKey: ['shifts', examId], queryFn: () => api.get<Shift[]>(`/admin/exams/${examId}/shifts`), enabled: !!examId });
  const exam = useQuery({ queryKey: ['exam', examId], queryFn: () => api.get<ExamFull>(`/admin/exams/${examId}`), enabled: !!examId });
  const observers = useQuery({ queryKey: ['observers', examId], queryFn: () => api.get<Assignment[]>(`/admin/exams/${examId}/observers`), enabled: !!examId && tab === 'observers' });
  const staff = useQuery({ queryKey: ['staff', 'OBSERVER'], queryFn: () => api.get<Staff[]>('/admin/staff?role=OBSERVER'), enabled: tab === 'observers' });
  const alerts = useQuery({ queryKey: ['alerts', examId], queryFn: () => api.get<Alert[]>(`/admin/biometric-alerts?examId=${examId}`), enabled: !!examId && tab === 'alerts' });
  const exc = useQuery({ queryKey: ['exc', examId], queryFn: () => api.get<Exc[]>(`/admin/tech-exceptions?examId=${examId}`), enabled: !!examId && tab === 'exceptions' });
  const [sf, setSf] = useState({ code: '', date: '', startTime: '09:00', endTime: '11:00', mode: 'CBT', stage: 'TIER1' });
  const [of, setOf] = useState({ observerId: '', centreId: '' });
  const [review, setReview] = useState<{ id: string; decision: 'CLEARED' | 'CONFIRMED' } | null>(null);
  const [decide, setDecide] = useState<{ id: string; status: 'COMPENSATED' | 'RE_EXAM' | 'REJECTED' } | null>(null);
  const [comp, setComp] = useState('0');
  const [waive, setWaive] = useState<string | null>(null);
  const centres = exam.data?.centreCities.flatMap((c) => c.centres.map((x) => ({ ...x, city: c.cityName }))) ?? [];
  const admin = can('EXAM_ADMIN');

  return (
    <>
      <PageTitle title="Exam day" description="Shifts, observers, biometric alerts and technical exceptions" actions={picker} />
      {banner}
      <Tabs label="Exam day sections" value={tab} onChange={setTab} tabs={[{ value: 'shifts', label: 'Shifts' }, { value: 'observers', label: 'Observers' }, { value: 'alerts', label: 'Biometric alerts' }, { value: 'exceptions', label: 'Technical exceptions' }]} />
      <div className="mt-4 space-y-4">
        {tab === 'shifts' && (
          <>
            {admin && (
              <Card><CardHeader title="Add shift" description="Each shift has its own paper and answer key; scores are normalised across shifts." />
                <CardBody className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <LInput label="Code" value={sf.code} onChange={(e) => setSf({ ...sf, code: e.target.value.toUpperCase() })} placeholder="S1" />
                  <LInput label="Date" type="date" value={sf.date} onChange={(e) => setSf({ ...sf, date: e.target.value })} />
                  <LInput label="Start" type="time" value={sf.startTime} onChange={(e) => setSf({ ...sf, startTime: e.target.value })} />
                  <LInput label="End" type="time" value={sf.endTime} onChange={(e) => setSf({ ...sf, endTime: e.target.value })} />
                  <LSelect label="Mode" value={sf.mode} onChange={(e) => setSf({ ...sf, mode: e.target.value })}><option value="CBT">Computer based</option><option value="OMR">OMR (pen and paper)</option></LSelect>
                  <LSelect label="Stage" value={sf.stage} onChange={(e) => setSf({ ...sf, stage: e.target.value })}><option>TIER1</option><option>TIER2</option></LSelect>
                  <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
                    <Button variant="primary" loading={busy} disabled={!sf.code || !sf.date} onClick={() => void run(async () => { await api.post(`/admin/exams/${examId}/shifts`, sf); await shifts.refetch(); }, 'Shift added.')}>Add shift</Button>
                    <Button loading={busy} onClick={() => void run(async () => { const r = await api.post<{ assigned: number; shifts: number }>(`/admin/exams/${examId}/shifts/assign`, {}); await shifts.refetch(); return r; }, 'Candidates spread across shifts. Regenerate admit cards so they show the shift.')}>Assign candidates to shifts</Button>
                  </div>
                </CardBody>
              </Card>
            )}
            <DataTable caption="Shifts" rows={shifts.data ?? []} rowKey={(r) => r.id} empty={<EmptyState icon={<CalendarClock />} title="No shifts yet" />} columns={[
              { key: 'c', header: 'Shift', cell: (r) => <span className="font-semibold">{r.code}</span> }, { key: 's', header: 'Stage', cell: (r) => r.stage },
              { key: 'd', header: 'Date', cell: (r) => fmt.d(r.date) }, { key: 't', header: 'Time (IST)', cell: (r) => `${r.startTime} to ${r.endTime}` },
              { key: 'm', header: 'Mode', cell: (r) => <StatusBadge s={r.mode} /> }, { key: 'n', header: 'Candidates', numeric: true, cell: (r) => fmt.n(r._count.admitCards) },
            ]} />
          </>
        )}

        {tab === 'observers' && (
          <>
            {admin && (
              <Card><CardHeader title="Assign observer" description="Conflict of interest is screened automatically (home district, shared surnames), then the observer must declare before reporting." />
                <CardBody className="grid gap-3 sm:grid-cols-3">
                  <LSelect label="Observer" value={of.observerId} onChange={(e) => setOf({ ...of, observerId: e.target.value })}><option value="">Choose</option>{staff.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}</LSelect>
                  <LSelect label="Centre" value={of.centreId} onChange={(e) => setOf({ ...of, centreId: e.target.value })}><option value="">Choose</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}, {c.city}</option>)}</LSelect>
                  <div className="flex items-end"><Button variant="primary" loading={busy} disabled={!of.observerId || !of.centreId} onClick={() => void run(async () => { await api.post(`/admin/exams/${examId}/observers`, of); await observers.refetch(); }, 'Observer assigned.')}>Assign</Button></div>
                </CardBody>
              </Card>
            )}
            <DataTable caption="Observer assignments" rows={observers.data ?? []} rowKey={(r) => r.id} empty="No observers assigned" columns={[
              { key: 'o', header: 'Observer', cell: (r) => r.observer?.name ?? '-' }, { key: 'c', header: 'Centre', cell: (r) => r.centre ? `${r.centre.code} · ${r.centre.name}` : '-' },
              { key: 'coi', header: 'Conflict of interest', cell: (r) => <div className="space-y-1"><StatusBadge s={r.coiStatus} />{r.autoCoiFlags.map((f) => <p key={f.code} className="text-xs text-warning-700">{f.detail}</p>)}{r.coiNote && <p className="text-xs text-ink-muted">{r.coiNote}</p>}</div> },
              { key: 'r', header: 'Reports', cell: (r) => r.reports.length ? <ul className="space-y-1 text-xs">{r.reports.slice(0, 4).map((x) => <li key={x.id}><StatusBadge s={x.severity === 'HIGH' ? 'HIGH' : x.kind} /> {fmt.dt(x.capturedAt)} {String(x.payload.text ?? x.payload.summary ?? '')}</li>)}</ul> : <span className="text-xs text-ink-muted">None yet</span> },
              { key: 'a', header: '', cell: (r) => admin && <div className="flex gap-1">{r.coiStatus === 'CONFLICT' && <Button size="sm" onClick={() => setWaive(r.id)}>Waive</Button>}<Button size="sm" variant="ghost" onClick={() => void run(async () => { await api.del(`/admin/observer-assignments/${r.id}`); await observers.refetch(); }, 'Removed.')}>Remove</Button></div> },
            ]} />
          </>
        )}

        {tab === 'alerts' && (
          <DataTable caption="Biometric alerts" rows={alerts.data ?? []} rowKey={(r) => r.id} empty="No biometric alerts" columns={[
            { key: 'r', header: 'Roll no.', cell: (r) => <span className="tabular-nums">{r.rollNo}</span> }, { key: 'k', header: 'Alert', cell: (r) => r.kind.replace(/_/g, ' ').toLowerCase() },
            { key: 's', header: 'Match score', numeric: true, cell: (r) => (r.score === null ? '-' : r.score.toFixed(2)) }, { key: 'c', header: 'Centre', cell: (r) => r.centre ?? '-' },
            { key: 'src', header: 'Source', cell: (r) => r.source }, { key: 'st', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> }, { key: 'at', header: 'Raised', cell: (r) => <span className="text-xs">{fmt.dt(r.createdAt)}</span> },
            { key: 'a', header: '', cell: (r) => admin && r.status === 'OPEN' && <div className="flex gap-1"><Button size="sm" onClick={() => setReview({ id: r.id, decision: 'CLEARED' })}>Clear</Button><Button size="sm" variant="danger" onClick={() => setReview({ id: r.id, decision: 'CONFIRMED' })}>Confirm</Button></div> },
          ]} />
        )}

        {tab === 'exceptions' && (
          <DataTable caption="Technical exceptions" rows={exc.data ?? []} rowKey={(r) => r.id} empty="No technical exceptions" columns={[
            { key: 'k', header: 'Type', cell: (r) => r.kind.replace(/_/g, ' ').toLowerCase() }, { key: 'm', header: 'Minutes lost', numeric: true, cell: (r) => r.minutesLost },
            { key: 'd', header: 'Description', cell: (r) => <div><p>{r.description}</p><p className="text-xs text-ink-muted">{r.rollNos.length} candidate(s) · via {r.reportedVia.toLowerCase()} · {fmt.dt(r.createdAt)}</p>{r.resolution && <p className="text-xs">Resolution: {r.resolution}</p>}</div> },
            { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
            { key: 'a', header: '', cell: (r) => admin && r.status === 'OPEN' && <div className="flex flex-wrap gap-1"><Button size="sm" onClick={() => setDecide({ id: r.id, status: 'COMPENSATED' })}>Compensate</Button><Button size="sm" onClick={() => setDecide({ id: r.id, status: 'RE_EXAM' })}>Re-exam</Button><Button size="sm" variant="ghost" onClick={() => setDecide({ id: r.id, status: 'REJECTED' })}>Reject</Button></div> },
          ]} />
        )}
      </div>
      <ReasonDialog open={!!review} title={review?.decision === 'CONFIRMED' ? 'Confirm impersonation / mismatch' : 'Clear alert'} label="Review note" onClose={() => setReview(null)}
        onSubmit={(note) => run(async () => { await api.post(`/admin/biometric-alerts/${review!.id}/review`, { decision: review!.decision, note }); await alerts.refetch(); }, 'Alert reviewed. Confirmed alerts withhold the result.')} />
      <ReasonDialog open={!!waive} title="Waive conflict of interest" onClose={() => setWaive(null)} onSubmit={(reason) => run(async () => { await api.post(`/admin/observer-assignments/${waive}/waive`, { reason }); await observers.refetch(); }, 'Waived.')} />
      <ReasonDialog open={!!decide} title={`Decision: ${decide?.status.replace('_', ' ').toLowerCase()}`} label="Resolution" onClose={() => setDecide(null)}
        onSubmit={(resolution) => run(async () => { await api.post(`/admin/tech-exceptions/${decide!.id}/decision`, { status: decide!.status, resolution, ...(decide!.status === 'COMPENSATED' && { compensationMinutes: Number(comp) || 0 }) }); await exc.refetch(); }, 'Decision recorded.')}>
        {decide?.status === 'COMPENSATED' && <LInput label="Compensatory minutes" type="number" min={0} value={comp} onChange={(e) => setComp(e.target.value)} />}
      </ReasonDialog>
    </>
  );
}
