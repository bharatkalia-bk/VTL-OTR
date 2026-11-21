import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Field, Input, Logo } from '@vtl/ui';
import { Building2, ClipboardCheck, GraduationCap, Headset, MessagesSquare, ScanLine, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';

const ROLES = [
  { icon: <ShieldCheck />, title: 'Administrators', text: 'Super admin, exam admin, auditor' },
  { icon: <ClipboardCheck />, title: 'Verifiers', text: 'Documents, corrections, DV desk' },
  { icon: <Headset />, title: 'Helpdesk', text: 'Tickets, chat, IVR and phone' },
  { icon: <ScanLine />, title: 'Centre superintendents', text: 'QR entry and roll sheets' },
  { icon: <Building2 />, title: 'Observers', text: 'Offline reports from the centre' },
  { icon: <Upload />, title: 'Conducting agencies', text: 'Responses, OMR and biometrics' },
  { icon: <MessagesSquare />, title: 'Interview panels', text: 'Marks for your candidates' },
];
const DEMO = [
  ['superadmin', 'Super Admin'], ['examadmin', 'Exam Admin'], ['examadmin2', 'Second Exam Admin (approvals)'], ['verifier', 'Verifier'], ['helpdesk', 'Helpdesk'], ['auditor', 'Auditor'],
  ['centre', 'Centre Superintendent'], ['observer', 'Observer'], ['agency', 'Conducting Agency'], ['panel', 'Interview Panel'],
];

export default function Login() {
  const { user, refetch } = useAuth();
  const cfg = useQuery({ queryKey: ['public-config'], queryFn: () => api.get<{ demoMode: boolean; candidateUrl: string; demoFixedOtp: string | null }>('/public/config') });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'password' | 'OTP'>(user && !user.totpVerified ? 'OTP' : 'password');
  const [challenge, setChallenge] = useState<{ challengeId: string; sentTo: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); setInfo(null); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };
  // Page reloaded during the code step: pick up the pending challenge.
  useEffect(() => { if (stage === 'OTP' && !challenge) void run(async () => setChallenge(await api.post('/admin/auth/otp/challenge', {}))); }, [stage, challenge]);

  const login = (e: FormEvent) => { e.preventDefault(); void run(async () => {
    const r = await api.post<{ next: 'OTP_VERIFY'; challengeId: string; sentTo: string }>('/admin/auth/login', { email, password });
    setChallenge({ challengeId: r.challengeId, sentTo: r.sentTo });
    setStage('OTP');
  }); };
  const verify = (e: FormEvent) => { e.preventDefault(); void run(async () => {
    await api.post('/admin/auth/otp/verify', { challengeId: challenge?.challengeId, code });
    await refetch();
  }); };
  const resend = () => void run(async () => { setChallenge(await api.post('/admin/auth/otp/challenge', { fresh: true })); setCode(''); setInfo('A new code has been sent.'); });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-navy-700 to-orange-700 p-10 text-white lg:flex lg:flex-col" aria-label="About the staff console">
        <Logo variant="white" height={40} />
        <h1 className="mt-10 max-w-md font-heading text-4xl font-bold leading-tight text-white">One console for every stage of recruitment</h1>
        <p className="mt-3 max-w-md text-white/85">Registration, exam day, answer keys, results, interviews, allotment and document verification. Each role sees only its own work.</p>
        <ul className="mt-8 grid max-w-xl grid-cols-2 gap-3">
          {ROLES.map((r) => (
            <li key={r.title} className="flex items-start gap-3 rounded-card bg-white/10 p-3 backdrop-blur">
              <span className="rounded-full bg-white/15 p-2 [&_svg]:h-4 [&_svg]:w-4" aria-hidden>{r.icon}</span>
              <span><span className="block text-sm font-semibold">{r.title}</span><span className="text-xs text-white/80">{r.text}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-8 text-xs text-white/70">A product of Vensysco Technologies Limited</p>
        <span className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-orange/20" aria-hidden />
      </section>
      <main className="flex items-center justify-center bg-surface p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center gap-2 lg:hidden"><Logo height={40} /></div>
          <div className="rounded-card border border-border bg-white p-6 shadow-raised sm:p-8">
            <h2 className="font-heading text-2xl font-bold">Staff sign in</h2>
            <p className="mb-5 mt-1 text-sm text-ink-muted">Authorised personnel only. Sign in with your password and a one-time code sent to your email. Every action is logged.</p>
            {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
            {info && <Alert tone="success" className="mb-4">{info}</Alert>}
            {stage === 'password' ? (
              <form onSubmit={login} className="space-y-4">
                <Field label="Email" required>{(f) => <Input id={f.id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-email" />}</Field>
                <Field label="Password" required>{(f) => <Input id={f.id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="admin-password" />}</Field>
                <Button type="submit" variant="primary" block loading={busy} data-testid="admin-login">Continue</Button>
              </form>
            ) : (
              <form onSubmit={verify} className="space-y-4">
                <p className="text-sm">We have sent a 6-digit code to <strong>{challenge?.sentTo ?? 'your email'}</strong>.{cfg.data?.demoFixedOtp && <> On this demo server the code is always <strong className="tabular-nums">{cfg.data.demoFixedOtp}</strong>.</>}</p>
                <Field label="Verification code" required>{(f) => <Input id={f.id} autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} data-testid="admin-otp" />}</Field>
                <Button type="submit" variant="primary" block loading={busy} disabled={code.length !== 6 || !challenge} data-testid="admin-verify">Verify and sign in</Button>
                <div className="flex justify-between text-sm"><button type="button" className="text-info underline" onClick={resend}>Send a new code</button><button type="button" className="text-ink-muted underline" onClick={() => { setStage('password'); setCode(''); setChallenge(null); }}>Use a different account</button></div>
              </form>
            )}
          </div>
          {cfg.data?.demoMode && stage === 'password' && (
            <div className="mt-4 rounded-card border border-orange/40 bg-orange-50 p-4 text-sm">
              <p className="font-semibold text-orange-700">Demo server: test accounts</p>
              <p className="text-xs text-ink-muted">Password <code>Admin@12345</code>{cfg.data.demoFixedOtp && <> · verification code <code>{cfg.data.demoFixedOtp}</code></>}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{DEMO.map(([u, label]) => <button key={u} type="button" className="rounded-full border border-border bg-white px-2.5 py-1 text-xs hover:border-orange" onClick={() => { setEmail(`${u}@vtl-otr.local`); setPassword('Admin@12345'); }}>{label}</button>)}</div>
            </div>
          )}
          <p className="mt-4 text-center text-sm text-ink-muted"><GraduationCap className="mr-1 inline h-4 w-4" aria-hidden />Candidate? <a className="font-semibold text-info underline" href={cfg.data?.candidateUrl ?? '/'}>Go to the candidate portal</a></p>
        </div>
      </main>
    </div>
  );
}
