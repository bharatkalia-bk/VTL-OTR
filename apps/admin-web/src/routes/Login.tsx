import { Alert, Button, Card, CardBody, Field, Input, Logo } from '@vtl/ui';
import { useState, type FormEvent } from 'react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { user, refetch } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'password' | 'TOTP_VERIFY' | 'TOTP_ENROL'>(user && !user.totpVerified ? (user.totpEnrolled ? 'TOTP_VERIFY' : 'TOTP_ENROL') : 'password');
  const [enrol, setEnrol] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); } };

  const login = (e: FormEvent) => { e.preventDefault(); void run(async () => {
    const r = await api.post<{ next: 'TOTP_VERIFY' | 'TOTP_ENROL' }>('/admin/auth/login', { email, password });
    setStage(r.next);
    if (r.next === 'TOTP_ENROL') setEnrol(await api.post('/admin/auth/totp/enrol'));
  }); };
  const verify = (e: FormEvent) => { e.preventDefault(); void run(async () => {
    const r = await api.post<{ recoveryCodes?: string[] }>('/admin/auth/totp/verify', { code });
    if (r.recoveryCodes) setRecovery(r.recoveryCodes);
    else await refetch();
  }); };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy p-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-5 p-6 sm:p-8">
          <div className="flex flex-col items-center gap-2"><Logo height={44} /><h1 className="text-xl font-bold">VTL OTR Admin Console</h1><p className="text-center text-xs text-ink-muted">Authorised personnel only. All actions are logged.</p></div>
          {error && <Alert tone="danger">{error}</Alert>}
          {recovery ? (
            <div className="space-y-3">
              <Alert tone="success" title="Authenticator set up">Store these one-time recovery codes securely. Each can be used once if you lose your device.</Alert>
              <ul className="grid grid-cols-2 gap-2 rounded bg-surface p-3 font-mono text-sm tabular-nums">{recovery.map((c) => <li key={c}>{c}</li>)}</ul>
              <Button variant="primary" block onClick={() => void refetch()}>I have saved them, continue</Button>
            </div>
          ) : stage === 'password' ? (
            <form onSubmit={login} className="space-y-4">
              <Field label="Email" required>{(f) => <Input id={f.id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-email" />}</Field>
              <Field label="Password" required>{(f) => <Input id={f.id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="admin-password" />}</Field>
              <Button type="submit" variant="primary" block loading={busy} data-testid="admin-login">Continue</Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              {stage === 'TOTP_ENROL' && (
                <div className="space-y-2 text-sm">
                  <Alert tone="info" title="Two-factor authentication is mandatory">Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, etc.), then enter the 6-digit code.</Alert>
                  {enrol ? <><img src={enrol.qr} alt="TOTP enrolment QR code" className="mx-auto h-44 w-44" /><p className="break-all text-center font-mono text-xs">{enrol.secret}</p></> : <Button onClick={() => void run(async () => setEnrol(await api.post('/admin/auth/totp/enrol')))}>Show QR code</Button>}
                </div>
              )}
              <Field label="Authenticator code (or recovery code)" required>{(f) => <Input id={f.id} autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.trim().toUpperCase())} data-testid="admin-totp" />}</Field>
              <Button type="submit" variant="primary" block loading={busy} disabled={code.length < 6} data-testid="admin-verify">Verify</Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
