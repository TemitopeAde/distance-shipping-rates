/**
 * ISO 4217 minor-unit exponents. Currencies not listed use 2 decimals.
 * Source: ISO 4217 "minor unit" column (https://www.six-group.com/en/products-services/financial-information/data-standards.html).
 */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF',
  'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
const FOUR_DECIMAL = new Set(['CLF', 'UYW']);

const CURRENCY_RE = /^[A-Z]{3}$/;

export function isValidCurrencyCode(code: unknown): code is string {
  return typeof code === 'string' && CURRENCY_RE.test(code);
}

export function currencyExponent(code: string): number {
  const upper = code.toUpperCase();
  if (ZERO_DECIMAL.has(upper)) return 0;
  if (THREE_DECIMAL.has(upper)) return 3;
  if (FOUR_DECIMAL.has(upper)) return 4;
  return 2;
}
