import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, DataTable, GradientTile, Input, Textarea } from '@vtl/ui';
import { ShieldAlert, UserCheck, UserX, Users } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { LInput, LSelect, StatusBadge, useAction } from '../components/kit';
import { QrScanner } from '../components/QrScanner';
import { PageTitle } from '../components/Shell';
import { api, errMsg, fmt } from '../lib/api';

interface Centre { id: string; code: string; name: string; address: string; city: string; exam: { id: string; code: string; titleEn: string }; allotted: number; present: number; absent: number }
interface Look { admitCardId: string; rollNo: string; qrValid: boolean | null; exam: { id: string; code: string; title: string }; candidate: { name: string; fatherName: string; dob: string; gender: string; category: string; otrId: string; photo: string | null; signature: string | null }; centre: { id: string; name: string } | null; shift: { code: string; date: string; startTime: string } | null; attendance: { status: string; markedAt: string } | null; debarred: { reason: string; until: string | null } | null }
interface Rost { admitCardId: string; rollNo: string; name: string; shift: string | null; attendance: string | null; faceCheck: string | null; markedAt: string | null }

export default function CentreDesk() {
  const centres = useQuery({ queryKey: ['desk-centres'], queryFn: () => api.get<Centre[]>('/admin/centre/centres') });
  const [cid, setCid] = useState('');
  const centre = centres.data?.find((c) => c.id === cid) ?? centres.data?.[0];
  const roster = useQuery({ queryKey: ['roster', centre?.id], queryFn: () => api.get<Rost[]>(`/admin/centre/centres/${centre!.id}/roster`), enabled: !!centre });
  const [look, setLook] = useState<Look | null>(null);
  const [lookErr, setLookErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | undefined>();
  const [roll, setRoll] = useState('');
  const [exc, setExc] = useState({ kind: 'SYSTEM_FAILURE', minutesLost: '0', rollNos: '', description: '' });
  const { run, banner, busy } = useAction();
  const refresh = () => Promise.all([roster.refetch(), centres.refetch()]);

  const lookup = useCallback(async (body: { token?: string; rollNo?: string }) => {
    setLookErr(null); setLook(null); setToken(body.token);
    try { setLook(await api.post<Look>('/admin/centre/lookup', { ...body, examId: body.rollNo ? centre?.exam.id : undefined })); } catch (e) { setLookErr(errMsg(e)); }
  }, [centre?.exam.id]);
  const onScan = useCallback((t: string) => { void lookup({ token: t }); }, [lookup]);
  const mark = (status: 'PRESENT' | 'ABSENT', faceCheck: 'MATCH' | 'MISMATCH' | 'SKIPPED') => run(async () => {
    await api.post('/admin/centre/attendance', { ...(token ? { token } : { rollNo: look!.rollNo }), status, faceCheck });
    setLook(null); setRoll(''); await refresh();
  }, status === 'PRESENT' ? (faceCheck === 'MISMATCH' ? 'Marked present with face mismatch: a biometric alert was raised.' : 'Admitted.') : 'Marked absent.');

  if (centres.data && centres.data.length === 0) return <Alert tone="warning" title="No centre assigned">Ask the exam administrator to add your centre to your account scope.</Alert>;
  return (
    <>
      <PageTitle title="Centre desk" description={centre ? `${centre.exam.code} · ${centre.name} (${centre.code}), ${centre.city}` : 'Loading…'}
        actions={centres.data && centres.data.length > 1 ? <LSelect label="Centre" value={centre?.id ?? ''} onChange={(e) => setCid(e.target.value)}>{centres.data.map((c) => <option key={c.id} value={c.id}>{c.exam.code} · {c.code} {c.name}</option>)}</LSelect> : undefined} />
      {banner}
      {centre && (
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <GradientTile tone="navy" label="Allotted" value={fmt.n(centre.allotted)} icon={<Users />} />
          <GradientTile tone="steel" label="Present" value={fmt.n(centre.present)} hint={`${centre.allotted ? Math.round((centre.present / centre.allotted) * 100) : 0}% attendance`} icon={<UserCheck />} />
          <GradientTile tone="orange" label="Absent" value={fmt.n(centre.absent)} icon={<UserX />} />
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
        <div className="space-y-4">
          <Card><CardHeader title="Verify candidate" description="Scan the admit card QR or type the roll number" />
            <CardBody className="space-y-3">
              <QrScanner onScan={onScan} />
              <form className="flex gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (roll) void lookup({ rollNo: roll.trim() }); }}>
                <Input aria-label="Roll number" placeholder="Roll number" value={roll} onChange={(e) => setRoll(e.target.value.toUpperCase())} className="tabular-nums" />
                <Button type="submit">Find</Button>
              </form>
              {lookErr && <Alert tone="danger">{lookErr}</Alert>}
            </CardBody>
          </Card>
          {centre && (
            <Card><CardHeader title="Report technical exception" />
              <CardBody className="space-y-2">
                <LSelect label="Type" value={exc.kind} onChange={(e) => setExc({ ...exc, kind: e.target.value })}>{['SYSTEM_FAILURE', 'POWER', 'NETWORK', 'OMR_DAMAGED', 'OTHER'].map((k) => <option key={k} value={k}>{k.replace('_', ' ').toLowerCase()}</option>)}</LSelect>
                <LInput label="Minutes lost" type="number" min={0} value={exc.minutesLost} onChange={(e) => setExc({ ...exc, minutesLost: e.target.value })} />
                <LInput label="Affected roll numbers (comma separated)" value={exc.rollNos} onChange={(e) => setExc({ ...exc, rollNos: e.target.value })} />
                <Textarea aria-label="What happened" placeholder="What happened" value={exc.description} onChange={(e) => setExc({ ...exc, description: e.target.value })} />
                <Button loading={busy} disabled={exc.description.length < 10} onClick={() => void run(async () => { await api.post(`/admin/centre/centres/${centre.id}/exceptions`, { kind: exc.kind, minutesLost: Number(exc.minutesLost), rollNos: exc.rollNos.split(',').map((s) => s.trim()).filter(Boolean), description: exc.description }); setExc({ ...exc, description: '', rollNos: '' }); }, 'Reported to the exam administrator.')}>Report</Button>
              </CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {look && (
            <Card className={look.debarred ? 'border-danger' : ''}>
              <CardHeader title={look.candidate.name} description={`Roll ${look.rollNo} · ${look.candidate.otrId}`} actions={look.qrValid ? <Badge tone="success">QR genuine</Badge> : <Badge>Manual entry</Badge>} />
              <CardBody className="space-y-3">
                {look.debarred && <Alert tone="danger" title="Debarred: do not admit">{look.debarred.reason}</Alert>}
                {look.attendance?.status === 'PRESENT' && <Alert tone="warning" title="Already admitted">Marked present at {fmt.dt(look.attendance.markedAt)}. Verify identity carefully: possible impersonation.</Alert>}
                <div className="flex flex-wrap gap-4">
                  {look.candidate.photo ? <img src={look.candidate.photo} alt={`Photograph of ${look.candidate.name}`} className="h-44 w-36 rounded border-2 border-navy object-cover" /> : <div className="flex h-44 w-36 items-center justify-center rounded bg-surface text-xs">No photo</div>}
                  <dl className="grid flex-1 grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-sm">
                    <dt className="text-ink-muted">Father</dt><dd>{look.candidate.fatherName}</dd>
                    <dt className="text-ink-muted">Date of birth</dt><dd>{fmt.d(look.candidate.dob)}</dd>
                    <dt className="text-ink-muted">Gender</dt><dd>{look.candidate.gender}</dd>
                    <dt className="text-ink-muted">Shift</dt><dd>{look.shift ? `${look.shift.code} · ${look.shift.startTime}` : '-'}</dd>
                    <dt className="text-ink-muted">Signature</dt><dd>{look.candidate.signature && <img src={look.candidate.signature} alt="Signature on record" className="h-10 bg-white" />}</dd>
                  </dl>
                </div>
                <p className="text-sm">Compare the face with the photograph above and with the photo ID before admitting.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" loading={busy} disabled={!!look.debarred} onClick={() => void mark('PRESENT', 'MATCH')}><UserCheck className="h-4 w-4" aria-hidden />Face matches: admit</Button>
                  <Button variant="danger" loading={busy} disabled={!!look.debarred} onClick={() => void mark('PRESENT', 'MISMATCH')}><ShieldAlert className="h-4 w-4" aria-hidden />Mismatch: admit and flag</Button>
                  <Button onClick={() => void mark('ABSENT', 'SKIPPED')}>Mark absent</Button>
                </div>
              </CardBody>
            </Card>
          )}
          {centre && (
            <Card>
              <CardHeader title="Roster" actions={<div className="flex gap-2"><a href={`/api/v1/admin/centre/centres/${centre.id}/roll-sheet`} target="_blank" rel="noreferrer"><Button size="sm">Print roll sheet</Button></a><Button size="sm" variant="secondary" loading={busy} onClick={() => void run(async () => { await api.post(`/admin/centre/centres/${centre.id}/close`, {}); await refresh(); }, 'Gate closed: remaining candidates marked absent.')}>Close gate</Button></div>} />
              <CardBody>
                <DataTable caption="Roster" rows={roster.data ?? []} rowKey={(r) => r.admitCardId} empty="No candidates" columns={[
                  { key: 'r', header: 'Roll no.', cell: (r) => <span className="tabular-nums">{r.rollNo}</span> }, { key: 'n', header: 'Name', cell: (r) => r.name }, { key: 's', header: 'Shift', cell: (r) => r.shift ?? '-' },
                  { key: 'a', header: 'Attendance', cell: (r) => (r.attendance ? <StatusBadge s={r.attendance} /> : <span className="text-xs text-ink-muted">Awaited</span>) },
                  { key: 'f', header: 'Face', cell: (r) => (r.faceCheck && r.faceCheck !== 'SKIPPED' ? <StatusBadge s={r.faceCheck} /> : '-') }, { key: 't', header: 'Time', cell: (r) => <span className="text-xs">{r.markedAt ? fmt.dt(r.markedAt) : ''}</span> },
                ]} />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
