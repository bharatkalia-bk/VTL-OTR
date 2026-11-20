export function maskMobile(mobile: string): string {
  const d = mobile.replace(/\D/g, '');
  if (d.length < 4) return '****';
  return `${'X'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${'*'.repeat(Math.max(3, user.length - visible.length))}@${domain}`;
}

export function maskAadhaar(aadhaar: string): string {
  const d = aadhaar.replace(/\D/g, '');
  return `XXXX-XXXX-${d.slice(-4)}`;
}

/** Normalise a person name for duplicate detection (case, spaces, dots, honorifics). */
export function normaliseName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(SHRI|SMT|KUMARI|KM|MR|MRS|MS|DR)\b\.?/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
