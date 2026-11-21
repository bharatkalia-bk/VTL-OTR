import { Button, Card, CardBody, CardHeader, DataTable, Field, Select } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';

interface Job { id: string; type: string; format: string; status: string; rowCount: number | null; error: string | null; createdAt: string }
const TYPES = [['APPLICANTS', 'Applicant list (per exam)'], ['CATEGORY_COUNTS', 'Category / gender counts'], ['PAYMENTS', 'Payment report'], ['REGISTRATIONS_BY_STATE', 'Registrations by state'], ['ADMIT_CARDS', 'Admit card allocation']] as const;

export default function Reports() {
  const jobs = useQuery({ queryKey: ['reports'], queryFn: () => api.get<Job[]>('/admin/reports'), refetchInterval: (q) => (q.state.data?.some((j) => j.status === 'QUEUED' || j.status === 'RUNNING') ? 3000 : false) });
  const exams = useQuery({ queryKey: ['admin-exams'], queryFn: () => api.get<Array<{ id: string; code: string }>>('/admin/exams') });
  const [type, setType] = useState<string>('APPLICANTS');
  const [format, setFormat] = useState('xlsx');
  const [examId, setExamId] = useState('');
  const { run, banner, busy } = useAction();
  const download = (id: string) => void run(async () => { const r = await api.get<{ url: string }>(`/admin/reports/${id}/download`); window.location.assign(r.url); });
  return (
    <>
      <PageTitle title="Reports & exports" description="Exports are generated in the background and downloaded via short-lived signed links. Exports contain personal data; downloads are audited." />
      {banner}
      <Card><CardHeader title="New export" /><CardBody className="flex flex-wrap items-end gap-3">
        <Field label="Report" className="w-72">{(f) => <Select id={f.id} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
        <Field label="Exam" className="w-56">{(f) => <Select id={f.id} value={examId} onChange={(e) => setExamId(e.target.value)}><option value="">All / not applicable</option>{exams.data?.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</Select>}</Field>
        <Field label="Format" className="w-32">{(f) => <Select id={f.id} value={format} onChange={(e) => setFormat(e.target.value)}><option value="xlsx">Excel</option><option value="csv">CSV</option></Select>}</Field>
        <Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.post('/admin/reports', { type, format, examId: examId || undefined }); await jobs.refetch(); }, 'Export queued.')}>Generate</Button>
      </CardBody></Card>
      <Card className="mt-4"><CardHeader title="My exports" /><CardBody className="p-0 sm:p-0"><DataTable caption="Exports" rows={jobs.data ?? []} rowKey={(r) => r.id} empty="No exports yet" columns={[
        { key: 't', header: 'Report', cell: (r) => r.type }, { key: 'f', header: 'Format', cell: (r) => r.format.toUpperCase() }, { key: 'n', header: 'Rows', numeric: true, cell: (r) => (r.rowCount ?? '—') },
        { key: 's', header: 'Status', cell: (r) => <><StatusBadge s={r.status} />{r.error && <p className="text-xs text-danger">{r.error}</p>}</> }, { key: 'c', header: 'Created', cell: (r) => fmt.dt(r.createdAt) },
        { key: 'd', header: '', cell: (r) => r.status === 'DONE' && <Button size="sm" onClick={() => download(r.id)}>Download</Button> },
      ]} /></CardBody></Card>
    </>
  );
}
