import { TICKET_CATEGORIES } from '@vtl/shared';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, FileUpload, Input, Select, Textarea } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Captcha, type CaptchaValue } from '../components/Captcha';
import { Page, PageHeader } from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/forms';
import { fmtDateTime } from '../lib/format';

interface Ticket { id: string; ticketNo: string; category: string; subject: string; status: string; createdAt: string; updatedAt: string }
interface TicketDetail extends Ticket { messages: Array<{ id: string; authorType: string; message: string; createdAt: string }> }
const tone = (s: string) => (s === 'RESOLVED' || s === 'CLOSED' ? 'success' : s === 'IN_PROGRESS' ? 'info' : 'warning') as 'success' | 'info' | 'warning';

export default function Helpdesk() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={t('helpdesk.title')} description={t('helpdesk.subtitle')} />
      <Page>{user ? <MyTickets /> : <PublicTicket />}</Page>
    </>
  );
}

function NewTicketFields({ value, onChange }: { value: { category: string; subject: string; message: string }; onChange: (v: { category: string; subject: string; message: string }) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('helpdesk.category')} required>{(f) => <Select id={f.id} value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{t(`enums.ticketCategory.${c}`)}</option>)}</Select>}</Field>
      <Field label={t('helpdesk.subject')} required>{(f) => <Input id={f.id} value={value.subject} maxLength={150} onChange={(e) => onChange({ ...value, subject: e.target.value })} />}</Field>
      <Field label={t('helpdesk.message')} hint={t('helpdesk.messageHint')} required>{(f) => <Textarea id={f.id} value={value.message} maxLength={3000} onChange={(e) => onChange({ ...value, message: e.target.value })} />}</Field>
    </>
  );
}

function MyTickets() {
  const { t, i18n } = useTranslation();
  const list = useQuery({ queryKey: ['tickets'], queryFn: () => api.get<Ticket[]>('/helpdesk/tickets') });
  const [sel, setSel] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['ticket', sel], queryFn: () => api.get<TicketDetail>(`/helpdesk/tickets/${sel}`), enabled: !!sel });
  const [form, setForm] = useState({ category: 'OTHER', subject: '', message: '' });
  const [attachment, setAttachment] = useState<{ id: string; name: string; sizeBytes: number } | null>(null);
  const [reply, setReply] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ ticketNo: string; id: string }>('/helpdesk/tickets', { ...form, attachmentId: attachment?.id ?? null });
      setMsg({ tone: 'success', text: t('helpdesk.created', { no: r.ticketNo }) });
      setForm({ category: 'OTHER', subject: '', message: '' }); setAttachment(null);
      await list.refetch(); setSel(r.id);
    } catch (e) { setMsg({ tone: 'danger', text: errorMessage(e, t) }); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader title={t('helpdesk.new')} />
        <CardBody className="space-y-4">
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <NewTicketFields value={form} onChange={setForm} />
          <FileUpload label={`${t('helpdesk.attachment')} (${t('app.optional')})`} accept="application/pdf,image/jpeg,image/png" maxBytes={2 * 1024 * 1024} value={attachment}
            onRemove={() => setAttachment(null)}
            labels={{ choose: t('docs.choose'), uploading: t('docs.uploading'), remove: t('docs.remove'), tooLarge: t('docs.tooLarge', { kb: 2048 }), wrongType: t('docs.wrongType') }}
            onUpload={async (f) => { const fd = new FormData(); fd.append('file', f); try { const r = await api.upload<{ id: string; fileName: string; sizeBytes: number }>('/helpdesk/attachments', fd); setAttachment({ id: r.id, name: r.fileName, sizeBytes: r.sizeBytes }); } catch (e) { throw new Error(errorMessage(e, t)); } }} />
          <Button variant="primary" loading={busy} disabled={form.subject.length < 5 || form.message.length < 10} onClick={() => void create()}>{t('helpdesk.submit')}</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('helpdesk.myTickets')} />
        <CardBody className="p-0 sm:p-0">
          {list.data?.length ? (
            <ul className="divide-y divide-border">
              {list.data.map((tk) => (
                <li key={tk.id}>
                  <button type="button" onClick={() => setSel(tk.id === sel ? null : tk.id)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-navy-50 sm:px-6" aria-expanded={sel === tk.id}>
                    <span><span className="block font-medium">{tk.subject}</span><span className="text-xs tabular-nums text-ink-muted">{tk.ticketNo} · {fmtDateTime(tk.updatedAt, i18n.language)}</span></span>
                    <Badge tone={tone(tk.status)}>{t(`enums.ticketStatus.${tk.status}`)}</Badge>
                  </button>
                  {sel === tk.id && detail.data && (
                    <div className="space-y-3 bg-surface px-4 py-3 sm:px-6">
                      {detail.data.messages.map((m) => (
                        <div key={m.id} className={`rounded p-3 text-sm ${m.authorType === 'ADMIN' ? 'border-l-4 border-orange bg-white' : 'bg-white'}`}>
                          <p className="text-xs font-semibold text-ink-muted">{m.authorType === 'ADMIN' ? t('helpdesk.agent') : t('helpdesk.you')} · <span className="tabular-nums">{fmtDateTime(m.createdAt, i18n.language)}</span></p>
                          <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
                        </div>
                      ))}
                      {detail.data.status !== 'CLOSED' && (
                        <div className="flex gap-2">
                          <Input aria-label={t('helpdesk.reply')} placeholder={t('helpdesk.reply')} value={reply} onChange={(e) => setReply(e.target.value)} />
                          <Button disabled={!reply} onClick={() => void api.post(`/helpdesk/tickets/${tk.id}/messages`, { message: reply }).then(() => { setReply(''); void detail.refetch(); })}>{t('helpdesk.send')}</Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t('helpdesk.none')} />}
        </CardBody>
      </Card>
    </div>
  );
}

function PublicTicket() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ category: 'REGISTRATION', subject: '', message: '' });
  const [contact, setContact] = useState({ name: '', mobile: '', email: '' });
  const [captcha, setCaptcha] = useState<CaptchaValue | null>(null);
  const [capKey, setCapKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onCaptcha = useCallback((v: CaptchaValue) => setCaptcha(v), []);
  const submit = async () => {
    setBusy(true); setError(null);
    try { setDone((await api.post<{ ticketNo: string }>('/helpdesk/public-tickets', { ...form, ...contact, ...captcha })).ticketNo); } catch (e) { setError(errorMessage(e, t)); setCapKey((k) => k + 1); } finally { setBusy(false); }
  };
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader title={t('helpdesk.publicTitle')} description={t('helpdesk.publicDesc')} />
      <CardBody className="space-y-4">
        {done ? <Alert tone="success" title={t('helpdesk.created', { no: done })}>{t('helpdesk.publicDone')}</Alert> : (
          <>
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label={t('fields.fullName')} required>{(f) => <Input id={f.id} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('fields.mobile')} required>{(f) => <Input id={f.id} inputMode="numeric" maxLength={10} value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} />}</Field>
              <Field label={t('fields.email')} required>{(f) => <Input id={f.id} type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />}</Field>
            </div>
            <NewTicketFields value={form} onChange={setForm} />
            <Captcha onChange={onCaptcha} refreshKey={capKey} />
            <Button variant="primary" block loading={busy} onClick={() => void submit()}>{t('helpdesk.submit')}</Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
