/**
 * Delivery-zone eligibility. Runs before any routing call so ineligible
 * destinations never cost a provider request.
 */
import type { DeliveryZone, FulfillmentLocation } from '../validation/schemas';
import { metersToUnits, type DistanceUnit } from './units';

export interface DestinationFacts {
  country: string;
  subdivision: string;
  postalCode: string;
}

export function normalizePostal(postal: string): string {
  return postal.toUpperCase().replace(/[\s-]/g, '');
}

/** Accepts "US-NY" or "NY" and returns "NY". */
export function normalizeSubdivision(sub: string): string {
  const upper = sub.trim().toUpperCase();
  const dash = upper.indexOf('-');
  return dash === 2 ? upper.slice(3) : upper;
}

/** The country of a full ISO code ("US-NY" → "US"), or null for a bare code ("NY"). */
export function subdivisionCountry(sub: string): string | null {
  const upper = sub.trim().toUpperCase();
  return /^[A-Z]{2}-/.test(upper) ? upper.slice(0, 2) : null;
}

/**
 * Pattern forms:
 *  - exact: "SW1A1AA"
 *  - prefix wildcard: "SW1*"
 *  - numeric range (inclusive, digits only): "10000-10999"
 */
export function postalMatches(pattern: string, postalCode: string): boolean {
  const postal = normalizePostal(postalCode);
  if (!postal) return false;
  const range = /^(\d{1,10})-(\d{1,10})$/.exec(pattern.trim());
  if (range) {
    if (!/^\d+$/.test(postal)) return false;
    const n = Number(postal);
    return n >= Number(range[1]) && n <= Number(range[2]);
  }
  const p = normalizePostal(pattern);
  if (p.endsWith('*')) return postal.startsWith(p.slice(0, -1));
  return postal === p;
}

function zoneMatches(zone: DeliveryZone, dest: DestinationFacts): boolean {
  const country = dest.country.toUpperCase();
  if (zone.countries.length > 0 && !zone.countries.includes(country)) return false;
  if (zone.subdivisions.length > 0) {
    const sub = normalizeSubdivision(dest.subdivision);
    // "US-WA" only matches in the US; a bare "WA" relies on the zone's countries to scope it.
    const matches = (s: string) => normalizeSubdivision(s) === sub && (subdivisionCountry(s) ?? country) === country;
    if (!zone.subdivisions.some(matches)) return false;
  }
  if (zone.postalPatterns.length > 0 && !zone.postalPatterns.some((p) => postalMatches(p, dest.postalCode))) return false;
  return true;
}

export type ZoneVerdict =
  | { eligible: true; matchedIncludeZoneIds: string[] }
  | { eligible: false; reason: 'excluded_zone'; zoneId: string }
  | { eligible: false; reason: 'outside_service_zones' };

/**
 * - Any matching active exclude zone → ineligible (exclusions win).
 * - If active include zones exist, the destination must match at least one.
 * - With no include zones, every non-excluded destination is eligible.
 */
export function evaluateZones(zones: DeliveryZone[], dest: DestinationFacts): ZoneVerdict {
  const active = zones.filter((z) => z.active);
  const sorted = [...active].sort((a, b) => a.id.localeCompare(b.id));
  const exclusion = sorted.find((z) => z.type === 'exclude' && zoneMatches(z, dest));
  if (exclusion) return { eligible: false, reason: 'excluded_zone', zoneId: exclusion.id };
  const includes = sorted.filter((z) => z.type === 'include');
  if (includes.length === 0) return { eligible: true, matchedIncludeZoneIds: [] };
  const matched = includes.filter((z) => zoneMatches(z, dest)).map((z) => z.id);
  if (matched.length === 0) return { eligible: false, reason: 'outside_service_zones' };
  return { eligible: true, matchedIncludeZoneIds: matched };
}

/**
 * Effective max distance for a destination: the tightest of the global limit
 * and the matched zones' limits (a destination in several zones gets the most
 * permissive zone limit, since any one zone accepting it is enough).
 */
export function effectiveMaxDistanceUnits(
  globalMax: number | null,
  zones: DeliveryZone[],
  matchedZoneIds: string[],
): number | null {
  const zoneLimits = zones.filter((z) => matchedZoneIds.includes(z.id)).map((z) => z.maxDistance);
  let zoneMax: number | null = null;
  if (zoneLimits.length > 0 && zoneLimits.every((l) => l !== null)) {
    zoneMax = Math.max(...(zoneLimits as number[]));
  }
  if (globalMax === null) return zoneMax;
  if (zoneMax === null) return globalMax;
  return Math.min(globalMax, zoneMax);
}

export function withinDistance(distanceMeters: number, maxUnits: number | null, unit: DistanceUnit): boolean {
  if (maxUnits === null) return true;
  return metersToUnits(distanceMeters, unit) <= maxUnits + 1e-9;
}

/** Explains why no location can serve a destination, from the most basic cause up. */
export function whyNoLocation(
  locations: FulfillmentLocation[],
): 'no_locations' | 'locations_unverified' | 'location_country_mismatch' {
  const active = locations.filter((l) => l.active);
  if (active.length === 0) return 'no_locations';
  const verified = active.filter((l) => l.lat !== null && l.lng !== null && l.validatedAt !== null);
  if (verified.length === 0) return 'locations_unverified';
  return 'location_country_mismatch';
}

/** Locations that may serve this destination before routing (country and validation checks). */
export function candidateLocations(locations: FulfillmentLocation[], dest: DestinationFacts): FulfillmentLocation[] {
  return locations
    .filter((l) => l.active && l.lat !== null && l.lng !== null && l.validatedAt !== null)
    .filter((l) => l.serviceCountries.length === 0 || l.serviceCountries.includes(dest.country.toUpperCase()))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.id.localeCompare(b.id));
}
