import { Button, Input, cn } from '@vtl/ui';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/forms';

interface Msg { role: 'user' | 'assistant'; content: string; sources?: Array<{ id: string; title: string; link: string | null }> }
interface Reply { sessionId: string; reply: string; sources: Msg['sources']; suggestEscalation: boolean; escalatedTicketId: string | null }

/** Floating help assistant. Answers from the helpdesk knowledge base; can hand the conversation to a human as a ticket. */
export function ChatWidget() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [session, setSession] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(false);
  const [mobile, setMobile] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, open]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const m = text.trim();
    if (!m) return;
    setText(''); setBusy(true);
    setMsgs((x) => [...x, { role: 'user', content: m }]);
    try {
      const r = await api.post<Reply>('/chat', { sessionId: session, message: m, lang: i18n.language === 'hi' ? 'hi' : 'en' });
      setSession(r.sessionId); setOffer(r.suggestEscalation);
      setMsgs((x) => [...x, { role: 'assistant', content: r.reply, sources: r.sources }]);
    } catch (err) {
      setMsgs((x) => [...x, { role: 'assistant', content: errorMessage(err, t) }]);
    } finally { setBusy(false); }
  };
  const escalate = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ ticketNo?: string; ticketId: string }>(`/chat/${session}/escalate`, user ? {} : { mobile });
      setTicket(r.ticketNo ?? r.ticketId.slice(0, 8)); setOffer(false);
    } catch (err) { setMsgs((x) => [...x, { role: 'assistant', content: errorMessage(err, t) }]); } finally { setBusy(false); }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open && (
        <section className="mb-3 flex h-[min(560px,75vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-border bg-white shadow-raised" aria-label={t('chat.title')}>
          <header className="flex items-center justify-between bg-gradient-to-r from-navy to-orange-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2"><Bot className="h-5 w-5" aria-hidden /><div><p className="font-heading font-bold leading-tight">{t('chat.title')}</p><p className="text-xs text-white/80">{t('chat.subtitle')}</p></div></div>
            <button className="rounded p-1 hover:bg-white/10" onClick={() => setOpen(false)} aria-label={t('chat.close')}><X className="h-5 w-5" /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-surface p-3 text-sm" aria-live="polite">
            <p className="rounded-card bg-white p-3 shadow-card">{t('chat.hello')}</p>
            {msgs.map((m, i) => (
              <div key={i} className={cn('max-w-[85%] whitespace-pre-wrap rounded-card p-3 shadow-card', m.role === 'user' ? 'ml-auto bg-navy text-white' : 'bg-white')}>
                {m.content}
                {m.sources && m.sources.length > 0 && <p className="mt-2 text-xs text-ink-muted">{t('chat.sources')} {m.sources.map((s, j) => s.link ? <Link key={s.id} to={s.link} className="text-info underline" onClick={() => setOpen(false)}>{j ? ', ' : ''}{s.title}</Link> : <span key={s.id}>{j ? ', ' : ''}{s.title}</span>)}</p>}
              </div>
            ))}
            {ticket && <p className="rounded-card bg-success-50 p-3 text-success-700">{t('chat.escalated', { no: ticket })}</p>}
            {offer && session && !ticket && (
              <div className="space-y-2 rounded-card bg-white p-3 shadow-card">
                {!user && <Input aria-label={t('chat.mobile')} placeholder={t('chat.mobile')} inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />}
                <Button size="sm" variant="secondary" loading={busy} disabled={!user && mobile.length !== 10} onClick={() => void escalate()}>{t('chat.escalate')}</Button>
              </div>
            )}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => void send(e)} className="flex gap-2 border-t border-border p-2">
            <Input aria-label={t('chat.placeholder')} placeholder={t('chat.placeholder')} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            <Button type="submit" variant="primary" size="icon" loading={busy} aria-label={t('chat.send')}><Send className="h-4 w-4" /></Button>
          </form>
          <p className="px-3 pb-2 text-[11px] text-ink-muted">{t('chat.disclaimer')}</p>
        </section>
      )}
      {!open && (
        <button onClick={() => setOpen(true)} className="ml-auto flex items-center gap-2 rounded-full bg-gradient-to-r from-navy to-orange-700 px-4 py-3 font-semibold text-white shadow-raised hover:opacity-95" data-testid="chat-open">
          <MessageCircle className="h-5 w-5" aria-hidden />{t('chat.open')}
        </button>
      )}
    </div>
  );
}
