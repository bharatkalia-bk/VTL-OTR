import { Alert, Badge, Card, Reveal, Skeleton, buttonVariants, cn } from '@vtl/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Award, BadgeCheck, BellRing, Building2, Camera, CheckCircle2, ChevronDown, ClipboardCheck, FileCheck2, Fingerprint, GraduationCap, Headset,
  IdCard, Languages, Mail, MessagesSquare, Phone, PhoneCall, QrCode, Scale, ScanLine, ShieldCheck, Upload, Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, pick } from '../lib/format';

interface PublicExam { id: string; code: string; titleEn: string; titleHi: string; notificationNo: string; conductingBody: string; status: string; dates: { applyStart: string; applyEnd: string; examDate?: string }; posts: Array<{ code: string; vacancies?: Record<string, number> }> }
interface PublicConfig { adminUrl: string; helpdesk: { phone: string; email: string; hours: string }; faqs: Array<{ qEn: string; qHi: string; aEn: string; aHi: string }> }

export function Landing() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const lang = i18n.language;
  const exams = useQuery({ queryKey: ['public-exams'], queryFn: () => api.get<PublicExam[]>('/public/exams') });
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<PublicConfig>('/public/config') });
  if (user) return <Navigate to="/dashboard" replace />;
  const today = new Date().toISOString().slice(0, 10);
  const isOpen = (e: PublicExam) => e.status === 'PUBLISHED' && today >= e.dates.applyStart && today <= e.dates.applyEnd;
  const openExams = exams.data?.filter(isOpen) ?? [];
  const vacancies = openExams.reduce((a, e) => a + e.posts.reduce((b, p) => b + Object.values(p.vacancies ?? {}).reduce((c, n) => c + Number(n || 0), 0), 0), 0);
  const nf = new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN');
  const stats = [
    { icon: <BellRing />, value: exams.data ? nf.format(openExams.length) : '–', label: t('landing.statOpen') },
    { icon: <Users />, value: exams.data ? nf.format(vacancies) : '–', label: t('landing.statVacancies') },
    { icon: <Languages />, value: '2', label: t('landing.statLanguages') },
    { icon: <IdCard />, value: '1', label: t('landing.statOneReg') },
  ];
  const steps = [
    { img: '/images/step-apply.jpg', icon: <IdCard />, k: 'step1' },
    { img: '/images/step-exam.jpg', icon: <Camera />, k: 'step2' },
    { img: '/images/step-results.jpg', icon: <FileCheck2 />, k: 'step3' },
  ];
  const staffPortals = [
    { k: 'staff', icon: <ShieldCheck /> }, { k: 'helpdesk', icon: <Headset /> }, { k: 'centre', icon: <ScanLine /> },
    { k: 'observer', icon: <Building2 /> }, { k: 'agency', icon: <Upload /> }, { k: 'panel', icon: <MessagesSquare /> },
  ];
  const secure = [{ k: 'secure1', icon: <Camera /> }, { k: 'secure2', icon: <QrCode /> }, { k: 'secure3', icon: <Fingerprint /> }, { k: 'secure4', icon: <Scale /> }];
  const journeyIcons = [<IdCard key="1" />, <FileCheck2 key="2" />, <BadgeCheck key="3" />, <ClipboardCheck key="4" />, <ShieldCheck key="5" />, <Award key="6" />, <MessagesSquare key="7" />, <Building2 key="8" />, <CheckCircle2 key="9" />];

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-navy text-white">
        <img src="/images/hero-aspirants.jpg" alt="" className="anim-slow-zoom absolute inset-0 -z-20 h-full w-full object-cover object-center" fetchPriority="high" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy via-navy/80 to-navy/10" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-navy/80 to-transparent" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-24 pt-12 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:pb-28">
          <div>
            <Badge tone="brand" className="anim-fade-up mb-4">{t('landing.badge')}</Badge>
            <h1 className="anim-fade-up anim-delay-1 font-heading text-4xl font-bold leading-tight text-white sm:text-5xl">{t('landing.heroTitle')}</h1>
            <p className="anim-fade-up anim-delay-2 mt-4 max-w-xl text-lg text-white/85">{t('landing.heroSubtitle')}</p>
            <div className="anim-fade-up anim-delay-3 mt-7 flex flex-wrap gap-3">
              <Link to="/register" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'shadow-raised transition-transform hover:-translate-y-0.5')} data-testid="cta-register">{t('landing.ctaRegister')}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
              <Link to="/login" className={cn(buttonVariants({ variant: 'onNavy', size: 'lg' }), 'backdrop-blur')}>{t('landing.ctaLogin')}</Link>
            </div>
            <ul className="anim-fade-up anim-delay-4 mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
              {(['trust1', 'trust2', 'trust3'] as const).map((k) => <li key={k} className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-orange" aria-hidden />{t(`landing.${k}`)}</li>)}
            </ul>
          </div>
          <Card className="anim-fade-up anim-delay-3 border-white/20 bg-white/95 text-navy shadow-raised backdrop-blur">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="relative flex h-2.5 w-2.5" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-600" /></span>
              <h2 className="text-base font-semibold">{t('landing.notifications')}</h2>
            </div>
            <ul className="max-h-[360px] divide-y divide-border overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-orange" tabIndex={0} aria-label={t('landing.notifications')}>
              {exams.isLoading && [1, 2, 3].map((i) => <li key={i} className="p-4"><Skeleton className="h-10" /></li>)}
              {exams.data?.length === 0 && <li className="p-4 text-sm text-ink-muted">{t('landing.noNotifications')}</li>}
              {exams.data?.map((e) => (
                <li key={e.id} className="p-4 transition-colors hover:bg-surface">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{pick(e, lang)}</p>
                    <Badge tone={isOpen(e) ? 'success' : 'neutral'}>{isOpen(e) ? t('landing.open') : t('landing.closed')}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{e.conductingBody} · <span className="tabular-nums">{e.notificationNo}</span></p>
                  <p className="mt-1 text-xs tabular-nums text-ink-muted">{t('landing.applyWindow', { from: fmtDate(e.dates.applyStart, lang), to: fmtDate(e.dates.applyEnd, lang) })}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* Stats band overlapping the hero */}
      <section className="relative z-10 mx-auto -mt-12 max-w-6xl px-4" aria-label={t('landing.statsLabel')}>
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 shadow-raised sm:p-6 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-700 to-orange-600 text-white [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{s.icon}</span>
              <div><p className="font-heading text-2xl font-bold tabular-nums text-navy">{s.value}</p><p className="text-xs text-ink-muted sm:text-sm">{s.label}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Portals */}
      <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="portals">
        <Reveal><h2 id="portals" className="text-3xl font-bold">{t('portals.title')}</h2><p className="mt-1 text-ink-muted">{t('portals.subtitle')}</p></Reveal>
        <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_2fr]">
          <Reveal>
            <Card className="hover-lift h-full overflow-hidden">
              <div className="relative overflow-hidden bg-gradient-to-br from-orange-700 to-orange-600 p-6 text-white">
                <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
                <GraduationCap className="anim-float h-9 w-9" aria-hidden />
                <h3 className="mt-3 font-heading text-xl font-bold text-white">{t('portals.candidate')}</h3>
                <p className="mt-1 text-sm text-white/90">{t('portals.candidateBody')}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link to="/login" className={cn(buttonVariants({ variant: 'outline' }), 'border-white bg-white text-navy')}>{t('portals.candidateLogin')}</Link>
                  <Link to="/register" className={buttonVariants({ variant: 'onNavy' })}>{t('landing.ctaRegister')}</Link>
                </div>
              </div>
              <Link to="/helpline" className="group flex items-center gap-3 p-4 transition-colors hover:bg-surface">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white"><PhoneCall className="h-5 w-5" aria-hidden /></span>
                <span className="flex-1"><span className="block font-semibold">{t('portals.helpline')}</span><span className="text-sm text-ink-muted">{t('portals.helplineBody')}</span></span>
                <ArrowRight className="h-4 w-4 text-ink-muted transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Card>
          </Reveal>
          <ul className="grid gap-3 sm:grid-cols-2">
            {staffPortals.map((x, i) => (
              <Reveal as="li" key={x.k} delay={i * 0.06}>
                <a href={cfg.data?.adminUrl ?? '#'} className="hover-lift group flex h-full items-start gap-3 rounded-card border border-border bg-white p-4 shadow-card hover:border-orange">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-navy to-navy-600 text-white transition-colors group-hover:from-orange-700 group-hover:to-orange-600 [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{x.icon}</span>
                  <span className="flex-1"><span className="block font-semibold">{t(`portals.${x.k}`)}</span><span className="block text-sm text-ink-muted">{t(`portals.${x.k}Body`)}</span><span className="mt-1 flex items-center gap-1 text-sm font-semibold text-orange-700">{t('portals.staffLogin')}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden /></span></span>
                </a>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works, with photos */}
      <section className="bg-white py-16" aria-labelledby="how">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal><h2 id="how" className="text-3xl font-bold">{t('landing.howTitle')}</h2></Reveal>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.k} delay={i * 0.12}>
                <article className="hover-lift group h-full overflow-hidden rounded-2xl border border-border bg-white shadow-card">
                  <div className="img-zoom relative aspect-[16/10]">
                    <img src={s.img} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-navy/70 to-transparent" aria-hidden />
                    <span className="absolute bottom-3 left-4 flex items-center gap-2 font-heading text-sm font-bold text-white"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 [&_svg]:h-4 [&_svg]:w-4" aria-hidden>{s.icon}</span>{t('landing.stepN', { n: i + 1 })}</span>
                  </div>
                  <div className="p-5"><h3 className="text-lg font-semibold">{t(`landing.${s.k}Title`)}</h3><p className="mt-1 text-sm text-ink-muted">{t(`landing.${s.k}Body`)}</p></div>
                </article>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Fair and secure */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2" aria-labelledby="secure">
        <Reveal className="relative">
          <div className="img-zoom overflow-hidden rounded-2xl shadow-raised"><img src="/images/exam-hall.jpg" alt={t('landing.secureImgAlt')} loading="lazy" className="aspect-[16/11] w-full object-cover" /></div>
          <div className="anim-float absolute -bottom-6 right-4 flex items-center gap-3 rounded-xl bg-white p-3 shadow-raised sm:right-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white"><QrCode className="h-5 w-5" aria-hidden /></span>
            <span className="text-sm"><span className="block font-semibold">{t('landing.floatTitle')}</span><span className="text-ink-muted">{t('landing.floatBody')}</span></span>
          </div>
        </Reveal>
        <div>
          <Reveal><h2 id="secure" className="text-3xl font-bold">{t('landing.secureTitle')}</h2><p className="mt-2 text-ink-muted">{t('landing.secureSubtitle')}</p></Reveal>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {secure.map((x, i) => (
              <Reveal as="li" key={x.k} delay={i * 0.08} className="rounded-xl border border-border bg-white p-4 shadow-card">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700 [&_svg]:h-5 [&_svg]:w-5" aria-hidden>{x.icon}</span>
                <h3 className="mt-3 font-semibold">{t(`landing.${x.k}Title`)}</h3><p className="mt-1 text-sm text-ink-muted">{t(`landing.${x.k}Body`)}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Journey */}
      <section className="bg-gradient-to-br from-navy to-navy-700 py-14 text-white" aria-labelledby="journey-h">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal><h2 id="journey-h" className="text-3xl font-bold text-white">{t('journey.title')}</h2></Reveal>
          <ol className="relative mt-8 grid grid-cols-3 gap-y-6 sm:grid-cols-5 lg:grid-cols-9">
            <span className="absolute left-[5%] right-[5%] top-6 hidden h-0.5 bg-gradient-to-r from-orange via-white/40 to-orange lg:block" aria-hidden />
            {journeyIcons.map((ic, i) => (
              <Reveal as="li" key={i} delay={i * 0.06} className="relative flex flex-col items-center gap-2 text-center">
                <span className={cn('flex h-12 w-12 items-center justify-center rounded-full text-white shadow-raised ring-4 ring-navy transition-transform hover:scale-110 [&_svg]:h-5 [&_svg]:w-5', i % 2 ? 'bg-orange-600' : 'bg-navy-600')} aria-hidden>{ic}</span>
                <span className="text-xs font-semibold text-white/90">{t(`journey.s${i + 1}`)}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Important dates */}
      <section className="bg-white py-16" aria-labelledby="dates">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal><h2 id="dates" className="text-3xl font-bold">{t('landing.datesTitle')}</h2></Reveal>
          <Reveal className="mt-6 overflow-x-auto rounded-2xl border border-border shadow-card">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t('landing.datesTitle')}</caption>
              <thead className="bg-navy text-xs uppercase text-white"><tr><th scope="col" className="px-4 py-3">{t('landing.colExam')}</th><th scope="col" className="px-4 py-3">{t('landing.colApply')}</th><th scope="col" className="px-4 py-3">{t('landing.colExamDate')}</th></tr></thead>
              <tbody className="divide-y divide-border">
                {exams.data?.map((e) => (
                  <tr key={e.id} className="transition-colors even:bg-surface/60 hover:bg-orange-50"><td className="px-4 py-3 font-medium">{pick(e, lang)}</td><td className="px-4 py-3 tabular-nums">{fmtDate(e.dates.applyStart, lang)} – {fmtDate(e.dates.applyEnd, lang)}</td><td className="px-4 py-3 tabular-nums">{e.dates.examDate ? fmtDate(e.dates.examDate, lang) : t('landing.tba')}</td></tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* FAQ + help */}
      <section id="faqs" className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="faq-h">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <Reveal><h2 id="faq-h" className="text-3xl font-bold">{t('landing.faqTitle')}</h2></Reveal>
            <div className="mt-5 space-y-2">
              {cfg.data?.faqs.map((f, i) => (
                <Reveal key={i} delay={i * 0.05}>
                  <details className="group rounded-xl border border-border bg-white shadow-card transition-shadow open:shadow-raised">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
                      {lang === 'hi' ? f.qHi : f.qEn}
                      <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-300 group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="anim-fade-in px-4 pb-4 text-sm text-ink-muted">{lang === 'hi' ? f.aHi : f.aEn}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
          <Reveal>
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
          </Reveal>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-4 pb-4">
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-r from-navy via-navy-700 to-orange-700 px-6 py-12 text-white shadow-raised sm:px-12">
          <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div><h2 className="font-heading text-3xl font-bold text-white">{t('landing.ctaTitle')}</h2><p className="mt-2 max-w-xl text-white/85">{t('landing.ctaBody')}</p></div>
            <Link to="/register" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'border-white bg-white text-navy transition-transform hover:-translate-y-0.5')}>{t('landing.ctaRegister')}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
