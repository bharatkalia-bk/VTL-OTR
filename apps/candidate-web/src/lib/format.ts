const tz = 'Asia/Kolkata';
export const fmtDate = (d: string | Date | null | undefined, lang = 'en') =>
  d ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00+05:30`) : new Date(d)) : '';
export const fmtDateTime = (d: string | Date | null | undefined, lang = 'en') =>
  d ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '';
export const fmtMoney = (n: number, lang = 'en') => new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
export const pick = <T extends { titleEn?: string; titleHi?: string }>(o: T | null | undefined, lang: string) => (o ? (lang === 'hi' ? o.titleHi : o.titleEn) ?? o.titleEn ?? '' : '');
