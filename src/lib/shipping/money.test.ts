import { describe, expect, it } from 'vitest';
import { currencyExponent } from './currency';
import {
  formatMinor,
  microsToMinor,
  minorToDecimalString,
  multiplyMicrosByMilli,
  parseMicros,
  parseWixDecimalMicros,
} from './money';

describe('currency exponents', () => {
  it('knows zero, two, three and four decimal currencies', () => {
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('KWD')).toBe(3);
    expect(currencyExponent('CLF')).toBe(4);
    expect(currencyExponent('eur')).toBe(2);
  });
});

describe('parseMicros', () => {
  it('parses decimal strings exactly', () => {
    expect(parseMicros('0')).toBe(0n);
    expect(parseMicros('12.5')).toBe(12_500_000n);
    expect(parseMicros('0.000001')).toBe(1n);
    expect(parseMicros(' 3.14 ')).toBe(3_140_000n);
  });

  it('rejects negatives, junk and excess precision', () => {
    for (const bad of ['-1', 'abc', '1.0000001', '', '1e3', 'NaN', 'Infinity']) {
      expect(() => parseMicros(bad)).toThrow();
    }
  });
});

describe('parseWixDecimalMicros', () => {
  it('handles null, empty and extra precision', () => {
    expect(parseWixDecimalMicros(null)).toBeNull();
    expect(parseWixDecimalMicros('')).toBeNull();
    expect(parseWixDecimalMicros('10.123456789')).toBe(10_123_456n);
    expect(parseWixDecimalMicros('garbage')).toBeNull();
  });
});

describe('minor unit conversion', () => {
  it('rounds half up to the currency minor unit', () => {
    expect(microsToMinor(12_345_000n, 'USD')).toBe(1235n);
    expect(microsToMinor(12_344_999n, 'USD')).toBe(1234n);
    expect(microsToMinor(1_500_000n, 'JPY')).toBe(2n);
    expect(microsToMinor(1_234_500n, 'KWD')).toBe(1235n);
  });

  it('formats Wix decimal strings per currency', () => {
    expect(minorToDecimalString(2500n, 'USD')).toBe('25.00');
    expect(minorToDecimalString(5n, 'USD')).toBe('0.05');
    expect(minorToDecimalString(1200n, 'JPY')).toBe('1200');
    expect(minorToDecimalString(1235n, 'KWD')).toBe('1.235');
    expect(minorToDecimalString(0n, 'USD')).toBe('0.00');
  });

  it('never formats negative amounts', () => {
    expect(() => minorToDecimalString(-1n, 'USD')).toThrow(RangeError);
  });

  it('multiplies rates by fractional distances exactly', () => {
    // $0.355/mi × 12.3 mi = $4.3665
    expect(multiplyMicrosByMilli(355_000n, 12_300n)).toBe(4_366_500n);
  });

  it('formats for display with Intl', () => {
    expect(formatMinor(2500n, 'USD', 'en-US')).toBe('$25.00');
    expect(formatMinor(1200n, 'JPY', 'en-US')).toBe('¥1,200');
  });
});
