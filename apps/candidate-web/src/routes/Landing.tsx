import { Alert, Badge, Card, Skeleton, buttonVariants, cn } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Camera, CheckCircle2, ChevronDown, FileCheck2, Headset, IdCard, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, pick } from '../lib/format';

interface PublicExam { id: string; code: string; titleEn: string; titleHi: string; notificationNo: string; conductingBody: string; status: string; dates: { applyStart: string; applyEnd: string; examDate?: string }; posts: Array<{ code: string }> }
interface PublicConfig { helpdesk: { phone: string; email: string; hours: string }; faqs: Array<{ qEn: string; qHi: string; aEn: string; aHi: string }> }

export function Landing() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const lang = i18n.language;
  const exams = useQuery({ queryKey: ['public-exams'], queryFn: () => api.get<PublicExam[]>('/public/exams') });
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<PublicConfig>('/public/config') });
  if (user) return <Navigate to="/dashboard" replace />;
  const today = new Date().toISOString().slice(0, 10);
  const steps = [
    { icon: <IdCard className="h-6 w-6" aria-hidden />, k: 'step1' },
    { icon: <Camera className="h-6 w-6" aria-hidden />, k: 'step2' },
    { icon: <FileCheck2 className="h-6 w-6" aria-hidden />, k: 'step3' },
  ];
  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:py-14 md:grid-cols-[1.2fr_1fr]">
          <div>
            <Badge tone="brand" className="mb-3">{t('landing.badge')}</Badge>
            <h1 className="font-heading text-3xl font-bold leading-tight text-white sm:text-4xl">{t('landing.heroTitle')}</h1>
            <p className="mt-3 max-w-xl text-white/80 sm:text-lg">{t('landing.heroSubtitle')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/register" className={buttonVariants({ variant: 'primary', size: 'lg' })} data-testid="cta-register">{t('landing.ctaRegister')}</Link>
              <Link to="/login" className={buttonVariants({ variant: 'onNavy', size: 'lg' })}>{t('landing.ctaLogin')}</Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
              {(['trust1', 'trust2', 'trust3'] as const).map((k) => <li key={k} className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-orange" aria-hidden />{t(`landing.${k}`)}</li>)}
            </ul>
          </div>
          <Card className="border-white/10 bg-white text-navy">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BellRing className="h-5 w-5 text-orange" aria-hidden />
              <h2 className="text-base font-semibold">{t('landing.notifications')}</h2>
            </div>
            <ul className="divide-y divide-border">
              {exams.isLoading && [1, 2, 3].map((i) => <li key={i} className="p-4"><Skeleton className="h-10" /></li>)}
              {exams.data?.length === 0 && <li className="p-4 text-sm text-ink-muted">{t('landing.noNotifications')}</li>}
              {exams.data?.map((e) => {
                const open = e.status === 'PUBLISHED' && today >= e.dates.applyStart && today <= e.dates.applyEnd;
                return (
                  <li key={e.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-snug">{pick(e, lang)}</p>
                      <Badge tone={open ? 'success' : 'neutral'}>{open ? t('landing.open') : t('landing.closed')}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">{e.conductingBody} · <span className="tabular-nums">{e.notificationNo}</span></p>
                    <p className="mt-1 text-xs tabular-nums text-ink-muted">{t('landing.applyWindow', { from: fmtDate(e.dates.applyStart, lang), to: fmtDate(e.dates.applyEnd, lang) })}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold">{t('landing.howTitle')}</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.k}>
              <Card className="h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange">{s.icon}</span>
                  <span className="font-heading text-sm font-semibold tabular-nums text-ink-muted">{t('landing.stepN', { n: i + 1 })}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold">{t(`landing.${s.k}Title`)}</h3>
                <p className="mt-1 text-sm text-ink-muted">{t(`landing.${s.k}Body`)}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-white py-12" aria-labelledby="dates">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="dates" className="text-2xl font-bold">{t('landing.datesTitle')}</h2>
          <div className="mt-6 overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t('landing.datesTitle')}</caption>
              <thead className="bg-surface text-xs uppercase text-ink-muted"><tr><th scope="col" className="px-4 py-3">{t('landing.colExam')}</th><th scope="col" className="px-4 py-3">{t('landing.colApply')}</th><th scope="col" className="px-4 py-3">{t('landing.colExamDate')}</th></tr></thead>
              <tbody className="divide-y divide-border">
                {exams.data?.map((e) => (
                  <tr key={e.id}><td className="px-4 py-3 font-medium">{pick(e, lang)}</td><td className="px-4 py-3 tabular-nums">{fmtDate(e.dates.applyStart, lang)} – {fmtDate(e.dates.applyEnd, lang)}</td><td className="px-4 py-3 tabular-nums">{e.dates.examDate ? fmtDate(e.dates.examDate, lang) : t('landing.tba')}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="faqs" className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="faq-h">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 id="faq-h" className="text-2xl font-bold">{t('landing.faqTitle')}</h2>
            <div className="mt-4 space-y-2">
              {cfg.data?.faqs.map((f, i) => (
                <details key={i} className="group rounded-card border border-border bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
                    {lang === 'hi' ? f.qHi : f.qEn}
                    <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-4 pb-4 text-sm text-ink-muted">{lang === 'hi' ? f.aHi : f.aEn}</p>
                </details>
              ))}
            </div>
          </div>
          <Card className="h-fit p-5">
            <div className="flex items-center gap-2"><Headset className="h-5 w-5 text-orange" aria-hidden /><h2 className="text-lg font-semibold">{t('landing.helpTitle')}</h2></div>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-2"><Phone className="h-4 w-4 text-navy" aria-hidden /><a className="tabular-nums text-info underline" href={`tel:${cfg.data?.helpdesk.phone ?? ''}`}>{cfg.data?.helpdesk.phone}</a></li>
              <li className="flex gap-2"><Mail className="h-4 w-4 text-navy" aria-hidden /><a className="text-info underline" href={`mailto:${cfg.data?.helpdesk.email ?? ''}`}>{cfg.data?.helpdesk.email}</a></li>
              <li className="flex gap-2 text-ink-muted"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden />{cfg.data?.helpdesk.hours}</li>
            </ul>
            <Link to="/helpdesk" className={cn(buttonVariants({ variant: 'secondary', block: true }), 'mt-4')}>{t('landing.raiseTicket')}</Link>
            <Alert tone="warning" className="mt-4">{t('landing.otpWarning')}</Alert>
          </Card>
        </div>
      </section>
    </>
  );
}
