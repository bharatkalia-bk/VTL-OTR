import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, CardBody, CardHeader, Input, Skeleton } from '@vtl/ui';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageTitle } from '../components/Shell';
import { api, errMsg, fmt } from '../lib/api';

interface Ev { at: string; stage: string; title: string; detail?: string; tone?: 'success' | 'warning' | 'danger' | 'info' }
const dot = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', info: 'bg-navy-600' } as const;

export default function Journey() {
  const { term } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(term ?? '');
  const r = useQuery({ queryKey: ['journey', term], queryFn: () => api.get<{ candidate: { id: string; otrId: string | null; status: string }; events: Ev[] }>(`/admin/journey/${encodeURIComponent(term!)}`), enabled: !!term, retry: false });
  const go = (e: FormEvent) => { e.preventDefault(); if (q.trim()) nav(`/journey/${encodeURIComponent(q.trim())}`); };
  const stages = [...new Set(r.data?.events.map((e) => e.stage) ?? [])];
  return (
    <>
      <PageTitle title="Journey trace" description="Everything that happened to one candidate, from registration to appointment" />
      <form onSubmit={go} className="mb-4 flex max-w-xl gap-2" role="search"><Input aria-label="OTR ID" value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder="VTL-OTR-2026-00001236" /><Button type="submit" variant="primary"><Search className="h-4 w-4" aria-hidden />Trace</Button></form>
      {r.isLoading && term && <Skeleton className="h-64" />}
      {r.error && <Alert tone="danger">{errMsg(r.error)}</Alert>}
      {r.data && (
        <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
          <Card><CardHeader title={r.data.candidate.otrId ?? 'Draft profile'} description={`${r.data.events.length} events`} actions={<Link className="text-sm text-info underline" to={`/candidates/${r.data.candidate.id}`}>Open profile</Link>} />
            <CardBody>
              <ol className="relative space-y-4 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-px before:bg-border">
                {r.data.events.map((e, i) => (
                  <li key={i} className="relative pl-7">
                    <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white ${dot[e.tone ?? 'info']}`} aria-hidden />
                    <p className="text-xs text-ink-muted">{fmt.dt(e.at)} · {e.stage}</p>
                    <p className="text-sm font-semibold first-letter:uppercase">{e.title}</p>
                    {e.detail && <p className="text-xs text-ink-muted">{e.detail}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
          <Card><CardHeader title="Stages reached" /><CardBody><ul className="space-y-1 text-sm">{stages.map((s) => <li key={s} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange" aria-hidden />{s}</li>)}</ul></CardBody></Card>
        </div>
      )}
    </>
  );
}
