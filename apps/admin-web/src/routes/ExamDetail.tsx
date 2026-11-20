import { Alert, Badge, Button, Card, CardBody, CardHeader, CursorPager, DataTable, Dialog, Select, Spinner, Tabs, Textarea } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { KV, StatusBadge, useAction, useCursorList } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt, qs } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Centre { id: string; code: string; name: string; address: string; capacity: number; reportingTime: string; gateClosingTime: string }
interface Exam {
  id: string; code: string; titleEn: string; titleHi: string; notificationNo: string; conductingBody: string; descriptionEn: string; descriptionHi: string; status: string; ageCutoffDate: string; rollNoPrefix: string; maxCentrePreferences: number;
  dates: Record<string, string>; customFields: unknown[]; admitCardsReleasedAt: string | null; applicationCounts: Record<string, number>;
  posts: Array<{ id: string; code: string; titleEn: string; titleHi: string; vacancies: Record<string, number>; eligibility: unknown }>;
  feeRules: Array<{ priority: number; label: string; amount: number; conditions: Record<string, unknown> }>;
  centreCities: Array<{ id: string; cityName: string; stateCode: string; centres: Centre[] }>;
}
interface AC { id: string; rollNo: string; allocationMethod: string; releasedAt: string | null; generatedAt: string | null; centre: { id: string; name: string; city: { cityName: string } } | null; application: { applicationNo: string; candidate: { otrId: string } } }

const POST_TEMPLATE = { code: 'POST1', titleEn: 'New post', titleHi: 'नया पद', vacancies: { GEN: 10 }, eligibility: { age: { min: 18, max: 27, categoryRelaxation: { OBC_NCL: 3, SC: 5, ST: 5 }, pwdRelaxation: 10, exServicemanExtra: 3 }, qualification: { minLevel: 'GRADUATION', allowAppearing: false } } };
const CITY_TEMPLATE = { cityName: 'Lucknow', stateCode: 'UP', centres: [{ code: 'LKO01', name: 'Centre name', address: 'Full address', capacity: 300, reportingTime: '08:30', gateClosingTime: '09:30' }] };

