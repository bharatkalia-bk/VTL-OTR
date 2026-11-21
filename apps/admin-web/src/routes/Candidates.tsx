import { Badge, Button, CursorPager, DataTable, Input, Select } from '@vtl/ui';
import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge, useCursorList } from '../components/kit';
import { PageTitle } from '../components/Shell';
import { fmt, qs } from '../lib/api';

interface Row { id: string; otrId: string | null; status: string; name: string | null; mobile: string; category: string | null; stateCode: string | null; completion: number; duplicatePhoto: boolean; createdAt: string }

export default function Candidates() {
  const nav = useNavigate();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = useCursorList<Row>(['candidates', q, status], (c) => `/admin/candidates${qs({ q, status, cursor: c, limit: 25 })}`);
  const submit = (e: FormEvent) => { e.preventDefault(); setQ(input.trim()); };
  return (
    <>
      <PageTitle title="Candidates" description="Search by OTR ID, mobile, email or name. Lookups use blind indexes; plaintext is never scanned." />
      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2" role="search">
        <Input aria-label="Search candidates" className="max-w-md" placeholder="VTL-OTR-2026-…, 98xxxxxxxx, email or name" value={input} onChange={(e) => setInput(e.target.value)} data-testid="cand-search" />
        <Select aria-label="Status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option>DRAFT</option><option>SUBMITTED</option><option>BLOCKED</option></Select>
        <Button type="submit" variant="secondary"><Search className="h-4 w-4" aria-hidden />Search</Button>
      </form>
      <DataTable caption="Candidates" rows={list.items} rowKey={(r) => r.id} onRowClick={(r) => nav(`/candidates/${r.id}`)} empty={list.isLoading ? 'Loading…' : 'No candidates found'}
        columns={[
          { key: 'otr', header: 'OTR ID', cell: (r) => <span className="tabular-nums">{r.otrId ?? '—'}</span> },
          { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'mobile', header: 'Mobile', cell: (r) => <span className="tabular-nums">{r.mobile}</span> },
          { key: 'cat', header: 'Category', cell: (r) => r.category ?? '—' },
          { key: 'state', header: 'State', cell: (r) => r.stateCode ?? '—' },
          { key: 'comp', header: 'Profile', numeric: true, cell: (r) => `${r.completion}%` },
          { key: 'status', header: 'Status', cell: (r) => <span className="flex gap-1"><StatusBadge s={r.status} />{r.duplicatePhoto && <Badge tone="danger">Dup photo</Badge>}</span> },
          { key: 'created', header: 'Registered', cell: (r) => <span className="tabular-nums">{fmt.d(r.createdAt)}</span> },
        ]} />
      <CursorPager hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onMore={() => void list.fetchNextPage()} label="Load more" />
    </>
  );
}
