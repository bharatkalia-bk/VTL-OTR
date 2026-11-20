import { Button, Card, CardBody, CardHeader, Field, Select, Textarea } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Settings() {
  const { can, user } = useAuth();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, unknown>>('/admin/settings') });
  const [json, setJson] = useState('');
  useEffect(() => { if (q.data) setJson(JSON.stringify(q.data, null, 2)); }, [q.data]);
  const { run, banner, busy } = useAction();
  const sa = user?.roles.includes('SUPER_ADMIN');
  const [master, setMaster] = useState({ type: 'boards', body: '{ "name": "New Board" }' });
  return (
    <>
      <PageTitle title="Settings & masters" description="OTR ID format, photo/signature spec, liveness, OTP limits, lockout, retention (DPDP), helpdesk and FAQs." />
      {banner}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card><CardHeader title="System settings" /><CardBody className="space-y-3">
          <Textarea aria-label="Settings JSON" className="min-h-[520px] font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} readOnly={!sa} />
          {sa && <Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.put('/admin/settings', JSON.parse(json)); await q.refetch(); }, 'Settings saved.')}>Save settings</Button>}
        </CardBody></Card>
        <Card><CardHeader title="Masters" description="States, districts, boards, universities, qualifications. Bulk district import (LGD) can use the same API." /><CardBody className="space-y-3">
          <Field label="Master type">{(f) => <Select id={f.id} value={master.type} onChange={(e) => setMaster({ ...master, type: e.target.value })}>{['states', 'districts', 'boards', 'universities', 'qualifications'].map((t) => <option key={t}>{t}</option>)}</Select>}</Field>
          <Field label="Record (JSON)" hint='e.g. districts: { "stateCode": "UP", "name": "Ayodhya" }'>{(f) => <Textarea id={f.id} className="font-mono text-xs" value={master.body} onChange={(e) => setMaster({ ...master, body: e.target.value })} />}</Field>
          {sa && <Button loading={busy} onClick={() => void run(() => api.post(`/admin/masters/${master.type}`, JSON.parse(master.body)), 'Master record added.')}>Add record</Button>}
          {!can('SUPER_ADMIN') && <p className="text-xs text-ink-muted">Read-only for your role.</p>}
        </CardBody></Card>
      </div>
    </>
  );
}
