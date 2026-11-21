import { Button, Card, CardBody, CardHeader, DataTable, Field, Input, Select, Textarea } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';

interface Tpl { id: string; code: string; channel: string; language: string; subject: string; body: string; dltTemplateId: string | null }
interface Camp { id: string; name: string; templateCode: string; status: string; total: number; sent: number; createdAt: string }

export default function Comms() {
  const tpls = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Tpl[]>('/admin/comms/templates') });
  const camps = useQuery({ queryKey: ['campaigns'], queryFn: () => api.get<Camp[]>('/admin/comms/campaigns') });
  const exams = useQuery({ queryKey: ['admin-exams'], queryFn: () => api.get<Array<{ id: string; code: string }>>('/admin/exams') });
  const { run, banner, busy } = useAction();
  const [tpl, setTpl] = useState({ code: 'ANNOUNCEMENT', channel: 'SMS', language: 'en', subject: '', body: 'Dear {{name}}, ... -VTL', dltTemplateId: '' });
  const [camp, setCamp] = useState({ name: '', templateCode: 'ANNOUNCEMENT', examId: '', applicationStatus: '', stateCode: '', category: '' });
  const [preview, setPreview] = useState<number | null>(null);
  const filters = { examId: camp.examId || undefined, applicationStatus: camp.applicationStatus || undefined, stateCode: camp.stateCode || undefined, category: camp.category || undefined };
  return (
    <>
      <PageTitle title="Communication" description="Bulk SMS / email by filters. Messages are queued and rate-shaped by the worker; delivery is logged without storing recipients in clear." />
      {banner}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="New campaign" /><CardBody className="space-y-3">
          <Field label="Campaign name" required>{(f) => <Input id={f.id} value={camp.name} onChange={(e) => setCamp({ ...camp, name: e.target.value })} />}</Field>
          <Field label="Template code" required>{(f) => <Input id={f.id} value={camp.templateCode} onChange={(e) => setCamp({ ...camp, templateCode: e.target.value })} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Exam">{(f) => <Select id={f.id} value={camp.examId} onChange={(e) => setCamp({ ...camp, examId: e.target.value })}><option value="">Any</option>{exams.data?.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</Select>}</Field>
            <Field label="Application status">{(f) => <Select id={f.id} value={camp.applicationStatus} onChange={(e) => setCamp({ ...camp, applicationStatus: e.target.value })}><option value="">Any</option>{['PAYMENT_PENDING', 'PAID', 'FEE_EXEMPT', 'DRAFT'].map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
            <Field label="State code">{(f) => <Input id={f.id} value={camp.stateCode} onChange={(e) => setCamp({ ...camp, stateCode: e.target.value.toUpperCase() })} />}</Field>
            <Field label="Category">{(f) => <Select id={f.id} value={camp.category} onChange={(e) => setCamp({ ...camp, category: e.target.value })}><option value="">Any</option>{['GEN', 'EWS', 'OBC_NCL', 'SC', 'ST'].map((s) => <option key={s}>{s}</option>)}</Select>}</Field>
          </div>
          <div className="flex items-center gap-2">
            <Button loading={busy} onClick={() => void run(async () => setPreview((await api.post<{ total: number }>('/admin/comms/campaigns/preview', { name: camp.name || 'preview', templateCode: camp.templateCode, filters })).total))}>Preview recipients</Button>
            {preview !== null && <span className="text-sm tabular-nums">{fmt.n(preview)} recipients</span>}
            <Button variant="primary" loading={busy} disabled={camp.name.length < 3} onClick={() => void run(async () => { await api.post('/admin/comms/campaigns', { name: camp.name, templateCode: camp.templateCode, filters }); await camps.refetch(); }, 'Campaign queued.')}>Send</Button>
          </div>
        </CardBody></Card>
        <Card><CardHeader title="Template editor" description="Handlebars variables: {{name}}, {{otrId}}. SMS templates need a DLT template ID." /><CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Code">{(f) => <Input id={f.id} value={tpl.code} onChange={(e) => setTpl({ ...tpl, code: e.target.value.toUpperCase() })} />}</Field>
            <Field label="Channel">{(f) => <Select id={f.id} value={tpl.channel} onChange={(e) => setTpl({ ...tpl, channel: e.target.value })}><option>SMS</option><option>EMAIL</option></Select>}</Field>
            <Field label="Language">{(f) => <Select id={f.id} value={tpl.language} onChange={(e) => setTpl({ ...tpl, language: e.target.value })}><option value="en">English</option><option value="hi">Hindi</option></Select>}</Field>
          </div>
          {tpl.channel === 'EMAIL' ? <Field label="Subject">{(f) => <Input id={f.id} value={tpl.subject} onChange={(e) => setTpl({ ...tpl, subject: e.target.value })} />}</Field> : <Field label="DLT template ID">{(f) => <Input id={f.id} value={tpl.dltTemplateId} onChange={(e) => setTpl({ ...tpl, dltTemplateId: e.target.value })} />}</Field>}
          <Field label="Body">{(f) => <Textarea id={f.id} value={tpl.body} onChange={(e) => setTpl({ ...tpl, body: e.target.value })} />}</Field>
          <Button variant="secondary" loading={busy} onClick={() => void run(async () => { await api.put('/admin/comms/templates', { ...tpl, dltTemplateId: tpl.dltTemplateId || null }); await tpls.refetch(); }, 'Template saved.')}>Save template</Button>
        </CardBody></Card>
      </div>
      <Card className="mt-4"><CardHeader title="Campaigns" /><CardBody className="p-0 sm:p-0"><DataTable caption="Campaigns" rows={camps.data ?? []} rowKey={(r) => r.id} empty="No campaigns" columns={[
        { key: 'n', header: 'Name', cell: (r) => r.name }, { key: 't', header: 'Template', cell: (r) => r.templateCode }, { key: 'c', header: 'Sent / total', numeric: true, cell: (r) => `${fmt.n(r.sent)} / ${fmt.n(r.total)}` },
        { key: 's', header: 'Status', cell: (r) => <StatusBadge s={r.status} /> }, { key: 'd', header: 'Created', cell: (r) => fmt.dt(r.createdAt) },
      ]} /></CardBody></Card>
      <Card className="mt-4"><CardHeader title="Custom templates" description="Built-in templates (OTP, OTR ID, payment, admit card…) apply when no override exists." /><CardBody className="p-0 sm:p-0"><DataTable caption="Templates" rows={tpls.data ?? []} rowKey={(r) => r.id} empty="No overrides" columns={[
        { key: 'c', header: 'Code', cell: (r) => r.code }, { key: 'ch', header: 'Channel', cell: (r) => r.channel }, { key: 'l', header: 'Lang', cell: (r) => r.language }, { key: 'b', header: 'Body', cell: (r) => <span className="text-xs">{r.body.slice(0, 100)}</span> },
        { key: 'e', header: '', cell: (r) => <Button size="sm" onClick={() => setTpl({ code: r.code, channel: r.channel, language: r.language, subject: r.subject, body: r.body, dltTemplateId: r.dltTemplateId ?? '' })}>Edit</Button> },
      ]} /></CardBody></Card>
    </>
  );
}
