/**
 * Address suggestions for dashboard forms via Geoapify Address Autocomplete
 * (https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/).
 * Called only from the backend so the key never reaches the browser.
 * Suggestions only prefill form fields; locations are still verified by the
 * routing provider on save, and checkout never uses this endpoint.
 */
import { classifyHttpStatus, RoutingError } from './errors';
import { globalFetch } from './fetch';

export interface AddressSuggestion {
  formatted: string;
  addressLine1: string;
  city: string;
  subdivision: string;
  postalCode: string;
  country: string;
  resultType: string;
}

interface GeoapifyAutocompleteResponse {
  results?: Array<{
    formatted?: string;
    address_line1?: string;
    housenumber?: string;
    street?: string;
    name?: string;
    city?: string;
    town?: string;
    village?: string;
    state_code?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
    result_type?: string;
  }>;
}

export interface SuggestOptions {
  country?: string | null;
  lang?: string | null;
  limit?: number;
  signal?: AbortSignal;
}

export async function suggestAddresses(
  text: string,
  apiKey: string,
  opts: SuggestOptions = {},
  fetchImpl: typeof fetch = globalFetch,
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({ text, format: 'json', limit: String(opts.limit ?? 5), apiKey });
  if (opts.country && /^[A-Za-z]{2}$/.test(opts.country)) params.set('filter', `countrycode:${opts.country.toLowerCase()}`);
  if (opts.lang && /^[a-z]{2}$/.test(opts.lang)) params.set('lang', opts.lang);

  const res = await fetchImpl(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal: opts.signal });
  if (!res.ok) throw new RoutingError(classifyHttpStatus(res.status), `Autocomplete HTTP ${res.status}`, res.status);
  const body = (await res.json()) as GeoapifyAutocompleteResponse;

  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const r of body.results ?? []) {
    const street = r.housenumber && r.street ? `${r.housenumber} ${r.street}` : (r.street ?? '');
    const suggestion: AddressSuggestion = {
      formatted: r.formatted ?? '',
      addressLine1: r.address_line1 && (r.result_type === 'building' || r.result_type === 'street') ? r.address_line1 : street,
      city: r.city ?? r.town ?? r.village ?? '',
      subdivision: (r.state_code ?? '').toUpperCase(),
      postalCode: r.postcode ?? '',
      country: (r.country_code ?? '').toUpperCase(),
      resultType: r.result_type ?? '',
    };
    if (!suggestion.formatted || seen.has(suggestion.formatted)) continue;
    seen.add(suggestion.formatted);
    out.push(suggestion);
  }
  return out;
}
