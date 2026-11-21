import { Alert, Button, Card, CardBody, Field, Input, cn } from '@vtl/ui';
import { Phone, PhoneOff, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page, PageHeader } from '../components/Layout';
import { api } from '../lib/api';
import { errorMessage } from '../lib/forms';

interface Step { callId: string; lang: 'en' | 'hi'; say: string; end: boolean; options: string[] }
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/** Try-it-yourself version of the phone helpline menu; the telephony provider calls the same API. */
export default function Helpline() {
  const { t, i18n } = useTranslation();
  const [mobile, setMobile] = useState('');
  const [step, setStep] = useState<Step | null>(null);
  const [log, setLog] = useState<Array<{ d: string; say: string }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const press = async (digits = '') => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<Step>('/ivr', { callId: step?.callId, from: mobile, digits, lang: step?.lang ?? (i18n.language === 'hi' ? 'hi' : 'en') });
      setStep(r.end ? null : r); setLog((l) => [...l, { d: digits, say: r.say }]);
      speak(r.say, r.lang);
    } catch (e) { setErr(errorMessage(e, t)); } finally { setBusy(false); }
  };
  const speak = (text: string, lang: string) => {
    try { if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'; window.speechSynthesis.speak(u); } } catch { /* optional */ }
  };
  return (
    <>
      <PageHeader title={t('helpline.title')} description={t('helpline.subtitle')} />
      <Page>
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[320px_1fr]">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-b from-navy to-navy-700 p-5 text-white">
              <Field label={t('helpline.mobile')} className="[&_label]:text-white">{(f) => <Input id={f.id} inputMode="numeric" className="text-navy" value={mobile} disabled={!!step} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />}</Field>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {KEYS.map((k) => <button key={k} disabled={!step || busy} onClick={() => void press(k)} className="h-14 rounded-full bg-white/10 font-heading text-xl font-bold hover:bg-white/20 disabled:opacity-40" aria-label={`Key ${k}`}>{k}</button>)}
              </div>
              <div className="mt-4 flex justify-center">
                {step ? <Button variant="danger" onClick={() => { setStep(null); window.speechSynthesis?.cancel(); setLog((l) => [...l, { d: '', say: t('helpline.ended') }]); }}><PhoneOff className="h-4 w-4" aria-hidden />{t('helpline.hangUp')}</Button>
                  : <Button variant="primary" loading={busy} disabled={mobile.length !== 10} onClick={() => { setLog([]); void press(''); }}><Phone className="h-4 w-4" aria-hidden />{t('helpline.call')}</Button>}
              </div>
            </div>
          </Card>
          <CardBody className="rounded-card border border-border bg-white">
            {err && <Alert tone="danger" className="mb-3">{err}</Alert>}
            <ol className="space-y-3" aria-live="polite">
              {log.map((l, i) => (
                <li key={i} className={cn('rounded-card p-3 text-sm', l.d ? 'bg-surface' : 'bg-orange-50')}>
                  {l.d && <p className="mb-1 text-xs font-semibold text-ink-muted">➜ {l.d}</p>}
                  <p>{l.say}</p>
                  <button className="mt-1 inline-flex items-center gap-1 text-xs text-info underline" onClick={() => speak(l.say, step?.lang ?? 'en')}><Volume2 className="h-3 w-3" aria-hidden />{t('helpline.speak')}</button>
                </li>
              ))}
            </ol>
          </CardBody>
        </div>
      </Page>
    </>
  );
}
