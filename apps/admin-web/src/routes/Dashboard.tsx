import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, DataTable, GradientTile, MiniStat, Skeleton } from '@vtl/ui';
import { AlertTriangle, Award, BadgeCheck, ClipboardCheck, Headset, IndianRupee, ScanLine, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';

interface Summary {
  registrations: { total: number; today: number; submitted: number; drafts: number; blocked: number };
  pending: { documents: number; corrections: number; duplicates: number; tickets: number };
  payments: { collected: number; count: number };
  funnel: Array<{ step: string; count: number }>;
  perExam: Array<{ code: string; title: string; total: number; paid: number; pendingPayment: number }>;
  byState: Array<{ state: string; count: number }>; byCategory: Array<{ category: string; count: number }>; byGender: Array<{ gender: string; count: number }>;
  daily: Array<{ date: string; count: number; submitted: number }>;
  recent: Array<{ id: string; action: string; entity: string; actor: string; at: string }>;
  lifecycle: { present: number; objectionsPending: number; biometricOpen: number; exceptionsOpen: number; resultsAwaitingApproval: number; selected: number; debarmentsProposed: number };
  generatedAt: string;
}
// Chart colours read from the brand tokens so hex values stay defined once.
const css = (v: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(v).trim()})`;
const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const ACTIVITY_TONE: Array<[RegExp, string]> = [[/REJECT|FAIL|BLOCK|DEBAR/, 'bg-danger'], [/APPROV|SUCCESS|PUBLISH|VERIF/, 'bg-success'], [/PAYMENT|FEE/, 'bg-orange-600'], [/.*/, 'bg-navy-600']];

export default function Dashboard() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Summary>('/admin/dashboard'), refetchInterval: 60000 });
  const d = q.data;
  if (!d) return <Skeleton className="h-96" />;
  const navy = css('--vtl-navy-rgb'), orange = css('--vtl-orange-rgb'), navy600 = css('--vtl-navy-600-rgb'), info = css('--info-rgb'), success = css('--success-rgb'), warning = css('--warning-rgb');
  const palette = [orange, navy, info, success, warning, navy600];
  const catTotal = d.byCategory.reduce((a, b) => a + b.count, 0) || 1;
  const cats = [...d.byCategory].sort((a, b) => b.count - a.count);
  const pendingTotal = d.pending.documents + d.pending.corrections + d.pending.duplicates;
  const attention = [
    { label: 'Objections awaiting decision', n: d.lifecycle.objectionsPending, to: '/answer-keys' },
    { label: 'Results awaiting approval', n: d.lifecycle.resultsAwaitingApproval, to: '/results' },
    { label: 'Open biometric alerts', n: d.lifecycle.biometricOpen, to: '/exam-day' },
    { label: 'Open technical exceptions', n: d.lifecycle.exceptionsOpen, to: '/exam-day' },
    { label: 'Debarments awaiting approval', n: d.lifecycle.debarmentsProposed, to: '/debarments' },
  ];
  return (
    <>
      <PageTitle title="Dashboard" description={`Overview of registrations and the exam lifecycle · updated ${fmt.dt(d.generatedAt)} IST`} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardBody>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h2 className="font-heading text-lg font-bold">Registrations</h2><p className="text-sm text-ink-muted">Last 14 days</p></div>
              <div className="flex gap-4 text-xs" aria-hidden><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange" />Registered</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-navy" />OTR submitted</span></div>
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-[200px_1fr]">
              <div className="space-y-4">
                <div><p className="font-heading text-3xl font-bold tabular-nums">{fmt.n(d.registrations.total)}</p><p className="text-sm text-ink-muted">Total registrations</p></div>
                <div><p className="font-heading text-3xl font-bold tabular-nums">{fmt.n(d.registrations.submitted)}</p><p className="text-sm text-ink-muted">OTR IDs issued</p></div>
                <Link to="/reports"><Button variant="primary" size="sm">Reports & exports</Button></Link>
              </div>
              <div className="h-56" role="img" aria-label="Area chart of daily registrations and OTR submissions over the last 14 days">
                <ResponsiveContainer>
                  <AreaChart data={d.daily} margin={{ left: -20, right: 8 }}>
                    <defs>
                      <linearGradient id="gReg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={orange} stopOpacity={0.45} /><stop offset="100%" stopColor={orange} stopOpacity={0.02} /></linearGradient>
                      <linearGradient id="gSub" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={navy} stopOpacity={0.35} /><stop offset="100%" stopColor={navy} stopOpacity={0.02} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={css('--vtl-border-rgb')} vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" name="Registered" stroke={orange} strokeWidth={2.5} fill="url(#gReg)" />
                    <Area type="monotone" dataKey="submitted" name="OTR submitted" stroke={navy} strokeWidth={2.5} fill="url(#gSub)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardBody>
          <div className="grid gap-4 border-t border-border px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Fees collected" value={fmt.inr(d.payments.collected)} icon={<IndianRupee />} tone="orange" />
            <MiniStat label="Payments" value={fmt.n(d.payments.count)} icon={<ClipboardCheck />} tone="navy" />
            <MiniStat label="Present at centres" value={fmt.n(d.lifecycle.present)} icon={<ScanLine />} tone="info" />
            <MiniStat label="Selected (accepted)" value={fmt.n(d.lifecycle.selected)} icon={<BadgeCheck />} tone="success" />
          </div>
        </Card>
        <Card>
          <CardBody>
            <h2 className="font-heading text-lg font-bold">Candidates by category</h2>
            <div className="mx-auto h-52 max-w-xs" role="img" aria-label={`Donut chart: ${cats.map((c) => `${c.category} ${Math.round((c.count / catTotal) * 100)}%`).join(', ')}`}>
              <ResponsiveContainer><PieChart><Pie data={cats} dataKey="count" nameKey="category" innerRadius={58} outerRadius={86} paddingAngle={2} stroke="none">{cats.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
            </div>
            <ul className="mt-2 grid grid-cols-3 gap-2 text-center">
              {cats.slice(0, 3).map((c, i) => (
                <li key={c.category}><p className="font-heading text-2xl font-bold">{Math.round((c.count / catTotal) * 100)}<sup className="text-sm">%</sup></p><p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted"><span className="h-2 w-2 rounded-full" style={{ background: palette[i] }} aria-hidden />{c.category.replace('_NCL', '')}</p></li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GradientTile tone="navy" label="Registrations today" value={fmt.n(d.registrations.today)} hint={`${fmt.n(d.registrations.drafts)} profiles in progress`} icon={<UserPlus />} bars={d.daily.slice(-8).map((x) => x.count)} />
        <GradientTile tone="orange" label="Fees collected" value={fmt.inr(d.payments.collected)} hint={`${fmt.n(d.payments.count)} transactions`} icon={<IndianRupee />} />
        <GradientTile tone="dusk" label="Pending verification" value={fmt.n(pendingTotal)} hint={`${d.pending.documents} documents · ${d.pending.corrections} corrections · ${d.pending.duplicates} duplicates`} icon={d.pending.duplicates ? <AlertTriangle /> : <ClipboardCheck />} />
        <GradientTile tone="steel" label="Open helpdesk tickets" value={fmt.n(d.pending.tickets)} hint="Web, chat, IVR and phone" icon={<Headset />} bars={d.daily.slice(-8).map((x) => x.submitted)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card>
          <CardHeader title="Recent activity" description="Latest audited actions" />
          <CardBody>
            {d.recent.length === 0 ? <p className="text-sm text-ink-muted">No activity yet.</p> : (
              <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[94px] before:top-2 before:w-px before:bg-border">
                {d.recent.map((r) => (
                  <li key={r.id} className="relative grid grid-cols-[80px_28px_1fr] items-start gap-2">
                    <span className="pt-1 text-right text-xs text-ink-muted">{ago(r.at)}</span>
                    <span className={`relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white ring-4 ring-white ${ACTIVITY_TONE.find(([re]) => re.test(r.action))![1]}`} aria-hidden><Users className="h-3 w-3" /></span>
                    <div><p className="text-sm font-semibold">{r.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p><p className="text-xs text-ink-muted">{r.actor} · {r.entity}</p></div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Applications per exam" description="Submitted applications and fee status" actions={<Link to="/exams"><Button size="sm">All exams</Button></Link>} />
            <CardBody>
              <DataTable caption="Applications per exam" rows={d.perExam} rowKey={(r) => r.code} empty="No published exams" columns={[
                { key: 'c', header: 'Exam', cell: (r) => <span className="font-semibold">{r.code}</span> },
                { key: 't', header: 'Title', cell: (r) => r.title },
                { key: 'n', header: 'Applications', numeric: true, cell: (r) => fmt.n(r.total) },
                { key: 'p', header: 'Paid / exempt', numeric: true, cell: (r) => fmt.n(r.paid) },
                { key: 's', header: 'Fee status', cell: (r) => r.pendingPayment ? <Badge tone="warning">{r.pendingPayment} pending</Badge> : <Badge tone="success">Clear</Badge> },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Needs attention" description="Exam lifecycle queues" />
            <ul className="divide-y divide-border">
              {attention.map((a) => (
                <li key={a.label}><Link to={a.to} className="flex items-center justify-between px-6 py-3 text-sm hover:bg-surface"><span className="flex items-center gap-2"><Award className="h-4 w-4 text-orange-600" aria-hidden />{a.label}</span><Badge tone={a.n ? 'warning' : 'success'}>{a.n}</Badge></Link></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
