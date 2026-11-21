import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, DataTable } from '@vtl/ui';
import { KeyRound, Upload } from 'lucide-react';
import { useState } from 'react';
import { LInput, LSelect, StatusBadge, readText, useAction, useExamPicker } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';

interface Key { id: string; name: string; prefix: string; scopes: string[]; revokedAt: string | null; lastUsedAt: string | null; createdAt: string }
interface Sub { id: string; kind: string; source: string; fileName: string | null; records: number; accepted: number; rejected: number; errors: Array<{ row: number; rollNo?: string; error: string }>; createdAt: string }
const KINDS = ['CBT_RESPONSES', 'OMR_READS', 'ATTENDANCE', 'BIOMETRIC_ALERTS'] as const;
const SAMPLE: Record<string, string> = {
  CBT_RESPONSES: 'rollNo,activeMinutes,Q1,Q2,Q3\nCHSL2600001,72,A,C,',
  OMR_READS: 'rollNo,scanRef,Q1,Q2,Q3\nCHSL2600001,BOX4/IMG0012,B,*,D',
  ATTENDANCE: 'rollNo,status\nCHSL2600001,PRESENT',
  BIOMETRIC_ALERTS: 'rollNo,kind,score,note\nCHSL2600001,FACE_MISMATCH,0.41,Entry camera mismatch',
};

export default function Agency() {
  const { examId, exam, picker } = useExamPicker('/admin/agency/exams');
  const { run, banner, busy } = useAction();
  const keys = useQuery({ queryKey: ['agency-keys'], queryFn: () => api.get<Key[]>('/admin/agency/keys') });
  const subs = useQuery({ queryKey: ['agency-subs', examId], queryFn: () => api.get<Sub[]>(`/admin/agency/submissions${examId ? `?examId=${examId}` : ''}`) });
  const [kind, setKind] = useState<string>('CBT_RESPONSES');
  const [last, setLast] = useState<(Sub & { duplicate: boolean }) | null>(null);
  const [kf, setKf] = useState({ name: '', scopes: ['CBT_RESPONSES'] as string[] });
  const [newKey, setNewKey] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin.replace(':5174', ':4000') : '';

  return (
    <>
      <PageTitle title="Agency gateway" description="Conducting agencies upload responses, OMR reads, attendance and biometric alerts by file or API" actions={picker} />
      {banner}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Upload a file" description="CSV with a header row. Re-sending the same file is detected and not imported twice." />
          <CardBody className="space-y-3">
            <LSelect label="Data type" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ').toLowerCase()}</option>)}</LSelect>
            <pre className="overflow-x-auto rounded bg-surface p-2 text-xs">{SAMPLE[kind]}</pre>
            <label className="flex cursor-pointer items-center gap-2 rounded-card border-2 border-dashed border-border p-4 text-sm hover:border-orange">
              <Upload className="h-5 w-5 text-orange-600" aria-hidden /><span>Choose CSV file for {exam?.code}</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && examId) void run(async () => { const r = await api.post<Sub & { duplicate: boolean }>(`/admin/agency/exams/${examId}/upload`, { kind, fileName: f.name, csv: await readText(f) }); setLast(r); await subs.refetch(); }); }} />
            </label>
            {last && <Alert tone={last.duplicate ? 'warning' : last.rejected ? 'warning' : 'success'} title={last.duplicate ? 'Already received earlier' : 'Imported'}>{last.accepted} accepted, {last.rejected} rejected of {last.records}.{last.errors.slice(0, 5).map((e) => <span key={e.row} className="block text-xs">Row {e.row}{e.rollNo ? ` (${e.rollNo})` : ''}: {e.error}</span>)}</Alert>}
          </CardBody>
        </Card>
        <Card><CardHeader title="API keys" description="For server-to-server uploads. Keys are hashed; the full key is shown once." />
          <CardBody className="space-y-3">
            <LInput label="Key name" value={kf.name} onChange={(e) => setKf({ ...kf, name: e.target.value })} placeholder="CBT vendor production" />
            <div className="flex flex-wrap gap-3">{KINDS.map((k) => <Checkbox key={k} label={k.replace('_', ' ').toLowerCase()} checked={kf.scopes.includes(k)} onChange={(e) => setKf({ ...kf, scopes: e.target.checked ? [...kf.scopes, k] : kf.scopes.filter((s) => s !== k) })} />)}</div>
            <Button variant="primary" loading={busy} disabled={kf.name.length < 3 || !kf.scopes.length} onClick={() => void run(async () => { const r = await api.post<{ key: string }>('/admin/agency/keys', { name: kf.name, scopes: kf.scopes, examId }); setNewKey(r.key); await keys.refetch(); })}><KeyRound className="h-4 w-4" aria-hidden />Create key</Button>
            {newKey && <Alert tone="success" title="Copy this key now"><code className="break-all text-xs">{newKey}</code></Alert>}
            <ul className="divide-y divide-border text-sm">{keys.data?.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 py-2"><div><p className="font-medium">{k.name} <code className="text-xs">vtl_ak_{k.prefix}_…</code></p><p className="text-xs text-ink-muted">{k.scopes.join(', ')} · last used {k.lastUsedAt ? fmt.dt(k.lastUsedAt) : 'never'}</p></div>
                {k.revokedAt ? <StatusBadge s="REVOKED" /> : <Button size="sm" variant="ghost" onClick={() => void run(async () => { await api.del(`/admin/agency/keys/${k.id}`); await keys.refetch(); }, 'Key revoked.')}>Revoke</Button>}</li>
            ))}</ul>
            <details className="text-sm"><summary className="cursor-pointer font-medium">API usage</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-navy p-3 text-xs text-white">{`curl -X POST ${origin}/api/v1/agency/v1/exams/${exam?.code ?? 'EXAM'}/submissions \\
  -H "X-Agency-Key: vtl_ak_…" -H "Content-Type: application/json" \\
  -d '{"kind":"CBT_RESPONSES","records":[{"rollNo":"…","responses":{"1":"A","2":null},"activeMinutes":70}]}'`}</pre></details>
          </CardBody>
        </Card>
      </div>
      <h2 className="mb-2 mt-6 font-heading text-lg font-bold">Submissions</h2>
      <DataTable caption="Submissions" rows={subs.data ?? []} rowKey={(r) => r.id} empty="No submissions yet" columns={[
        { key: 't', header: 'Received', cell: (r) => <span className="text-xs">{fmt.dt(r.createdAt)}</span> }, { key: 'k', header: 'Type', cell: (r) => r.kind.replace('_', ' ').toLowerCase() }, { key: 's', header: 'Via', cell: (r) => r.source },
        { key: 'f', header: 'File', cell: (r) => r.fileName ?? '-' }, { key: 'n', header: 'Records', numeric: true, cell: (r) => r.records }, { key: 'a', header: 'Accepted', numeric: true, cell: (r) => r.accepted },
        { key: 'x', header: 'Rejected', numeric: true, cell: (r) => (r.rejected ? <span className="font-semibold text-danger-700">{r.rejected}</span> : 0) },
      ]} />
    </>
  );
}
