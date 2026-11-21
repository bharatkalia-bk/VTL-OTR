import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, Textarea } from '@vtl/ui';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { LInput, LSelect, StatusBadge, useAction, useExamPicker } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Paper { id: string; questionCount: number; marksCorrect: number; marksWrong: number; provisionalKey: Record<string, string[]> | null; provisionalPublishedAt: string | null; objectionDeadline: string | null; finalPublishedAt: string | null; dropped: number[]; changes: Array<{ qno: number; to: string[] | 'DROP'; reason: string }> }
interface Row { shift: { id: string; code: string; date: string; mode: string }; paper: Paper | null; responseSheets: number; objections: Record<string, number> }
interface Review { provider: string; stats: { difficulty: number; discrimination: number; topChoice: string | null; topChoiceShare: number; distribution: Record<string, number> }; claims: Record<string, number>; signals: string[]; recommendation: string; summary: string }
interface Group { paperId: string; shift: string; qno: number; key: string[]; count: number; claims: Record<string, number>; statuses: Record<string, number>; aiReview: Review | null; samples: string[] }

const keyText = (k: Record<string, string[]> | null, n: number) => Array.from({ length: n }, (_, i) => k?.[String(i + 1)]?.join('/') ?? '').join(',');
const parseKey = (t: string) => Object.fromEntries(t.split(/[,\s]+/).filter(Boolean).map((v, i) => [String(i + 1), v.toUpperCase().split('/')]));

