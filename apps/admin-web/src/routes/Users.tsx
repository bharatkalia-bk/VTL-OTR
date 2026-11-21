import { ADMIN_ROLES, FIELD_ROLES, ROLE_LABELS, type AdminRole } from '@vtl/shared';
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, DataTable, Dialog, Field, Input } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LInput, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Scope { centreIds?: string[]; examIds?: string[]; homeDistrict?: string; agency?: string }
interface Ctr { id: string; code: string; name: string; city: string; exam: { id: string; code: string } }
interface U { id: string; name: string; email: string; scope: Scope; roles: string[]; isActive: boolean; totpEnrolled: boolean; lastLoginAt: string | null }

export default function Users() {
  const { can, user } = useAuth();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api.get<U[]>('/admin/users') });
  const { run, banner, busy } = useAction();
  const [n, setN] = useState({ name: '', email: '', password: '', roles: [] as string[] });
  const sa = can('SUPER_ADMIN') && user?.roles.includes('SUPER_ADMIN');
  const [edit, setEdit] = useState<U | null>(null);
  const [sc, setSc] = useState<Scope>({});
  const centres = useQuery({ queryKey: ['all-centres'], queryFn: () => api.get<Ctr[]>('/admin/centre/centres'), enabled: !!edit });
  const isField = (r: U) => r.roles.some((x) => (FIELD_ROLES as readonly string[]).includes(x));
  return (
    <>
      <PageTitle title="Staff users" description="Console roles and field roles (centre superintendent, observer, agency, interview panel). TOTP is mandatory for everyone." />
      {banner}
      <DataTable caption="Admin users" rows={q.data ?? []} rowKey={(r) => r.id} columns={[
        { key: 'n', header: 'Name', cell: (r) => r.name }, { key: 'e', header: 'Email', cell: (r) => r.email },
        { key: 'r', header: 'Roles', cell: (r) => <span className="flex flex-wrap gap-1">{r.roles.map((x) => <Badge key={x} tone={(FIELD_ROLES as readonly string[]).includes(x) ? 'brand' : 'neutral'}>{ROLE_LABELS[x as AdminRole] ?? x}</Badge>)}</span> },
        { key: 't', header: '2FA', cell: (r) => (r.totpEnrolled ? <Badge tone="success">Enrolled</Badge> : <Badge tone="warning">Pending</Badge>) },
        { key: 'a', header: 'Active', cell: (r) => (r.isActive ? 'Yes' : 'No') }, { key: 'l', header: 'Last login', cell: (r) => fmt.dt(r.lastLoginAt) },
        { key: 'x', header: '', cell: (r) => sa && r.id !== user?.id && <span className="flex gap-1">
          <Button size="sm" onClick={() => void run(() => api.put(`/admin/users/${r.id}`, { isActive: !r.isActive }).then(() => q.refetch()), 'Updated.')}>{r.isActive ? 'Deactivate' : 'Activate'}</Button>
          <Button size="sm" variant="ghost" onClick={() => void run(() => api.post(`/admin/users/${r.id}/reset-totp`).then(() => q.refetch()), '2FA reset; user must re-enrol.')}>Reset 2FA</Button>
          {isField(r) && <Button size="sm" variant="ghost" onClick={() => { setEdit(r); setSc(r.scope ?? {}); }}>Scope</Button>}
        </span> },
      ]} />
      {sa && <Card className="mt-4"><CardHeader title="Add admin user" /><CardBody className="grid gap-3 md:grid-cols-3">
        <Field label="Name">{(f) => <Input id={f.id} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />}</Field>
        <Field label="Email">{(f) => <Input id={f.id} type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} />}</Field>
        <Field label="Initial password" hint="8+ chars with upper, lower, digit, symbol">{(f) => <Input id={f.id} type="password" autoComplete="new-password" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} />}</Field>
        <div className="flex flex-wrap gap-4 md:col-span-3">{ADMIN_ROLES.map((r) => <Checkbox key={r} label={ROLE_LABELS[r]} checked={n.roles.includes(r)} onChange={(e) => setN({ ...n, roles: e.target.checked ? [...n.roles, r] : n.roles.filter((x) => x !== r) })} />)}</div>
        <div><Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.post('/admin/users', n); setN({ name: '', email: '', password: '', roles: [] }); await q.refetch(); }, 'User created. They must enrol TOTP on first login.')}>Create user</Button></div>
      </CardBody></Card>}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={`Scope: ${edit?.name}`} closeLabel="Close" size="lg"
        footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void run(async () => { await api.put(`/admin/users/${edit!.id}`, { scope: sc }); setEdit(null); await q.refetch(); }, 'Scope saved; the user must sign in again.')}>Save scope</Button></>}>
        <div className="space-y-3">
          <fieldset><legend className="text-sm font-medium">Centres (centre superintendents)</legend>
            <div className="mt-1 grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">{centres.data?.map((c) => <Checkbox key={c.id} label={`${c.exam.code} · ${c.code} ${c.name}, ${c.city}`} checked={!!sc.centreIds?.includes(c.id)} onChange={(e) => setSc({ ...sc, centreIds: e.target.checked ? [...(sc.centreIds ?? []), c.id] : (sc.centreIds ?? []).filter((x) => x !== c.id) })} />)}</div>
          </fieldset>
          <fieldset><legend className="text-sm font-medium">Exams (agencies; leave empty for all)</legend>
            <div className="mt-1 flex flex-wrap gap-3">{[...new Map((centres.data ?? []).map((c) => [c.exam.id, c.exam])).values()].map((e) => <Checkbox key={e.id} label={e.code} checked={!!sc.examIds?.includes(e.id)} onChange={(ev) => setSc({ ...sc, examIds: ev.target.checked ? [...(sc.examIds ?? []), e.id] : (sc.examIds ?? []).filter((x) => x !== e.id) })} />)}</div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <LInput label="Home district (observer conflict check)" value={sc.homeDistrict ?? ''} onChange={(e) => setSc({ ...sc, homeDistrict: e.target.value || undefined })} />
            <LInput label="Agency name" value={sc.agency ?? ''} onChange={(e) => setSc({ ...sc, agency: e.target.value || undefined })} />
          </div>
        </div>
      </Dialog>
    </>
  );
}
