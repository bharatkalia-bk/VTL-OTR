import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { TFunction } from 'i18next';
import { ApiError } from './api';

/** Translate a Zod/i18n message key; plain text passes through. */
export function tr(t: TFunction, msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  return /^[a-zA-Z]+\.[\w.]+$/.test(msg) ? t(msg, { defaultValue: t('validation.invalid') }) : msg;
}

/** Map API validation issues onto form fields; returns a top-level message for anything else. */
export function applyServerErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>, t: TFunction): string {
  if (e instanceof ApiError) {
    let mapped = false;
    for (const i of e.issues) {
      if (i.path) {
        setError(i.path.replace(/^data\./, '') as Path<T>, { message: tr(t, i.message) });
        mapped = true;
      }
    }
    const key = `errors.${e.code}`;
    const msg = t(key, { defaultValue: e.message });
    return mapped && e.code === 'VALIDATION_FAILED' ? t('errors.VALIDATION_FAILED') : msg;
  }
  return t('errors.NETWORK');
}

export function errorMessage(e: unknown, t: TFunction): string {
  if (e instanceof ApiError) return t(`errors.${e.code}`, { defaultValue: e.message });
  return t('errors.NETWORK');
}
