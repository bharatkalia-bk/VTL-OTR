import { Button, Card, CardBody, DataTable, Dialog, Textarea } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Exam { id: string; code: string; titleEn: string; status: string; notificationNo: string; dates: { applyStart: string; applyEnd: string }; _count: { applications: number; posts: number; centreCities: number } }

const TEMPLATE = {
  code: 'VTL-NEW-2027', titleEn: 'New Examination 2027', titleHi: 'नई परीक्षा 2027', notificationNo: 'VTL/NEW/2027/01', conductingBody: 'Staff Selection Board',
  descriptionEn: '', descriptionHi: '', ageCutoffDate: '2027-08-01', rollNoPrefix: 'NEW', maxCentrePreferences: 3,
  dates: { notification: '2027-01-01', applyStart: '2027-01-01', applyEnd: '2027-02-15', feeLastDate: '2027-02-17', examDate: '2027-04-10' }, customFields: [],
};

export default function Exams() {
  const { can } = useAuth();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['admin-exams'], queryFn: () => api.get<Exam[]>('/admin/exams') });
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState(JSON.stringify(TEMPLATE, null, 2));
  const { run, banner, busy } = useAction();
  return (
    <>
      <PageTitle title="Exams & notifications" actions={can('EXAM_ADMIN') && <Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden />New exam</Button>} />
      {banner}
      <DataTable caption="Exams" rows={q.data ?? []} rowKey={(r) => r.id} onRowClick={(r) => nav(`/exams/${r.id}`)}
        columns={[
          { key: 'c', header: 'Code', cell: (r) => <span className="font-medium">{r.code}</span> }, { key: 't', header: 'Title', cell: (r) => r.titleEn },
          { key: 'w', header: 'Apply window', cell: (r) => <span className="tabular-nums">{r.dates.applyStart} → {r.dates.applyEnd}</span> },
          { key: 'p', header: 'Posts', numeric: true, cell: (r) => r._count.posts }, { key: 'a', header: 'Applications', numeric: true, cell: (r) => r._count.applications },
          { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> },
        ]} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Create exam" size="lg" closeLabel="Close"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void run(async () => { const e = await api.post<{ id: string }>('/admin/exams', JSON.parse(json)); setOpen(false); nav(`/exams/${e.id}`); })}>Create</Button></>}>
        <p className="mb-2 text-sm text-ink-muted">Basic details as JSON (validated by the shared exam schema). Add posts, fee matrix and centres on the next screen.</p>
        <Textarea aria-label="Exam JSON" className="min-h-[360px] font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} />
      </Dialog>
      <Card className="mt-4"><CardBody className="text-sm text-ink-muted">Publishing requires at least one post, a fee matrix and a centre city. Eligibility rules (age limits, category relaxation, qualification, domicile, gender) are set per post.</CardBody></Card>
    </>
  );
}