export default function AnswerKeys() {
  const { can } = useAuth();
  const admin = can('EXAM_ADMIN');
  const { examId, picker } = useExamPicker();
  const { run, banner, busy } = useAction();
  const papers = useQuery({ queryKey: ['papers', examId], queryFn: () => api.get<Row[]>(`/admin/exams/${examId}/papers`), enabled: !!examId });
  const groups = useQuery({ queryKey: ['objections', examId], queryFn: () => api.get<Group[]>(`/admin/exams/${examId}/objections`), enabled: !!examId });
  const [scheme, setScheme] = useState<Record<string, { questionCount: string; marksCorrect: string; marksWrong: string }>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [days, setDays] = useState('3');
  const [decide, setDecide] = useState<Group | null>(null);
  const [dec, setDec] = useState({ decision: 'REJECT', newOptions: '', note: '' });
  const refresh = () => Promise.all([papers.refetch(), groups.refetch()]);

  return (
    <>
      <PageTitle title="Answer keys & objections" description="Paper schemes, provisional key, candidate objections with pre-review, final key" actions={picker} />
      {banner}
      <div className="grid gap-4 xl:grid-cols-2">
        {papers.data?.map((r) => {
          const p = r.paper;
          const s = scheme[r.shift.id] ?? { questionCount: String(p?.questionCount ?? 100), marksCorrect: String(p?.marksCorrect ?? 2), marksWrong: String(p?.marksWrong ?? 0.5) };
          const windowOpen = !!p?.objectionDeadline && new Date(p.objectionDeadline) > new Date() && !p.finalPublishedAt;
          return (
            <Card key={r.shift.id}>
              <CardHeader title={`Shift ${r.shift.code} · ${fmt.d(r.shift.date)}`} description={`${r.shift.mode} · ${r.responseSheets} response sheets received`}
                actions={p?.finalPublishedAt ? <Badge tone="success">Final key published</Badge> : p?.provisionalPublishedAt ? <Badge tone="warning">{windowOpen ? `Objections until ${fmt.dt(p.objectionDeadline)}` : 'Objection window closed'}</Badge> : <Badge>No key yet</Badge>} />
              <CardBody className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <LInput label="Questions" type="number" value={s.questionCount} disabled={!!p?.provisionalPublishedAt} onChange={(e) => setScheme({ ...scheme, [r.shift.id]: { ...s, questionCount: e.target.value } })} />
                  <LInput label="Marks per correct" type="number" step="0.25" value={s.marksCorrect} disabled={!!p?.provisionalPublishedAt} onChange={(e) => setScheme({ ...scheme, [r.shift.id]: { ...s, marksCorrect: e.target.value } })} />
                  <LInput label="Negative per wrong" type="number" step="0.25" value={s.marksWrong} disabled={!!p?.provisionalPublishedAt} onChange={(e) => setScheme({ ...scheme, [r.shift.id]: { ...s, marksWrong: e.target.value } })} />
                </div>
                {admin && !p?.provisionalPublishedAt && <Button size="sm" loading={busy} onClick={() => void run(async () => { await api.put(`/admin/shifts/${r.shift.id}/paper`, { questionCount: Number(s.questionCount), marksCorrect: Number(s.marksCorrect), marksWrong: Number(s.marksWrong) }); await refresh(); }, 'Scheme saved.')}>Save scheme</Button>}
                {p && (
                  <>
                    <label className="block text-sm font-medium" htmlFor={`key-${p.id}`}>Answer key (comma separated, A to E; use A/B for multiple correct)</label>
                    <Textarea id={`key-${p.id}`} className="font-mono text-xs" rows={3} disabled={!!p.provisionalPublishedAt} value={keys[p.id] ?? keyText(p.provisionalKey, p.questionCount)} onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })} placeholder="A,C,B,D,…" />
                    {p.changes.length > 0 && <Alert tone="info" title="Changes after objections">{p.changes.map((c) => `Q${c.qno} → ${c.to === 'DROP' ? 'dropped' : c.to.join('/')}`).join(' · ')}</Alert>}
                    {admin && (
                      <div className="flex flex-wrap items-end gap-2">
                        {!p.provisionalPublishedAt && <><div className="w-40"><LInput label="Objection days" type="number" min={1} max={15} value={days} onChange={(e) => setDays(e.target.value)} /></div>
                          <Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.post(`/admin/papers/${p.id}/provisional-key`, { key: parseKey(keys[p.id] ?? keyText(p.provisionalKey, p.questionCount)), objectionDays: Number(days) }); await refresh(); }, 'Provisional key published; candidates notified.')}>Publish provisional key</Button></>}
                        {p.provisionalPublishedAt && !p.finalPublishedAt && <Button variant="primary" loading={busy} disabled={windowOpen} onClick={() => void run(async () => { await api.post(`/admin/papers/${p.id}/final-key`); await refresh(); }, 'Final key published.')}>Publish final key</Button>}
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader title="Objections by question" description="Pre-review compares how top and bottom scorers answered; it is advice for the expert committee, never a decision." />
        <CardBody className="space-y-3">
          {!groups.data?.length && <p className="text-sm text-ink-muted">No paid objections yet.</p>}
          {groups.data?.map((g) => (
            <div key={`${g.paperId}:${g.qno}`} className="rounded-card border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Shift {g.shift} · Question {g.qno} <span className="font-normal text-ink-muted">· keyed {g.key.join('/')} · {g.count} objection(s)</span></p>
                <div className="flex flex-wrap gap-1">{Object.entries(g.claims).map(([k, n]) => <Badge key={k} tone="brand">claims {k}: {n}</Badge>)}{Object.entries(g.statuses).map(([k, n]) => <Badge key={k}>{k.toLowerCase()}: {n}</Badge>)}</div>
              </div>
              {g.samples.map((s, i) => <p key={i} className="mt-1 border-l-2 border-border pl-2 text-xs text-ink-muted">“{s}”</p>)}
              {g.aiReview && (
                <div className="mt-3 rounded bg-surface p-3 text-sm">
                  <p className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-orange-600" aria-hidden />Pre-review ({g.aiReview.provider}) · <StatusBadge s={g.aiReview.recommendation} /></p>
                  <p className="mt-1">Difficulty {g.aiReview.stats.difficulty} · discrimination {g.aiReview.stats.discrimination} · top scorers chose {g.aiReview.stats.topChoice ?? '-'} ({Math.round(g.aiReview.stats.topChoiceShare * 100)}%)</p>
                  <p className="text-xs text-ink-muted">Answer spread: {Object.entries(g.aiReview.stats.distribution).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                  {g.aiReview.signals.map((s) => <p key={s} className="mt-1 text-warning-700">• {s}</p>)}
                  <p className="mt-1 whitespace-pre-wrap">{g.aiReview.summary}</p>
                </div>
              )}
              {admin && (g.statuses.SUBMITTED ?? 0) > 0 && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" loading={busy} onClick={() => void run(async () => { await api.post(`/admin/papers/${g.paperId}/questions/${g.qno}/pre-review`); await groups.refetch(); })}><Sparkles className="h-4 w-4" aria-hidden />Run pre-review</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setDecide(g); setDec({ decision: 'REJECT', newOptions: Object.keys(g.claims)[0] ?? '', note: '' }); }}>Record committee decision</Button>
                </div>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Dialog open={!!decide} onClose={() => setDecide(null)} title={`Question ${decide?.qno}: committee decision`} closeLabel="Close"
        footer={<><Button onClick={() => setDecide(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={dec.note.length < 5} onClick={() => void run(async () => { await api.post(`/admin/papers/${decide!.paperId}/questions/${decide!.qno}/decision`, { decision: dec.decision, note: dec.note, ...(dec.decision === 'CHANGE_KEY' && { newOptions: dec.newOptions.toUpperCase().split(/[/,+\s]+/).filter(Boolean) }) }); setDecide(null); await refresh(); }, 'Decision recorded. Accepted objections are marked for fee refund.')}>Save decision</Button></>}>
        <div className="space-y-3">
          <LSelect label="Decision" value={dec.decision} onChange={(e) => setDec({ ...dec, decision: e.target.value })}><option value="REJECT">Reject: keep the key</option><option value="CHANGE_KEY">Change the key</option><option value="DROP">Drop the question (full marks to all)</option></LSelect>
          {dec.decision === 'CHANGE_KEY' && <LInput label="Correct option(s)" value={dec.newOptions} onChange={(e) => setDec({ ...dec, newOptions: e.target.value })} placeholder="B or B/C" />}
          <label className="block text-sm font-medium" htmlFor="dec-note">Committee note (shown to candidates)</label>
          <Textarea id="dec-note" value={dec.note} onChange={(e) => setDec({ ...dec, note: e.target.value })} />
        </div>
      </Dialog>
    </>
  );
}
