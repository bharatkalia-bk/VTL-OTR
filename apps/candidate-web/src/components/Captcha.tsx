import { Field, Input } from '@vtl/ui';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';

export interface CaptchaValue { captchaId: string; captchaText: string }

/** Self-hosted captcha with refresh. Value is reported upward on every change. */
export function Captcha({ onChange, refreshKey, error }: { onChange: (v: CaptchaValue) => void; refreshKey?: number; error?: string }) {
  const { t } = useTranslation();
  const [c, setC] = useState<{ captchaId: string; svg: string } | null>(null);
  const [text, setText] = useState('');
  const load = useCallback(async () => {
    const r = await api.get<{ captchaId: string; svg: string }>('/captcha');
    setC(r);
    setText('');
    onChange({ captchaId: r.captchaId, captchaText: '' });
  }, [onChange]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return (
    <Field label={t('auth.captcha')} hint={t('auth.captchaHint')} error={error} required>
      {({ id, describedBy, invalid }) => (
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-14 w-40 overflow-hidden rounded border border-border bg-surface" role="img" aria-label={t('auth.captchaImage')} data-testid="captcha-image" data-captcha-id={c?.captchaId}
            dangerouslySetInnerHTML={{ __html: c?.svg ?? '' }} />
          <button type="button" onClick={() => void load()} className="rounded p-2 text-navy hover:bg-navy-50" aria-label={t('auth.captchaRefresh')}><RefreshCw className="h-5 w-5" aria-hidden /></button>
          <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} className="w-36" autoComplete="off" autoCapitalize="off" spellCheck={false} value={text} data-testid="captcha-input"
            onChange={(e) => { setText(e.target.value); if (c) onChange({ captchaId: c.captchaId, captchaText: e.target.value }); }} />
        </div>
      )}
    </Field>
  );
}