export default function ExamDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['admin-exam', id], queryFn: () => api.get<Exam>(`/admin/exams/${id}`) });
  const [tab, setTab] = useState<'overview' | 'posts' | 'fees' | 'centres' | 'admit'>('overview');
  const { run, banner, busy } = useAction();
  const [editor, setEditor] = useState<{ title: string; json: string; save: (v: unknown) => Promise<unknown> } | null>(null);
  if (!q.data) return <Spinner label="Loading…" />;
  const e = q.data;
  const edit = can('EXAM_ADMIN');
  const openEditor = (title: string, value: unknown, save: (v: unknown) => Promise<unknown>) => setEditor({ title, json: JSON.stringify(value, null, 2), save });
  const basics = { code: e.code, titleEn: e.titleEn, titleHi: e.titleHi, notificationNo: e.notificationNo, conductingBody: e.conductingBody, descriptionEn: e.descriptionEn, descriptionHi: e.descriptionHi, dates: e.dates, ageCutoffDate: e.ageCutoffDate, maxCentrePreferences: e.maxCentrePreferences, customFields: e.customFields, rollNoPrefix: e.rollNoPrefix };
  return (
    <>
      <PageTitle title={e.titleEn} description={`${e.code} · ${e.notificationNo}`} actions={<>
        <StatusBadge s={e.status} />
        {edit && e.status !== 'PUBLISHED' && <Button size="sm" variant="primary" loading={busy} onClick={() => void run(() => api.post(`/admin/exams/${e.id}/status`, { status: 'PUBLISHED' }).then(() => q.refetch()), 'Published.')}>Publish</Button>}
        {edit && e.status === 'PUBLISHED' && <Button size="sm" loading={busy} onClick={() => void run(() => api.post(`/admin/exams/${e.id}/status`, { status: 'CLOSED' }).then(() => q.refetch()), 'Closed.')}>Close applications</Button>}
        {edit && e.status === 'PUBLISHED' && <Button size="sm" variant="ghost" onClick={() => void run(() => api.post(`/admin/exams/${e.id}/status`, { status: 'DRAFT' }).then(() => q.refetch()), 'Unpublished.')}>Unpublish</Button>}
      </>} />
      {banner}
      <Tabs label="Exam sections" value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'posts', label: `Posts & eligibility (${e.posts.length})` }, { value: 'fees', label: 'Fee matrix' }, { value: 'centres', label: `Centres (${e.centreCities.length})` }, { value: 'admit', label: 'Admit cards & results' }]} />
      <div className="mt-4">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Notification" actions={edit && <Button size="sm" onClick={() => openEditor('Edit exam', basics, (v) => api.put(`/admin/exams/${e.id}`, v))}>Edit</Button>} /><CardBody><dl>
              <KV k="Hindi title" v={e.titleHi} /><KV k="Conducting body" v={e.conductingBody} /><KV k="Age cut-off" v={e.ageCutoffDate} /><KV k="Roll prefix" v={e.rollNoPrefix} /><KV k="Max centre prefs" v={e.maxCentrePreferences} />
              {Object.entries(e.dates).map(([k, v]) => <KV key={k} k={k} v={v} />)}
              <KV k="Custom fields" v={(e.customFields as Array<{ key: string }>).map((c) => c.key).join(', ') || 'None'} />
            </dl></CardBody></Card>
            <Card><CardHeader title="Applications" /><CardBody><dl>{Object.entries(e.applicationCounts).map(([k, v]) => <KV key={k} k={k} v={fmt.n(v)} />)}{!Object.keys(e.applicationCounts).length && <p className="text-sm text-ink-muted">No applications yet.</p>}</dl></CardBody></Card>
          </div>
        )}
        {tab === 'posts' && (
          <Card><CardHeader title="Posts" actions={edit && <Button size="sm" variant="secondary" onClick={() => openEditor('Add post', POST_TEMPLATE, (v) => api.post(`/admin/exams/${e.id}/posts`, v))}>Add post</Button>} />
            <CardBody className="p-0 sm:p-0"><DataTable caption="Posts" rows={e.posts} rowKey={(r) => r.id} columns={[
              { key: 'c', header: 'Code', cell: (r) => r.code }, { key: 't', header: 'Title', cell: (r) => r.titleEn },
              { key: 'v', header: 'Vacancies', cell: (r) => Object.entries(r.vacancies).map(([k, v]) => `${k} ${v}`).join(' · ') },
              { key: 'e', header: 'Eligibility', cell: (r) => <code className="text-xs">{JSON.stringify(r.eligibility).slice(0, 90)}…</code> },
              { key: 'a', header: '', cell: (r) => edit && <span className="flex gap-1"><Button size="sm" onClick={() => openEditor(`Edit ${r.code}`, { code: r.code, titleEn: r.titleEn, titleHi: r.titleHi, vacancies: r.vacancies, eligibility: r.eligibility }, (v) => api.put(`/admin/exams/${e.id}/posts/${r.id}`, v))}>Edit</Button><Button size="sm" variant="ghost" onClick={() => void run(() => api.del(`/admin/exams/${e.id}/posts/${r.id}`).then(() => q.refetch()), 'Deleted.')}>Delete</Button></span> },
            ]} /></CardBody></Card>
        )}
        {tab === 'fees' && (
          <Card><CardHeader title="Fee matrix" description="First matching rule by priority wins. If none match, the highest fee applies." actions={edit && <Button size="sm" onClick={() => openEditor('Edit fee matrix', { rules: e.feeRules.map(({ priority, label, amount, conditions }) => ({ priority, label, amount, conditions })) }, (v) => api.put(`/admin/exams/${e.id}/fee-rules`, v))}>Edit</Button>} />
            <CardBody className="p-0 sm:p-0"><DataTable caption="Fee rules" rows={e.feeRules} rowKey={(r) => String(r.priority)} columns={[
              { key: 'p', header: 'Priority', numeric: true, cell: (r) => r.priority }, { key: 'l', header: 'Label', cell: (r) => r.label },
              { key: 'c', header: 'Conditions', cell: (r) => <code className="text-xs">{JSON.stringify(r.conditions)}</code> }, { key: 'a', header: 'Amount', numeric: true, cell: (r) => (r.amount ? fmt.inr(r.amount) : <Badge tone="success">Exempt</Badge>) },
            ]} /></CardBody></Card>
        )}
        {tab === 'centres' && (
          <div className="space-y-4">
            {edit && <Button variant="secondary" onClick={() => openEditor('Add centre city', CITY_TEMPLATE, (v) => api.post(`/admin/exams/${e.id}/centre-cities`, v))}>Add centre city</Button>}
            {e.centreCities.map((c) => (
              <Card key={c.id}><CardHeader title={`${c.cityName} (${c.stateCode})`} actions={edit && <Button size="sm" onClick={() => openEditor(`Edit ${c.cityName}`, { cityName: c.cityName, stateCode: c.stateCode, centres: c.centres }, (v) => api.put(`/admin/exams/${e.id}/centre-cities/${c.id}`, v))}>Edit</Button>} />
                <CardBody className="p-0 sm:p-0"><DataTable caption={c.cityName} rows={c.centres} rowKey={(r) => r.id} columns={[
                  { key: 'c', header: 'Code', cell: (r) => r.code }, { key: 'n', header: 'Name', cell: (r) => r.name }, { key: 'a', header: 'Address', cell: (r) => r.address },
                  { key: 'cap', header: 'Capacity', numeric: true, cell: (r) => fmt.n(r.capacity) }, { key: 't', header: 'Reporting / gate', cell: (r) => `${r.reportingTime} / ${r.gateClosingTime}` },
                ]} /></CardBody></Card>
            ))}
          </div>
        )}
        {tab === 'admit' && <AdmitCards exam={e} />}
      </div>
      <Dialog open={!!editor} onClose={() => setEditor(null)} title={editor?.title ?? ''} size="lg" closeLabel="Close"
        footer={<><Button onClick={() => setEditor(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void run(async () => { await editor!.save(JSON.parse(editor!.json)); setEditor(null); await q.refetch(); }, 'Saved.')}>Save</Button></>}>
        <p className="mb-2 text-xs text-ink-muted">Validated server-side against the shared schema. Errors are shown above the page content.</p>
        <Textarea aria-label="JSON editor" className="min-h-[380px] font-mono text-xs" value={editor?.json ?? ''} onChange={(ev) => editor && setEditor({ ...editor, json: ev.target.value })} />
      </Dialog>
    </>
  );
}

