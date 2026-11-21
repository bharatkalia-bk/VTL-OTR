import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, DataTable, Tabs, Textarea } from '@vtl/ui';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LInput, StatusBadge, readText, useAction, useExamPicker } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Run { id: string; stage: string; status: string; cutoffs: Record<string, number>; stats: { candidates?: number; qualified?: number; withheld?: number; baseShift?: string; shifts?: Record<string, { n: number; mean: number; max: number; min: number }>; byCategory?: Record<string, { n: number; qualified: number; lastQualified: number | null }> }; anomalies: Array<{ type: string; severity: string; subject: string; detail: string; ids?: string[] }>; computedBy: string | null; approvedBy: string | null; computedAt: string | null; rejectNote: string | null; publishedAt: string | null }
interface Row { id: string; rollNo: string | null; name: string; category: string; raw: number; normalised: number | null; percentile: number | null; correct: number; wrong: number; rank: number | null; categoryRank: number | null; qualified: boolean; withheld: boolean; sectionScores: Record<string, unknown> }
const CATS = ['GEN', 'EWS', 'OBC_NCL', 'SC', 'ST', 'PWD'];

export default function Results() {
  const { can } = useAuth();
  const admin = can('EXAM_ADMIN');
  const { exam, examId, picker } = useExamPicker();
  const stages = [...(exam?.stages ?? ['TIER1']), 'FINAL'];
  const [stage, setStage] = useState('TIER1');
  const { run, banner, busy } = useAction();
  const q = useQuery({ queryKey: ['result', examId, stage], queryFn: () => api.get<{ run: Run | null; rows: Row[] }>(`/admin/exams/${examId}/result-runs/${stage}`), enabled: !!examId });
  const [cut, setCut] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const r = q.data?.run;
  const act = (path: string, body: object, msg: string) => run(async () => { await api.post(`/admin/exams/${examId}/result-runs${path}`, body); await q.refetch(); }, msg);
  const cutoffs = Object.fromEntries(Object.entries(cut).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]));

  return (
    <>
      <PageTitle title="Results" description="Scoring with negative marking, normalisation across shifts, cut-offs, maker-checker approval" actions={picker} />
      {banner}
      <Tabs label="Stage" value={stage} onChange={setStage} tabs={stages.map((s) => ({ value: s, label: s === 'FINAL' ? 'Final merit' : s }))} />
      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Run" actions={r ? <StatusBadge s={r.status} /> : <Badge>Not computed</Badge>} />
            <CardBody className="space-y-3 text-sm">
              {r && <dl className="space-y-1"><div>Computed by <strong>{r.computedBy ?? '-'}</strong> · {fmt.dt(r.computedAt)}</div>{r.approvedBy && <div>Approved by <strong>{r.approvedBy}</strong></div>}{r.publishedAt && <div>Published {fmt.dt(r.publishedAt)}</div>}</dl>}
              {r?.rejectNote && <Alert tone="warning" title="Returned for correction">{r.rejectNote}</Alert>}
              {admin && (!r || r.status === 'DRAFT') && (
                <>
                  <p className="font-medium">Cut-offs ({stage === 'TIER1' ? 'normalised score' : 'score'}), optional</p>
                  <div className="grid grid-cols-3 gap-2">{CATS.map((c) => <LInput key={c} label={c.replace('_NCL', '')} type="number" value={cut[c] ?? String(r?.cutoffs?.[c] ?? '')} onChange={(e) => setCut({ ...cut, [c]: e.target.value })} />)}</div>
                  {stage === 'TIER2' && (
                    <label className="block text-sm">Upload Tier 2 marks (CSV: rollNo,marks)
                      <input type="file" accept=".csv,text/csv" className="mt-1 block text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(async () => { await api.post(`/admin/exams/${examId}/stage-marks/TIER2`, { csv: await readText(f) }); }, 'Marks uploaded.'); }} />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" loading={busy} onClick={() => void act('', { stage, cutoffs }, 'Computed. Review the rows and anomalies, then send for approval.')}>{r ? 'Recompute' : 'Compute'}</Button>
                    {r && <Button loading={busy} onClick={() => void act(`/${stage}/submit`, {}, 'Sent for approval to a second officer.')}>Send for approval</Button>}
                  </div>
                </>
              )}
              {admin && r?.status === 'PENDING_APPROVAL' && (
                <>
                  <Alert tone="info">A different officer from the one who computed must approve (maker-checker).</Alert>
                  <Textarea aria-label="Note" placeholder="Note if returning" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="flex gap-2"><Button variant="primary" loading={busy} onClick={() => void act(`/${stage}/decision`, { approve: true }, 'Approved.')}>Approve</Button><Button loading={busy} onClick={() => void act(`/${stage}/decision`, { approve: false, note }, 'Returned.')}>Return</Button></div>
                </>
              )}
              {admin && r?.status === 'APPROVED' && <Button variant="primary" loading={busy} onClick={() => void act(`/${stage}/publish`, {}, 'Published. Candidates are notified and can see score cards.')}>Publish result</Button>}
            </CardBody>
          </Card>
          {r && (
            <Card><CardHeader title="Statistics" /><CardBody className="space-y-2 text-sm">
              <p>{fmt.n(r.stats.candidates ?? 0)} candidates · {fmt.n(r.stats.qualified ?? 0)} qualified · {fmt.n(r.stats.withheld ?? 0)} withheld</p>
              {r.stats.shifts && <div><p className="font-medium">Shifts (base for normalisation highlighted)</p>{Object.entries(r.stats.shifts).map(([id, s]) => <p key={id} className={id === r.stats.baseShift ? 'font-semibold text-orange-700' : ''}>{id.slice(0, 8)}: n {s.n}, mean {s.mean}, range {s.min} to {s.max}</p>)}</div>}
              {r.stats.byCategory && Object.entries(r.stats.byCategory).map(([c, s]) => <p key={c}>{c}: {s.qualified}/{s.n} qualified{s.lastQualified !== null && `, lowest qualifying ${s.lastQualified}`}</p>)}
            </CardBody></Card>
          )}
          {r && r.anomalies.length > 0 && (
            <Card><CardHeader title="Integrity flags" description="Screening signals for review, not findings" /><CardBody className="space-y-2">
              {r.anomalies.map((a, i) => (
                <div key={i} className="rounded border border-warning/40 bg-warning-50 p-2 text-sm">
                  <p className="flex items-center gap-1 font-semibold text-warning-700"><AlertTriangle className="h-4 w-4" aria-hidden />{a.type.replace(/_/g, ' ').toLowerCase()} · {a.severity}</p>
                  <p>{a.subject}: {a.detail}</p>{a.ids && <p className="text-xs tabular-nums">Roll nos: {a.ids.join(', ')}</p>}
                </div>
              ))}
              <Link to="/debarments" className="text-sm text-info underline">Propose debarment</Link>
            </CardBody></Card>
          )}
        </div>
        <DataTable caption="Result rows" rows={q.data?.rows ?? []} rowKey={(x) => x.id} empty="Compute the result to see rows" columns={[
          { key: 'rk', header: 'Rank', numeric: true, cell: (x) => x.rank ?? '-' }, { key: 'r', header: 'Roll no.', cell: (x) => <span className="tabular-nums">{x.rollNo}</span> },
          { key: 'n', header: 'Name', cell: (x) => x.name }, { key: 'c', header: 'Category', cell: (x) => `${x.category} #${x.categoryRank ?? '-'}` },
          { key: 'raw', header: 'Raw', numeric: true, cell: (x) => x.raw }, { key: 'nm', header: stage === 'FINAL' ? 'Final' : 'Normalised', numeric: true, cell: (x) => x.normalised ?? '-' },
          { key: 'p', header: 'Percentile', numeric: true, cell: (x) => (x.percentile === null ? '-' : x.percentile.toFixed(2)) },
          { key: 'cw', header: 'C / W', numeric: true, cell: (x) => (stage === 'TIER1' ? `${x.correct} / ${x.wrong}` : '-') },
          { key: 's', header: 'Status', cell: (x) => <StatusBadge s={x.withheld ? 'WITHHELD' : x.qualified ? 'QUALIFIED' : 'NOT_QUALIFIED'} /> },
        ]} />
      </div>
    </>
  );
}
