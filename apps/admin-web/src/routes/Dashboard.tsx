import { Card, CardBody, CardHeader, Skeleton, StatCard } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, IndianRupee, UserPlus, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageTitle } from '../components/Shell';
import { api, fmt } from '../lib/api';

interface Summary {
  registrations: { total: number; today: number; submitted: number; drafts: number; blocked: number };
  pending: { documents: number; corrections: number; duplicates: number; tickets: number };
  payments: { collected: number; count: number };
  funnel: Array<{ step: string; count: number }>;
  perExam: Array<{ code: string; title: string; total: number; paid: number; pendingPayment: number }>;
  byState: Array<{ state: string; count: number }>; byCategory: Array<{ category: string; count: number }>; byGender: Array<{ gender: string; count: number }>;
  daily: Array<{ date: string; count: number }>; generatedAt: string;
}
// Chart colours read from the brand tokens so hex values stay defined once.
const css = (v: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(v).trim()})`;

export default function Dashboard() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Summary>('/admin/dashboard'), refetchInterval: 60000 });
  const d = q.data;
  const navy = css('--vtl-navy-rgb'), orange = css('--vtl-orange-rgb'), info = css('--info-rgb'), success = css('--success-rgb'), warning = css('--warning-rgb'), navy600 = css('--vtl-navy-600-rgb');
  const palette = [navy, orange, info, success, warning, navy600];
  if (!d) return <Skeleton className="h-96" />;
  return (
    <>
      <PageTitle title="Dashboard" description={`Updated ${fmt.dt(d.generatedAt)} IST`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Registrations today" value={fmt.n(d.registrations.today)} icon={<UserPlus className="h-5 w-5" />} />
        <StatCard label="Total registrations" value={fmt.n(d.registrations.total)} hint={`${fmt.n(d.registrations.drafts)} in progress`} icon={<Users className="h-5 w-5" />} />
        <StatCard label="OTR submitted" value={fmt.n(d.registrations.submitted)} hint={`${fmt.n(d.registrations.blocked)} blocked`} />
        <StatCard label="Fees collected" value={fmt.inr(d.payments.collected)} hint={`${fmt.n(d.payments.count)} transactions`} icon={<IndianRupee className="h-5 w-5" />} />
        <StatCard label="Pending verification" value={fmt.n(d.pending.documents)} hint={`${d.pending.corrections} corrections · ${d.pending.duplicates} duplicates · ${d.pending.tickets} tickets`} icon={d.pending.duplicates ? <AlertTriangle className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Registrations, last 14 days" /><CardBody className="h-64">
          <ResponsiveContainer><LineChart data={d.daily}><CartesianGrid strokeDasharray="3 3" stroke={css('--vtl-border-rgb')} /><XAxis dataKey="date" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Line type="monotone" dataKey="count" stroke={orange} strokeWidth={2} name="Registrations" /></LineChart></ResponsiveContainer>
        </CardBody></Card>
        <Card><CardHeader title="Profile completion funnel" /><CardBody className="h-64">
          <ResponsiveContainer><BarChart data={d.funnel} layout="vertical" margin={{ left: 30 }}><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="step" fontSize={11} width={80} /><Tooltip /><Bar dataKey="count" fill={navy} name="Candidates" /></BarChart></ResponsiveContainer>
        </CardBody></Card>
        <Card><CardHeader title="Applications per exam" /><CardBody className="h-64">
          <ResponsiveContainer><BarChart data={d.perExam}><XAxis dataKey="code" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Bar dataKey="paid" stackId="a" fill={success} name="Paid / exempt" /><Bar dataKey="pendingPayment" stackId="a" fill={warning} name="Fee pending" /></BarChart></ResponsiveContainer>
        </CardBody></Card>
        <Card><CardHeader title="Registrations by state" /><CardBody className="h-64">
          <ResponsiveContainer><BarChart data={d.byState}><XAxis dataKey="state" fontSize={10} interval={0} angle={-20} textAnchor="end" height={50} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill={info} name="Candidates" /></BarChart></ResponsiveContainer>
        </CardBody></Card>
        <Card><CardHeader title="By category" /><CardBody className="h-64">
          <ResponsiveContainer><PieChart><Pie data={d.byCategory} dataKey="count" nameKey="category" outerRadius={90} label>{d.byCategory.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </CardBody></Card>
        <Card><CardHeader title="By gender" /><CardBody className="h-64">
          <ResponsiveContainer><PieChart><Pie data={d.byGender} dataKey="count" nameKey="gender" innerRadius={50} outerRadius={90} label>{d.byGender.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </CardBody></Card>
      </div>
    </>
  );
}
