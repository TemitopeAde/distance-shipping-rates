import { formatMinor } from '../../lib/shipping/money';

export function money(minor: string | bigint | null | undefined, currency: string, locale: string): string {
  if (minor === null || minor === undefined || minor === '') return '—';
  try {
    return formatMinor(BigInt(minor), currency, locale);
  } catch {
    return `${minor} ${currency}`;
  }
}

/** Formats micro-units (strings from the API breakdown) as currency. */
export function micros(value: unknown, currency: string, locale: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n / 1_000_000);
  } catch {
    return (n / 1_000_000).toFixed(2);
  }
}

/** Formats a merchant-entered decimal string for display without a currency symbol. */
export function decimal(value: string | null | undefined, locale: string): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(n) : value;
}

export function number(value: number, locale: string, digits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
}

export function dateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function date(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

export function listFromText(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
