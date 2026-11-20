import { ADMIN_ROLES } from '@vtl/shared';
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, DataTable, Field, Input } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface U { id: string; name: string; email: string; roles: string[]; isActive: boolean; totpEnrolled: boolean; lastLoginAt: string | null }

export default function Users() {
  const { can, user } = useAuth();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api.get<U[]>('/admin/users') });
  const { run, banner, busy } = useAction();
  const [n, setN] = useState({ name: '', email: '', password: '', roles: [] as string[] });
  const sa = can('SUPER_ADMIN') && user?.roles.includes('SUPER_ADMIN');
  return (
    <>
      <PageTitle title="Admin users" description="Roles: Super Admin, Exam Admin, Verifier, Helpdesk Agent, Read-only Auditor. TOTP is mandatory for everyone." />
      {banner}
      <DataTable caption="Admin users" rows={q.data ?? []} rowKey={(r) => r.id} columns={[
        { key: 'n', header: 'Name', cell: (r) => r.name }, { key: 'e', header: 'Email', cell: (r) => r.email },
        { key: 'r', header: 'Roles', cell: (r) => <span className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x}>{x}</Badge>)}</span> },
        { key: 't', header: '2FA', cell: (r) => (r.totpEnrolled ? <Badge tone="success">Enrolled</Badge> : <Badge tone="warning">Pending</Badge>) },
        { key: 'a', header: 'Active', cell: (r) => (r.isActive ? 'Yes' : 'No') }, { key: 'l', header: 'Last login', cell: (r) => fmt.dt(r.lastLoginAt) },
        { key: 'x', header: '', cell: (r) => sa && r.id !== user?.id && <span className="flex gap-1">
          <Button size="sm" onClick={() => void run(() => api.put(`/admin/users/${r.id}`, { isActive: !r.isActive }).then(() => q.refetch()), 'Updated.')}>{r.isActive ? 'Deactivate' : 'Activate'}</Button>
          <Button size="sm" variant="ghost" onClick={() => void run(() => api.post(`/admin/users/${r.id}/reset-totp`).then(() => q.refetch()), '2FA reset; user must re-enrol.')}>Reset 2FA</Button>
        </span> },
      ]} />
      {sa && <Card className="mt-4"><CardHeader title="Add admin user" /><CardBody className="grid gap-3 md:grid-cols-3">
        <Field label="Name">{(f) => <Input id={f.id} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />}</Field>
        <Field label="Email">{(f) => <Input id={f.id} type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />}</Field>
        <Field label="Initial password" hint="8+ chars with upper, lower, digit, symbol">{(f) => <Input id={f.id} type="password" autoComplete="new-password" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} />}</Field>
        <div className="flex flex-wrap gap-4 md:col-span-3">{ADMIN_ROLES.map((r) => <Checkbox key={r} label={r} checked={n.roles.includes(r)} onChange={(e) => setN({ ...n, roles: e.target.checked ? [...n.roles, r] : n.roles.filter((x) => x !== r) })} />)}</div>
        <div><Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.post('/admin/users', n); setN({ name: '', email: '', password: '', roles: [] }); await q.refetch(); }, 'User created. They must enrol TOTP on first login.')}>Create user</Button></div>
      </CardBody></Card>}
    </>
  );
}
