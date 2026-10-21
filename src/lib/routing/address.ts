import type { NormalizedAddress } from './types';

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function normalizeAddress(input: Partial<Record<keyof NormalizedAddress, string | null | undefined>>): NormalizedAddress {
  return {
    addressLine1: collapse(input.addressLine1),
    addressLine2: collapse(input.addressLine2),
    city: collapse(input.city),
    subdivision: collapse(input.subdivision).toUpperCase(),
    postalCode: collapse(input.postalCode).toUpperCase(),
    country: collapse(input.country).toUpperCase(),
  };
}

export type AddressCompleteness = 'routable' | 'missing_country' | 'missing_street' | 'missing_locality';

/**
 * Minimum detail required before spending a provider call. A country-only or
 * city-only address would geocode to a centroid and yield a fabricated distance.
 */
export function assessAddress(a: NormalizedAddress): AddressCompleteness {
  if (!/^[A-Z]{2}$/.test(a.country)) return 'missing_country';
  if (!a.addressLine1) return 'missing_street';
  if (!a.postalCode && !a.city) return 'missing_locality';
  return 'routable';
}

/** Single-line address for providers. addressLine2 (apt/suite) is omitted: it does not affect routing. */
/** ISO 3166-2 style codes ("NG-LA", "TX") as Wix checkout sends them, as opposed to names ("Lagos"). */
const SUBDIVISION_CODE = /^([A-Z]{2}-)?[A-Z0-9]{1,3}$/;

export function toSingleLine(a: NormalizedAddress): string {
  // Geocoders read codes as free text: "NG-LA" sent Lagos addresses to Ogun State. City, postcode
  // and the country filter locate the address, so a code is left out; a full name is kept.
  const subdivision = SUBDIVISION_CODE.test(a.subdivision) ? '' : a.subdivision;
  return [a.addressLine1, a.city, [subdivision, a.postalCode].filter(Boolean).join(' '), a.country]
    .filter(Boolean)
    .join(', ');
}

/** Canonical form used inside hashed cache keys (never stored in plain text). */
export function canonicalAddressKey(a: NormalizedAddress): string {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return [a.country, norm(a.postalCode), norm(a.city), norm(a.subdivision), norm(a.addressLine1)].join('|');
}
