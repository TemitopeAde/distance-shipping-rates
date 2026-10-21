import chileRegions from './chile-regions.json';

/**
 * Country / state / city lists from the CountriesNow API (same source as the
 * product-detail-page-quote app). Called from the dashboard browser; the API
 * is public, keyless and CORS-enabled. Results are cached per session.
 */
export const COUNTRIES_NOW_BASE_URL = 'https://countriesnow.space/api/v0.1';

/** ISO 3166-1 alpha-2 codes (officially assigned). Used when CountriesNow is unreachable. */
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

export interface CountryOption {
  /** ISO 3166-1 alpha-2, uppercase. */
  code: string;
  /** English name as CountriesNow knows it; used for state/city lookups. */
  name: string;
}

export interface StateOption {
  /** Subdivision code, uppercase (e.g. "TX"); falls back to the name when the API has no code. */
  code: string;
  name: string;
}

interface ChileRegion {
  code: string;
  name: string;
  communes: string[];
}

type Envelope<T> = { error?: boolean; msg?: string; data?: T };

let fetcher: typeof fetch = (...args) => fetch(...args);

/** Test hook: replace the network layer. */
export function __setLocationFetcher(f: typeof fetch): void {
  fetcher = f;
  cache.clear();
}

const cache = new Map<string, Promise<unknown>>();

/** Caches successful lookups only, so a transient failure can be retried. */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = load();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

async function request<T>(path: string): Promise<T> {
  const res = await fetcher(`${COUNTRIES_NOW_BASE_URL}${path}`);
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !body || body.error === true || body.data === undefined) {
    throw new Error(body?.msg || `CountriesNow request failed (${res.status})`);
  }
  return body.data;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * CountriesNow mixes formats: "NG-OS" / "GB-ENG" (ISO 3166-2) for some countries, "TX" for others.
 * The app stores the short form everywhere (Geoapify autocomplete, Wix checkout and zones use it).
 */
export function shortSubdivisionCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(upper) ? upper.slice(3) : upper;
}

/** "Osun State" → "OSUN", for name matching against values like "Osun". */
function bareStateName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+(STATE|PROVINCE|REGION|COUNTY|PREFECTURE|DEPARTMENT|TERRITORY)$/, '');
}
const CHILE = 'CL';
const chile = chileRegions as ChileRegion[];

/** All countries; falls back to the built-in ISO list if CountriesNow is unreachable. */
export function loadCountries(): Promise<CountryOption[]> {
  return cached('countries', async () => {
    try {
      const data = await request<Array<{ name?: unknown; Iso2?: unknown; iso2?: unknown }>>('/countries/iso');
      const list = (Array.isArray(data) ? data : [])
        .map((c) => ({ code: str(c.Iso2 ?? c.iso2).toUpperCase(), name: str(c.name) }))
        .filter((c) => /^[A-Z]{2}$/.test(c.code) && c.name);
      if (list.length === 0) throw new Error('CountriesNow returned no countries');
      // CountriesNow lacks ~27 ISO countries (e.g. KR, TZ, BO, CD, CI). Never drop them: keep the full ISO
      // list and use CountriesNow's names where it has them (its names are what its state lookups expect).
      const apiNames = new Map(list.map((c) => [c.code, c.name]));
      const merged = fallbackCountries().map((c) => ({ code: c.code, name: apiNames.get(c.code) ?? c.name }));
      const known = new Set(merged.map((c) => c.code));
      return [...merged, ...list.filter((c) => !known.has(c.code))];
    } catch (error) {
      console.error('CountriesNow country request failed; using built-in list', error);
      return fallbackCountries();
    }
  });
}

export function fallbackCountries(): CountryOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = null;
  }
  return COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code }));
}

/** States / regions of a country. Chile uses bundled region data (CountriesNow's is incomplete). */
export function loadStates(country: CountryOption): Promise<StateOption[]> {
  if (country.code === CHILE) return Promise.resolve(chile.map((r) => ({ code: r.code, name: r.name })));
  return cached(`states|${country.code}`, async () => {
    const data = await request<{ states?: Array<{ name?: unknown; state_code?: unknown }> }>(
      `/countries/states/q?country=${encodeURIComponent(country.name)}`,
    );
    return (Array.isArray(data?.states) ? data.states : [])
      .map((s) => {
        const name = str(s.name);
        return { code: shortSubdivisionCode(str(s.state_code) || name), name };
      })
      .filter((s) => s.code && s.name);
  });
}

/** Cities of a state. Chile returns the communes of the region. */
export function loadCities(country: CountryOption, state: StateOption): Promise<string[]> {
  if (country.code === CHILE) {
    return Promise.resolve(chile.find((r) => r.code === state.code || r.name === state.name)?.communes ?? []);
  }
  return cached(`cities|${country.code}|${state.code}`, async () => {
    const data = await request<unknown[]>(
      `/countries/state/cities/q?country=${encodeURIComponent(country.name)}&state=${encodeURIComponent(state.name)}`,
    );
    return [...new Set((Array.isArray(data) ? data : []).map(str).filter(Boolean))];
  });
}

/** Finds a state by code or name (case-insensitive), e.g. a value filled by address autocomplete. */
export function findState(states: StateOption[], value: string): StateOption | undefined {
  const v = value.trim().toUpperCase();
  if (!v) return undefined;
  const code = shortSubdivisionCode(v);
  return (
    states.find((s) => s.code === code) ??
    states.find((s) => s.name.toUpperCase() === v) ??
    states.find((s) => bareStateName(s.name) === bareStateName(v))
  );
}
