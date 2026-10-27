import {
  pricingRuleInputSchema,
  zoneInputSchema,
  type DeliveryZone,
  type FulfillmentLocation,
  type PricingRule,
  type PricingRuleInput,
  type ZoneInput,
} from '../src/lib/validation/schemas';

export function makeRule(overrides: Partial<PricingRuleInput> & { id?: string } = {}): PricingRule {
  const { id = 'rule-1', ...rest } = overrides;
  const parsed = pricingRuleInputSchema.parse({
    title: 'Local delivery',
    code: 'local',
    active: true,
    baseFee: '5',
    ratePerUnit: '2',
    distanceRounding: { increment: 0.1, mode: 'up' },
    ...rest,
  });
  return { id, ...parsed };
}

export function makeZone(overrides: Partial<ZoneInput> & { id?: string } = {}): DeliveryZone {
  const { id = 'zone-1', ...rest } = overrides;
  return { id, ...zoneInputSchema.parse({ name: 'Zone', type: 'include', countries: ['US'], ...rest }) };
}

export function makeLocation(overrides: Partial<FulfillmentLocation> = {}): FulfillmentLocation {
  return {
    id: 'loc-1',
    name: 'Main store',
    address: { addressLine1: '1 Main St', addressLine2: '', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' },
    isPrimary: true,
    active: true,
    serviceRadius: null,
    serviceCountries: [],
    lat: 30.2672,
    lng: -97.7431,
    geocodeQuality: 'high',
    formattedAddress: '1 Main St, Austin, TX 78701, USA',
    validatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export const MILE = 1609.344;
