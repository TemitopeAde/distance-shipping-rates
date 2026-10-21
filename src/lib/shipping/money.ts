/**
 * Exact decimal money arithmetic.
 *
 * Merchant-entered amounts are decimal strings. Internally every amount is a
 * bigint count of micro-units (1e-6 of the major unit) so that per-distance
 * rates with sub-cent precision stay exact. Amounts are rounded to the
 * currency's minor unit only once, at the end of a calculation.
 */
import { currencyExponent } from './currency';

export const MICRO_SCALE = 6;
export const MICROS_PER_UNIT = 1_000_000n;

const DECIMAL_RE = /^(\d{1,12})(?:\.(\d{1,6}))?$/;

export class MoneyFormatError extends Error {
  constructor(value: unknown) {
    super(`Invalid non-negative decimal amount: ${String(value)}`);
    this.name = 'MoneyFormatError';
  }
}

/** Parses a non-negative decimal string (max 6 fraction digits) into micro-units. */
export function parseMicros(value: string): bigint {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const match = DECIMAL_RE.exec(trimmed);
  if (!match) throw new MoneyFormatError(value);
  const whole = BigInt(match[1]);
  const frac = (match[2] ?? '').padEnd(MICRO_SCALE, '0');
  return whole * MICROS_PER_UNIT + BigInt(frac);
}

export function isDecimalString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_RE.test(value.trim());
}

/** Parses a Wix DECIMAL_VALUE string (may have more precision); returns null when absent/invalid. */
export function parseWixDecimalMicros(value: string | null | undefined): bigint | null {
  if (value == null || value === '') return null;
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!m) return null;
  const frac = (m[3] ?? '').slice(0, MICRO_SCALE).padEnd(MICRO_SCALE, '0');
  const micros = BigInt(m[2]) * MICROS_PER_UNIT + BigInt(frac);
  return m[1] ? -micros : micros;
}

export type RoundingMode = 'half_up' | 'up' | 'down';

function divRound(numerator: bigint, divisor: bigint, mode: RoundingMode): bigint {
  if (numerator < 0n) throw new RangeError('Negative amounts are not supported');
  const q = numerator / divisor;
  const r = numerator % divisor;
  if (r === 0n) return q;
  if (mode === 'down') return q;
  if (mode === 'up') return q + 1n;
  return r * 2n >= divisor ? q + 1n : q;
}

/** Converts micro-units to the currency's minor units (e.g. cents, yen, fils). */
export function microsToMinor(micros: bigint, currency: string, mode: RoundingMode = 'half_up'): bigint {
  const exp = currencyExponent(currency);
  const divisor = 10n ** BigInt(MICRO_SCALE - exp);
  return divRound(micros, divisor, mode);
}

export function minorToMicros(minor: bigint, currency: string): bigint {
  const exp = currencyExponent(currency);
  return minor * 10n ** BigInt(MICRO_SCALE - exp);
}

/** Formats minor units as the plain decimal string Wix expects (`"12.50"`, `"1200"`, `"1.250"`). */
export function minorToDecimalString(minor: bigint, currency: string): string {
  if (minor < 0n) throw new RangeError('Negative amounts are not supported');
  const exp = currencyExponent(currency);
  if (exp === 0) return minor.toString();
  const s = minor.toString().padStart(exp + 1, '0');
  return `${s.slice(0, -exp)}.${s.slice(-exp)}`;
}

/** micros × (milli-quantity / 1000), exact until the final rounding. Result stays in micro-units. */
export function multiplyMicrosByMilli(micros: bigint, milli: bigint): bigint {
  return divRound(micros * milli, 1000n, 'half_up');
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Locale-aware display. Uses Intl; never used for values sent to Wix. */
export function formatMinor(minor: bigint, currency: string, locale = 'en-US'): string {
  const exp = currencyExponent(currency);
  const value = Number(minor) / 10 ** exp;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(value);
  } catch {
    return `${minorToDecimalString(minor, currency)} ${currency}`;
  }
}
