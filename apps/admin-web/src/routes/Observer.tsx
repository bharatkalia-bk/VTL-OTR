import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Textarea } from '@vtl/ui';
import { CloudOff, MapPin, RefreshCw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LSelect, StatusBadge, useAction } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { api, errMsg, fmt } from '../lib/api';

interface Assignment { id: string; coiStatus: string; coiNote: string | null; autoCoiFlags: Array<{ code: string; detail: string }>; centre: { name: string; code: string; address: string; city: string; lat: number | null; lng: number | null } | null; exam: { code: string; title: string } | null; shift: { code: string; date: string; startTime: string } | null; reports: Array<{ clientId: string; kind: string; severity: string; capturedAt: string }> }
interface Mine { checklist: Array<{ key: string; label: string }>; assignments: Assignment[] }
interface Queued { clientId: string; assignmentId: string; kind: string; severity: string; payload: Record<string, string | boolean | number | null>; capturedAt: string; lat?: number; lng?: number }
const QKEY = 'vtl.observer.queue';
const loadQ = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QKEY) ?? '[]') as Queued[]; } catch { return []; } };
const saveQ = (q: Queued[]) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* storage full or private */ } };
const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Mobile-first observer app. Reports are queued on the device and synced when online; each has a client id so retries never duplicate. */
export default function Observer() {
  const mine = useQuery({ queryKey: ['observer-me'], queryFn: () => api.get<Mine>('/admin/observer/me'), networkMode: 'offlineFirst' });
  const [aid, setAid] = useState('');
  const a = mine.data?.assignments.find((x) => x.id === aid) ?? mine.data?.assignments[0];
  const [queue, setQueue] = useState<Queued[]>(loadQ);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [text, setText] = useState('');
  const [sev, setSev] = useState('MEDIUM');
  const [coi, setCoi] = useState({ hasConflict: false, note: '', confirm: false });
  const { run, banner, busy } = useAction();

  const sync = async (q = queue) => {
    if (!q.length || !navigator.onLine) return;
    try {
      const r = await api.post<{ accepted: string[]; rejected: Array<{ clientId: string; reason: string }> }>('/admin/observer/sync', { reports: q.slice(0, 200) });
      const done = new Set([...r.accepted, ...r.rejected.filter((x) => x.reason === 'NOT_YOUR_ASSIGNMENT').map((x) => x.clientId)]);
      const left = q.filter((x) => !done.has(x.clientId));
      setQueue(left); saveQ(left);
      setSyncMsg(r.rejected.some((x) => x.reason === 'COI_DECLARATION_PENDING') ? 'Some reports wait for your conflict-of-interest declaration.' : `Synced ${r.accepted.length} report(s).`);
      await mine.refetch();
    } catch (e) { setSyncMsg(`Will retry: ${errMsg(e)}`); }
  };
  useEffect(() => {
    const up = () => { setOnline(true); void sync(loadQ()); };
    const down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    const t = window.setInterval(() => void sync(loadQ()), 30000);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enqueue = (kind: string, payload: Queued['payload'], severity = 'INFO') => {
    if (!a) return;
    const add = (pos?: GeolocationPosition) => {
      const item: Queued = { clientId: uid(), assignmentId: a.id, kind, severity, payload, capturedAt: new Date().toISOString(), ...(pos && { lat: pos.coords.latitude, lng: pos.coords.longitude }) };
      const next = [...loadQ(), item];
      setQueue(next); saveQ(next);
      setSyncMsg(navigator.onLine ? 'Saved. Syncing…' : 'Saved on this device. It will sync when you are back online.');
      void sync(next);
    };
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(add, () => add(), { timeout: 4000, maximumAge: 60000 }); else add();
  };

  if (mine.data && !mine.data.assignments.length) return <Alert tone="info" title="No assignments yet">Your centre assignments will appear here.</Alert>;
  const declared = a && ['DECLARED_CLEAR', 'WAIVED'].includes(a.coiStatus);
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Observer" description={a ? `${a.exam?.code} · ${a.centre?.name} (${a.centre?.code})` : 'Loading…'} />
      {banner}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {online ? <Badge tone="success">Online</Badge> : <Badge tone="warning"><CloudOff className="mr-1 h-3 w-3" aria-hidden />Offline</Badge>}
        <Badge tone={queue.length ? 'warning' : 'neutral'}>{queue.length} waiting to sync</Badge>
        <Button size="sm" variant="ghost" onClick={() => void sync()} disabled={!queue.length}><RefreshCw className="h-4 w-4" aria-hidden />Sync now</Button>
        {syncMsg && <span className="text-ink-muted" role="status">{syncMsg}</span>}
      </div>
      {mine.data && mine.data.assignments.length > 1 && <div className="mb-3"><LSelect label="Assignment" value={a?.id ?? ''} onChange={(e) => setAid(e.target.value)}>{mine.data.assignments.map((x) => <option key={x.id} value={x.id}>{x.exam?.code} · {x.centre?.name}</option>)}</LSelect></div>}
      {a && (
        <div className="space-y-4">
          <Card><CardHeader title="Centre" actions={<StatusBadge s={a.coiStatus} />} />
            <CardBody className="space-y-2 text-sm">
              <p>{a.centre?.address}, {a.centre?.city}</p>
              {a.shift && <p>Shift {a.shift.code} · {fmt.d(a.shift.date)} · {a.shift.startTime} IST</p>}
              {a.centre && <a className="inline-flex items-center gap-1 text-info underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.centre.lat !== null ? `${a.centre.lat},${a.centre.lng}` : `${a.centre.name}, ${a.centre.address}, ${a.centre.city}`)}`}><MapPin className="h-4 w-4" aria-hidden />Directions</a>}
            </CardBody>
          </Card>
          {!declared && (
            <Card><CardHeader title="Conflict of interest declaration" description="Required before you can file reports." />
              <CardBody className="space-y-3">
                {a.autoCoiFlags.map((f) => <Alert key={f.code} tone="warning">{f.detail}</Alert>)}
                {a.coiStatus === 'CONFLICT' ? <Alert tone="danger">You declared a conflict. The exam administrator will reassign or waive.</Alert> : (
                  <>
                    <Checkbox label="A relative or close associate of mine is appearing at this centre" checked={coi.hasConflict} onChange={(e) => setCoi({ ...coi, hasConflict: e.target.checked })} />
                    <Textarea aria-label="Details" placeholder="Details (optional)" value={coi.note} onChange={(e) => setCoi({ ...coi, note: e.target.value })} />
                    <Checkbox label="I confirm this declaration is true" checked={coi.confirm} onChange={(e) => setCoi({ ...coi, confirm: e.target.checked })} />
                    <Button variant="primary" loading={busy} disabled={!coi.confirm} onClick={() => void run(async () => { await api.post(`/admin/observer/assignments/${a.id}/coi`, { hasConflict: coi.hasConflict, note: coi.note || undefined, confirm: true }); await mine.refetch(); void sync(loadQ()); }, 'Declaration recorded.')}>Submit declaration</Button>
                  </>
                )}
              </CardBody>
            </Card>
          )}
          <Card><CardHeader title="Arrival and checklist" />
            <CardBody className="space-y-2">
              <Button size="sm" onClick={() => enqueue('ARRIVAL', { text: 'Reached centre' })}><MapPin className="h-4 w-4" aria-hidden />I have reached the centre</Button>
              {mine.data?.checklist.map((c) => <Checkbox key={c.key} label={c.label} checked={!!checks[c.key]} onChange={(e) => setChecks({ ...checks, [c.key]: e.target.checked })} />)}
              <Button variant="secondary" onClick={() => { enqueue('CHECKLIST', { ...Object.fromEntries((mine.data?.checklist ?? []).map((c) => [c.key, !!checks[c.key]])), summary: `${Object.values(checks).filter(Boolean).length}/${mine.data?.checklist.length} items OK` }); }}>Save checklist</Button>
            </CardBody>
          </Card>
          <Card><CardHeader title="Report an incident" description="Unfair means, impersonation, paper leak, disruption…" />
            <CardBody className="space-y-2">
              <LSelect label="Severity" value={sev} onChange={(e) => setSev(e.target.value)}>{['LOW', 'MEDIUM', 'HIGH'].map((s) => <option key={s}>{s}</option>)}</LSelect>
              <Textarea aria-label="What happened" placeholder="What happened, where, roll numbers if known" value={text} onChange={(e) => setText(e.target.value)} />
              <Button variant="primary" disabled={text.length < 5} onClick={() => { enqueue('INCIDENT', { text }, sev); setText(''); }}><Send className="h-4 w-4" aria-hidden />File report</Button>
            </CardBody>
          </Card>
          <Card><CardHeader title="Final report" />
            <CardBody><Button onClick={() => enqueue('FINAL', { text: 'Exam concluded; materials sealed and dispatched' })}>Exam concluded: submit final report</Button></CardBody>
          </Card>
          <Card><CardHeader title="Synced reports" />
            <CardBody><ul className="space-y-1 text-sm">{a.reports.map((r) => <li key={r.clientId} className="flex items-center gap-2"><StatusBadge s={r.severity === 'HIGH' ? 'HIGH' : r.kind} />{fmt.dt(r.capturedAt)}</li>)}{!a.reports.length && <li className="text-ink-muted">None yet</li>}</ul></CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
