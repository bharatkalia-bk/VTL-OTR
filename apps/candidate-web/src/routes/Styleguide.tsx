import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, DataTable, Dialog, EmptyState, Field, FileUpload, Input, LivePhotoCapture, Logo, OtpInput, ProgressBar, RadioGroup, Select, SignaturePad, Spinner, StatCard, Stepper, Tabs, Textarea, Timeline } from '@vtl/ui';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page, PageHeader } from '../components/Layout';

const swatches = [
  ['--vtl-navy', 'bg-navy', 'Primary'], ['--vtl-orange', 'bg-orange', 'Accent'], ['--vtl-navy-700', 'bg-navy-700', 'Hover on navy'], ['--vtl-orange-50', 'bg-orange-50', 'Light accent'],
  ['--vtl-surface', 'bg-surface', 'Page'], ['--vtl-border', 'bg-border', 'Borders'], ['--success', 'bg-success', 'Status'], ['--warning', 'bg-warning', 'Status'], ['--danger', 'bg-danger', 'Status'], ['--info', 'bg-info', 'Status'],
] as const;

/** Living style guide for the VTL design system (route: /styleguide). Demo copy here is intentionally English-only. */
export default function Styleguide() {
  const { t } = useTranslation();
  const [otp, setOtp] = useState('');
  const [radio, setRadio] = useState('GEN');
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [dialog, setDialog] = useState(false);
  const [camera, setCamera] = useState(false);
  return (
    <>
      <PageHeader title={t('styleguide.title')} description={t('styleguide.subtitle')} />
      <Page>
        <div className="space-y-6">
          <Card><CardHeader title="Brand" /><CardBody className="flex flex-wrap items-center gap-8">
            <div className="p-[10px]"><Logo height={48} /></div>
            <div className="rounded bg-navy p-[10px]"><Logo variant="white" height={48} /></div>
            <Logo variant="mark" height={48} />
          </CardBody></Card>
          <Card><CardHeader title="Colour tokens" description="Defined once in packages/ui/src/styles/tokens.css" /><CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {swatches.map(([token, cls, use]) => <div key={token}><div className={`h-14 rounded border border-border ${cls}`} /><p className="mt-1 text-xs font-semibold">{token}</p><p className="text-xs text-ink-muted">{use}</p></div>)}
          </CardBody></Card>
          <Card><CardHeader title="Typography" /><CardBody className="space-y-2">
            <h1 className="text-3xl font-bold">Plus Jakarta Sans heading</h1><h2 className="text-xl font-semibold">Section heading</h2>
            <p>Inter body text for forms and content. <span className="tabular-nums">VTL-OTR-2026-00001236 · ₹ 1,00,000 · 20-11-2026</span></p>
            <p lang="hi" className="font-hindi">नोटो संस देवनागरी: एकबारीय पंजीकरण मंच</p>
          </CardBody></Card>
          <Card><CardHeader title="Buttons" /><CardBody className="flex flex-wrap gap-2">
            <Button variant="primary">Primary CTA</Button><Button variant="secondary">Secondary</Button><Button>Outline</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Danger</Button><Button variant="link">Link</Button><Button loading>Loading</Button><Button disabled>Disabled</Button>
          </CardBody></Card>
          <Card><CardHeader title="Form controls" /><CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" hint="As per Class 10 certificate" required>{(f) => <Input id={f.id} placeholder="RAVI KUMAR" />}</Field>
            <Field label="Mobile" error="Enter a valid 10-digit mobile number" required>{(f) => <Input id={f.id} aria-invalid defaultValue="12345" />}</Field>
            <Field label="State">{(f) => <Select id={f.id}><option>Uttar Pradesh</option><option>Bihar</option></Select>}</Field>
            <Field label="Message">{(f) => <Textarea id={f.id} />}</Field>
            <RadioGroup name="sg-cat" legend="Category" value={radio} onChange={setRadio} options={[{ value: 'GEN', label: 'General' }, { value: 'OBC', label: 'OBC' }, { value: 'SC', label: 'SC' }]} />
            <Checkbox label="I agree to the declaration" description="Helper text under a checkbox" />
            <div><p className="mb-2 text-sm font-medium">OTP input</p><OtpInput label="OTP" value={otp} onChange={setOtp} /></div>
            <FileUpload label="Certificate (PDF)" accept="application/pdf" maxBytes={512000} onUpload={async () => undefined} labels={{ choose: 'Choose PDF', uploading: 'Uploading…', remove: 'Remove', tooLarge: 'Too large', wrongType: 'PDF only' }} />
          </CardBody></Card>
          <Card><CardHeader title="Feedback" /><CardBody className="space-y-3">
            <Alert tone="info" title="Information">Neutral guidance.</Alert><Alert tone="success" title="Success">Saved successfully.</Alert><Alert tone="warning" title="Warning">Last date is tomorrow.</Alert><Alert tone="danger" title="Error">Something needs attention.</Alert>
            <div className="flex flex-wrap gap-2"><Badge>Neutral</Badge><Badge tone="brand">Brand</Badge><Badge tone="success">Paid</Badge><Badge tone="warning">Pending</Badge><Badge tone="danger">Rejected</Badge><Badge tone="info">Info</Badge></div>
            <ProgressBar value={66} label="Profile completion" /><Spinner label="Loading" />
          </CardBody></Card>
          <Card><CardHeader title="Navigation & data" /><CardBody className="space-y-5">
            <Stepper steps={[{ key: '1', label: 'Personal', done: true }, { key: '2', label: 'Category', done: true }, { key: '3', label: 'Address' }, { key: '4', label: 'Education' }, { key: '5', label: 'Photo' }]} current={2} stepOfLabel={(c, n) => `Step ${c} of ${n}`} />
            <Tabs label="Demo tabs" value={tab} onChange={setTab} tabs={[{ value: 'a', label: 'First' }, { value: 'b', label: 'Second' }]} />
            <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Registrations today" value="12,480" hint="+8% vs yesterday" icon={<Users className="h-5 w-5" />} /><StatCard label="Applications" value="3,21,904" /><StatCard label="Fees collected" value="₹ 1.2 Cr" /></div>
            <DataTable caption="Demo" rowKey={(r) => r.id} rows={[{ id: '1', name: 'RAVI KUMAR', status: 'Paid' }, { id: '2', name: 'PRIYA SHARMA', status: 'Pending' }]} columns={[{ key: 'n', header: 'Name', cell: (r) => r.name }, { key: 's', header: 'Status', cell: (r) => <Badge tone={r.status === 'Paid' ? 'success' : 'warning'}>{r.status}</Badge> }]} />
            <Timeline items={[{ title: 'Submitted', at: '20 Nov 2026, 10:00', tone: 'done' }, { title: 'Payment pending', tone: 'current' }, { title: 'Admit card', tone: 'todo' }]} />
            <EmptyState title="No applications yet" description="Empty states explain what to do next." />
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <Dialog open={dialog} onClose={() => setDialog(false)} title="Confirm submission" closeLabel="Close" footer={<Button variant="primary" onClick={() => setDialog(false)}>Confirm</Button>}><p className="text-sm">Dialogs use the native dialog element for focus trapping.</p></Dialog>
          </CardBody></Card>
          <Card><CardHeader title="Live photo capture" description="Camera only. No file input. Uses MediaPipe in-browser checks + liveness." /><CardBody>
            {camera ? <LivePhotoCapture candidateName="DEMO CANDIDATE" startSession={async () => 'styleguide-demo-session'} onComplete={async () => undefined} /> : <Button variant="secondary" onClick={() => setCamera(true)}>Load camera component</Button>}
          </CardBody></Card>
          <Card><CardHeader title="Signature" /><CardBody><SignaturePad onComplete={async () => undefined} /></CardBody></Card>
        </div>
      </Page>
    </>
  );
}
