import { Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@vtl/ui';
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
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  return (
    <>
      <PageTitle title="Settings & masters" description="OTR ID format, photo/signature spec, liveness, OTP limits, lockout, retention (DPDP), helpdesk and FAQs." />
      {banner}
      <Card className="mb-4"><CardHeader title="Change my password" description="Needs your current password and an authenticator code. Your other sessions are signed out." /><CardBody className="flex flex-wrap items-end gap-3">
        <Field label="Current password">{(f) => <Input id={f.id} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>
        <Field label="New password" hint="8+ chars with upper, lower, digit, symbol">{(f) => <Input id={f.id} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}</Field>
        <Button variant="secondary" loading={busy} disabled={!pw.currentPassword || pw.newPassword.length < 8} onClick={() => void run(async () => { await api.post('/admin/auth/password', pw); setPw({ currentPassword: '', newPassword: '' }); }, 'Password changed.')}>Change password</Button>
      </CardBody></Card>
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