function AdmitCards({ exam }: { exam: Exam }) {
  const { can } = useAuth();
  const s = useQuery({ queryKey: ['ac-summary', exam.id], queryFn: () => api.get<{ eligible: number; allocated: number; unallocated: number; generated: number; released: number; centres: Array<{ id: string; code: string; name: string; city: string; capacity: number; allocated: number }> }>(`/admin/exams/${exam.id}/admit-cards/summary`) });
  const [onlyUnalloc, setOnlyUnalloc] = useState(false);
  const list = useCursorList<AC>(['ac', exam.id, onlyUnalloc], (c) => `/admin/exams/${exam.id}/admit-cards${qs({ cursor: c, limit: 50, unallocated: onlyUnalloc || undefined })}`);
  const { run, banner, busy } = useAction();
  const [results, setResults] = useState('');
  const refresh = () => Promise.all([s.refetch(), list.refetch()]);
  const allCentres = exam.centreCities.flatMap((c) => c.centres.map((x) => ({ ...x, city: c.cityName })));
  return (
    <div className="space-y-4">
      {banner}
      <Card><CardBody className="flex flex-wrap items-center gap-6">
        {s.data && <dl className="flex flex-wrap gap-6 text-sm">{(['eligible', 'allocated', 'unallocated', 'generated', 'released'] as const).map((k) => <div key={k}><dt className="text-ink-muted capitalize">{k}</dt><dd className="font-heading text-xl font-bold tabular-nums">{fmt.n(s.data[k])}</dd></div>)}</dl>}
        {can('EXAM_ADMIN') && <div className="ml-auto flex flex-wrap gap-2">
          <Button loading={busy} onClick={() => void run(async () => { const r = await api.post<{ placed: number; unplaced: string[] }>(`/admin/exams/${exam.id}/admit-cards/allocate`); await refresh(); return r; }, 'Roll numbers and centres allocated (manual overrides kept).')} data-testid="ac-allocate">1. Allocate roll no. & centres</Button>
          <Button loading={busy} onClick={() => void run(() => api.post(`/admin/exams/${exam.id}/admit-cards/generate`).then(refresh), 'PDF generation queued.')} data-testid="ac-generate">2. Generate PDFs</Button>
          <Button variant="primary" loading={busy} onClick={() => void run(() => api.post(`/admin/exams/${exam.id}/admit-cards/release`).then(refresh), 'Admit cards released; candidates notified.')} data-testid="ac-release">3. Release</Button>
        </div>}
      </CardBody></Card>
      {s.data && s.data.unallocated > 0 && <Alert tone="warning">{s.data.unallocated} candidates could not be placed by preference and capacity. Assign them manually below.</Alert>}
      <Card><CardHeader title="Centre utilisation" /><CardBody className="p-0 sm:p-0"><DataTable caption="Centres" rows={s.data?.centres ?? []} rowKey={(r) => r.id} columns={[
        { key: 'c', header: 'Centre', cell: (r) => `${r.code} · ${r.name}` }, { key: 'city', header: 'City', cell: (r) => r.city }, { key: 'u', header: 'Allocated / capacity', numeric: true, cell: (r) => `${r.allocated} / ${r.capacity}` },
      ]} /></CardBody></Card>
      <Card><CardHeader title="Admit cards" actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyUnalloc} onChange={(ev) => setOnlyUnalloc(ev.target.checked)} />Unallocated only</label>} />
        <CardBody className="p-0 sm:p-0"><DataTable caption="Admit cards" rows={list.items} rowKey={(r) => r.id} empty="Run allocation first" columns={[
          { key: 'r', header: 'Roll no.', cell: (r) => <span className="tabular-nums">{r.rollNo}</span> }, { key: 'o', header: 'OTR ID', cell: (r) => <span className="tabular-nums">{r.application.candidate.otrId}</span> },
          { key: 'c', header: 'Centre', cell: (r) => (can('EXAM_ADMIN') && !r.releasedAt
            ? <Select aria-label={`Centre for ${r.rollNo}`} className="h-9 w-64 text-xs" value={r.centre?.id ?? ''} onChange={(ev) => void run(() => api.put(`/admin/admit-cards/${r.id}/centre`, { centreId: ev.target.value }).then(refresh), 'Centre overridden.')}><option value="">Unallocated</option>{allCentres.map((c) => <option key={c.id} value={c.id}>{c.city} · {c.code}</option>)}</Select>
            : r.centre ? `${r.centre.city.cityName} · ${r.centre.name}` : '—') },
          { key: 'm', header: 'Method', cell: (r) => r.allocationMethod }, { key: 'g', header: 'PDF', cell: (r) => (r.generatedAt ? 'Generated' : '—') }, { key: 'rel', header: 'Released', cell: (r) => fmt.dt(r.releasedAt) },
        ]} /></CardBody></Card>
      <CursorPager hasMore={!!list.hasNextPage} onMore={() => void list.fetchNextPage()} label="Load more" />
      {can('EXAM_ADMIN') && <Card><CardHeader title="Publish results" description='JSON array: [{"rollNo":"...","status":"QUALIFIED","score":71.5,"rank":12}]' /><CardBody className="space-y-2">
        <Textarea aria-label="Results JSON" className="font-mono text-xs" value={results} onChange={(ev) => setResults(ev.target.value)} />
        <Button disabled={!results} loading={busy} onClick={() => void run(() => api.post(`/admin/exams/${exam.id}/results`, { results: JSON.parse(results) }), 'Results published.')}>Publish results</Button>
      </CardBody></Card>}
    </div>
  );
}
