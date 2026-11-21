import { FileUpload } from '@vtl/ui';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { errorMessage } from '../lib/forms';
import type { DocInfo } from './profile';

/** PDF certificate upload bound to a document id (stored in form state). */
export function DocUpload({ label, kind, value, docs, onChange, error, disabled, maxBytes = 500 * 1024 }: {
  label: string; kind: string; value: string | null | undefined; docs: DocInfo[]; onChange: (id: string | null) => void; error?: string; disabled?: boolean; maxBytes?: number;
}) {
  const { t } = useTranslation();
  const doc = docs.find((d) => d.id === value) ?? null;
  return (
    <FileUpload
      label={label}
      accept="application/pdf,.pdf"
      maxBytes={maxBytes}
      disabled={disabled}
      hint={t('docs.hint', { kb: Math.round(maxBytes / 1024) })}
      error={error}
      value={doc ? { id: doc.id, name: doc.fileName, sizeBytes: doc.sizeBytes, status: t(`docs.status.${doc.verificationStatus}`) } : null}
      onRemove={() => onChange(null)}
      labels={{ choose: t('docs.choose'), uploading: t('docs.uploading'), remove: t('docs.remove'), tooLarge: t('docs.tooLarge', { kb: Math.round(maxBytes / 1024) }), wrongType: t('docs.wrongType') }}
      onUpload={async (f) => {
        const fd = new FormData();
        fd.append('kind', kind);
        fd.append('file', f);
        try {
          const r = await api.upload<DocInfo>('/me/documents', fd);
          docs.push(r);
          onChange(r.id);
        } catch (e) {
          throw new Error(errorMessage(e, t));
        }
      }}
    />
  );
}
