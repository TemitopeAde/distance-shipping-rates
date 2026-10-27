import { describe, expect, it } from 'vitest';
import { makeLocation, makeZone } from '../../../tests/fixtures';
import {
  candidateLocations,
  effectiveMaxDistanceUnits,
  evaluateZones,
  normalizeSubdivision,
  postalMatches,
} from './eligibility';

const dest = { country: 'US', subdivision: 'TX', postalCode: '78704' };

describe('postal patterns', () => {
  it('matches exact, prefix and numeric ranges', () => {
    expect(postalMatches('78704', '78704')).toBe(true);
    expect(postalMatches('787*', '78704')).toBe(true);
    expect(postalMatches('78700-78799', '78704')).toBe(true);
    expect(postalMatches('78800-78899', '78704')).toBe(false);
    expect(postalMatches('SW1*', 'sw1a 1aa')).toBe(true);
    expect(postalMatches('10000-10999', 'AB123')).toBe(false);
    expect(postalMatches('787*', '')).toBe(false);
  });

  it('normalizes subdivisions', () => {
    expect(normalizeSubdivision('US-NY')).toBe('NY');
    expect(normalizeSubdivision('ny')).toBe('NY');
  });
});

describe('zones', () => {
  it('everything is eligible when no zones exist', () => {
    expect(evaluateZones([], dest)).toEqual({ eligible: true, matchedIncludeZoneIds: [] });
  });

  it('requires a matching include zone when include zones exist', () => {
    const austin = makeZone({ id: 'austin', postalPatterns: ['787*'] });
    const dallas = makeZone({ id: 'dallas', postalPatterns: ['752*'] });
    expect(evaluateZones([austin, dallas], dest)).toEqual({ eligible: true, matchedIncludeZoneIds: ['austin'] });
    expect(evaluateZones([dallas], dest)).toEqual({ eligible: false, reason: 'outside_service_zones' });
  });

  it('exclusions win over inclusions', () => {
    const include = makeZone({ id: 'tx', subdivisions: ['TX'] });
    const exclude = makeZone({ id: 'no-78704', type: 'exclude', postalPatterns: ['78704'] });
    expect(evaluateZones([include, exclude], dest)).toEqual({ eligible: false, reason: 'excluded_zone', zoneId: 'no-78704' });
  });

  it('scopes subdivisions to their country', () => {
    const wa = { country: 'AU', subdivision: 'WA', postalCode: '6000' };
    expect(evaluateZones([makeZone({ countries: [], subdivisions: ['US-WA'] })], wa).eligible).toBe(false);
    expect(evaluateZones([makeZone({ countries: [], subdivisions: ['AU-WA'] })], wa).eligible).toBe(true);
    expect(evaluateZones([makeZone({ countries: ['US'], subdivisions: ['WA'] })], wa).eligible).toBe(false);
  });

  it('ignores inactive zones', () => {
    const exclude = makeZone({ id: 'x', type: 'exclude', countries: ['US'], active: false });
    expect(evaluateZones([exclude], dest).eligible).toBe(true);
  });

  it('computes the effective distance limit', () => {
    const a = makeZone({ id: 'a', maxDistance: 10 });
    const b = makeZone({ id: 'b', maxDistance: 25 });
    expect(effectiveMaxDistanceUnits(null, [a, b], ['a', 'b'])).toBe(25);
    expect(effectiveMaxDistanceUnits(20, [a, b], ['a', 'b'])).toBe(20);
    expect(effectiveMaxDistanceUnits(20, [a], [])).toBe(20);
    expect(effectiveMaxDistanceUnits(null, [a, makeZone({ id: 'c' })], ['a', 'c'])).toBeNull();
  });
});

describe('candidate locations', () => {
  it('requires validated coordinates and respects service countries', () => {
    const primary = makeLocation({ id: 'p' });
    const unvalidated = makeLocation({ id: 'u', isPrimary: false, validatedAt: null });
    const canadaOnly = makeLocation({ id: 'c', isPrimary: false, serviceCountries: ['CA'] });
    const inactive = makeLocation({ id: 'i', isPrimary: false, active: false });
    expect(candidateLocations([canadaOnly, unvalidated, primary, inactive], dest).map((l) => l.id)).toEqual(['p']);
  });
});
