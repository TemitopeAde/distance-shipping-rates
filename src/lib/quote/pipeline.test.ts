import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLocation, makeRule, makeZone, MILE } from '../../../tests/fixtures';
import { resolveEntitlement, type BillingSnapshot } from '../billing/entitlements';
import { parseMicros } from '../shipping/money';
import { normalizeAddress } from '../routing/address';
import { RoutingError } from '../routing/errors';
import { __resetInFlight, type CachedRoutes, type RouteCacheStore } from '../routing/service';
import type { RoutingProvider } from '../routing/types';
import { defaultSettings } from '../validation/defaults';
import type { MerchantSettings } from '../validation/schemas';
import { computeQuote, type QuoteDeps, type QuoteRequest } from './pipeline';

class MemoryCache implements RouteCacheStore {
  store = new Map<string, CachedRoutes>();
  async get(k: string) {
    return this.store.get(k) ?? null;
  }
  async set(k: string, v: CachedRoutes) {
    this.store.set(k, v);
  }
}

const now = new Date('2026-10-15T12:00:00Z');
const proSnapshot: BillingSnapshot = {
  isFree: false,
  packageName: 'pro',
  billingCycle: 'MONTHLY',
  autoRenewing: true,
  expirationDate: null,
  freeTrialStatus: 'NOT_AVAILABLE',
  freeTrialAvailable: false,
  fetchedAt: now.toISOString(),
};
const entitlementCfg = { basicPackages: ['basic'], proPackages: ['pro'], overrideInstanceIds: [], now };
const pro = resolveEntitlement('inst', proSnapshot, entitlementCfg);

function provider(miles: Array<number | null> = [10], overrides: Partial<RoutingProvider> = {}) {
  return {
    id: 'google',
    version: 't',
    geocode: vi.fn().mockResolvedValue({ location: { lat: 30.3, lng: -97.7 }, quality: 'high', formatted: '' }),
    matrix: vi.fn().mockResolvedValue(miles.map((m) => (m === null ? null : { distanceMeters: m * MILE, durationSeconds: 600 }))),
    ...overrides,
  } as RoutingProvider & { geocode: ReturnType<typeof vi.fn>; matrix: ReturnType<typeof vi.fn> };
}

function settings(overrides: Partial<MerchantSettings> = {}): MerchantSettings {
  return { ...defaultSettings(), pluginEnabled: true, ...overrides };
}

function deps(overrides: Partial<QuoteDeps> = {}, cfg: Partial<QuoteDeps['config']> = {}): QuoteDeps {
  return {
    config: { settings: settings(), locations: [makeLocation()], rules: [makeRule()], zones: [], ...cfg },
    entitlement: pro,
    provider: provider(),
    cache: new MemoryCache(),
    usedLookupsThisMonth: 0,
    deadline: { at: Date.now() + 4000, now: () => Date.now() },
    ...overrides,
  };
}

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    source: 'checkout',
    currency: 'USD',
    destination: normalizeAddress({ addressLine1: '500 Congress Ave', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' }),
    lines: [{ quantity: 2, totalMicros: parseMicros('40'), totalBeforeDiscountMicros: parseMicros('50'), weight: 1, shippable: true }],
    weightUnit: 'KG',
    ...overrides,
  };
}

beforeEach(() => __resetInFlight());

describe('computeQuote — happy path', () => {
  it('returns a rate priced by road distance', async () => {
    const out = await computeQuote(request(), deps());
    expect(out.kind).toBe('rates');
    if (out.kind !== 'rates') return;
    expect(out.options).toHaveLength(1);
    expect(out.options[0].priceMinor).toBe(2500n);
    expect(out.originLocationId).toBe('loc-1');
    expect(out.providerCalls).toBe(2);
  });

  it('serves repeated invocations (rapid cart refreshes) from cache without provider calls', async () => {
    const d = deps();
    await computeQuote(request(), d);
    const again = await computeQuote(request(), d);
    expect(again).toMatchObject({ kind: 'rates', cacheHit: true, providerCalls: 0 });
    expect((d.provider as ReturnType<typeof provider>).geocode).toHaveBeenCalledTimes(1);
  });

  it('re-routes when the address changes', async () => {
    const d = deps();
    await computeQuote(request(), d);
    await computeQuote(request({ destination: normalizeAddress({ addressLine1: '1 Other Rd', city: 'Austin', postalCode: '78702', country: 'US' }) }), d);
    expect((d.provider as ReturnType<typeof provider>).geocode).toHaveBeenCalledTimes(2);
  });

  it('chooses the nearest origin under the nearest strategy', async () => {
    const out = await computeQuote(
      request(),
      deps(
        { provider: provider([12, 4]) },
        {
          settings: settings({ originStrategy: 'nearest' }),
          locations: [makeLocation({ id: 'a' }), makeLocation({ id: 'b', isPrimary: false })],
        },
      ),
    );
    expect(out).toMatchObject({ kind: 'rates', originLocationId: 'b' });
  });

  it('applies discounts-aware free delivery from the request totals', async () => {
    const rule = makeRule({ freeDelivery: { enabled: true, threshold: '45', basis: 'before_discount', waiveHandling: true } });
    const out = await computeQuote(request(), deps({}, { rules: [rule] }));
    expect(out.kind === 'rates' && out.options[0].priceMinor).toBe(0n);
  });
});

describe('computeQuote — never invents charges', () => {
  it('offers nothing when the plugin is disabled', async () => {
    const out = await computeQuote(request(), deps({}, { settings: settings({ pluginEnabled: false }) }));
    expect(out).toMatchObject({ kind: 'no_rate', reason: 'plugin_disabled' });
  });

  it('offers nothing for an incomplete address and makes no provider call', async () => {
    const d = deps();
    const out = await computeQuote(request({ destination: normalizeAddress({ country: 'US', postalCode: '78701' }) }), d);
    expect(out).toMatchObject({ kind: 'no_rate', reason: 'address_incomplete' });
    expect((d.provider as ReturnType<typeof provider>).geocode).not.toHaveBeenCalled();
  });

  it('asks Wix for more address detail when configured', async () => {
    const out = await computeQuote(
      request({ destination: normalizeAddress({ country: 'US', postalCode: '78701' }) }),
      deps({}, { settings: settings({ addressErrorBehavior: 'request_details' }) }),
    );
    expect(out).toMatchObject({ kind: 'address_error', error: 'partial_address' });
  });

  it('requires a postal code when configured', async () => {
    const out = await computeQuote(
      request({ destination: normalizeAddress({ addressLine1: '1 Main', city: 'Austin', country: 'US' }) }),
      deps({}, { settings: settings({ requirePostalCode: true }) }),
    );
    expect(out).toMatchObject({ kind: 'address_error', error: 'missing_postal_code' });
  });

  it('rejects excluded zones before routing', async () => {
    const d = deps({}, { zones: [makeZone({ type: 'exclude', postalPatterns: ['787*'] })] });
    const out = await computeQuote(request(), d);
    expect(out).toMatchObject({ kind: 'no_rate', reason: 'excluded_zone' });
    expect((d.provider as ReturnType<typeof provider>).geocode).not.toHaveBeenCalled();
  });

  it('enforces max delivery distance', async () => {
    const out = await computeQuote(request(), deps({ provider: provider([30]) }, { settings: settings({ maxDeliveryDistance: 20 }) }));
    expect(out).toMatchObject({ kind: 'no_rate', reason: 'beyond_max_distance' });
  });

  it('enforces per-location service radius', async () => {
    const out = await computeQuote(request(), deps({}, { locations: [makeLocation({ serviceRadius: 5 })] }));
    expect(out).toMatchObject({ kind: 'no_rate', reason: 'beyond_max_distance' });
  });

  it('never falls back for unroutable or low-confidence addresses, even in fail-open mode', async () => {
    const failOpen = settings({ failureMode: 'fail_open', fallbackRate: { title: 'Delivery', price: '9.99' }, fallbackRiskAcknowledged: true });
    const noRoute = await computeQuote(request(), deps({ provider: provider([null]) }, { settings: failOpen }));
    expect(noRoute).toMatchObject({ kind: 'no_rate', reason: 'no_route' });
    const low = provider([10], { geocode: vi.fn().mockResolvedValue({ location: { lat: 0, lng: 0 }, quality: 'low', formatted: '' }) } as never);
    expect(await computeQuote(request(), deps({ provider: low }, { settings: failOpen }))).toMatchObject({ kind: 'no_rate', reason: 'low_confidence' });
  });

  it('ignores inactive demo rules', async () => {
    const out = await computeQuote(request(), deps({}, { rules: [makeRule({ isDemo: true, active: false })] }));
    expect(out).toMatchObject({ kind: 'no_rate', reason: 'no_matching_rule' });
  });

  it('explains why each rule did not apply', async () => {
    const basic = resolveEntitlement('inst', { ...proSnapshot, packageName: 'basic' }, entitlementCfg);
    const rules = [
      makeRule({ id: 'a', name: 'Sample', isDemo: true, active: false, priority: 1 }),
      makeRule({ id: 'b', name: 'Off', active: false, priority: 2 }),
      makeRule({ id: 'c', name: 'Short range', maxDistance: 5, priority: 3 }),
      makeRule({ id: 'd', name: 'Tiered', priority: 4, mode: 'graduated_tiers', tiers: [{ upTo: null, ratePerUnit: '1', flatFee: '0' }] }),
    ];
    const out = await computeQuote(request(), deps({ entitlement: basic }, { rules }));
    expect(out.kind === 'no_rate' && out.ruleDiagnostics?.map((d) => [d.name, d.reason])).toEqual([
      ['Sample', 'demo'],
      ['Off', 'inactive'],
      ['Short range', 'exceeds_rule_max_distance'],
      ['Tiered', 'plan_advanced'],
    ]);
  });

  it('explains why no location can serve the destination', async () => {
    expect(await computeQuote(request(), deps({}, { locations: [] }))).toMatchObject({ reason: 'no_locations' });
    expect(await computeQuote(request(), deps({}, { locations: [makeLocation({ active: false })] }))).toMatchObject({ reason: 'no_locations' });
    expect(await computeQuote(request(), deps({}, { locations: [makeLocation({ validatedAt: null, lat: null, lng: null })] }))).toMatchObject({
      reason: 'locations_unverified',
    });
    expect(await computeQuote(request(), deps({}, { locations: [makeLocation({ serviceCountries: ['CA'] })] }))).toMatchObject({
      reason: 'location_country_mismatch',
    });
  });

  it('rejects invalid currency', async () => {
    expect(await computeQuote(request({ currency: 'us' }), deps())).toMatchObject({ kind: 'no_rate', reason: 'invalid_currency' });
  });

  it('offers nothing when no items need shipping', async () => {
    const out = await computeQuote(request({ lines: [{ quantity: 1, totalMicros: 1n, totalBeforeDiscountMicros: null, weight: null, shippable: false }] }), deps());
    expect(out).toMatchObject({ kind: 'no_rate', reason: 'no_shippable_items' });
  });
});

describe('computeQuote — outages and fallback policy', () => {
  const down = () => provider([10], { geocode: vi.fn().mockRejectedValue(new RoutingError('UPSTREAM_5XX', 'down')) } as never);

  it('fail-closed: offers nothing on provider outage', async () => {
    expect(await computeQuote(request(), deps({ provider: down() }))).toMatchObject({ kind: 'no_rate', reason: 'routing_unavailable', routingErrorKind: 'UPSTREAM_5XX' });
  });

  it('fail-open: returns the flat fallback rate when acknowledged', async () => {
    const s = settings({ failureMode: 'fail_open', fallbackRate: { title: 'Delivery (estimated)', price: '12' }, fallbackRiskAcknowledged: true });
    const out = await computeQuote(request(), deps({ provider: down() }, { settings: s }));
    expect(out).toMatchObject({ kind: 'fallback', reason: 'routing_unavailable' });
    expect(out.kind === 'fallback' && out.option.priceMinor).toBe(1200n);
  });

  it('fail-open without acknowledgement behaves as fail-closed', async () => {
    const s = settings({ failureMode: 'fail_open', fallbackRate: { title: 'X', price: '12' }, fallbackRiskAcknowledged: false });
    expect(await computeQuote(request(), deps({ provider: down() }, { settings: s }))).toMatchObject({ kind: 'no_rate' });
  });

  it('never returns a zero-cost fallback', async () => {
    const s = settings({ failureMode: 'fail_open', fallbackRate: { title: 'X', price: '0' }, fallbackRiskAcknowledged: true });
    expect(await computeQuote(request(), deps({ provider: down() }, { settings: s }))).toMatchObject({ kind: 'no_rate' });
  });

  it('treats a missing routing key as an outage', async () => {
    expect(await computeQuote(request(), deps({ provider: null }))).toMatchObject({ kind: 'no_rate', reason: 'routing_unavailable', routingErrorKind: 'NOT_CONFIGURED' });
  });

  it('stops provider calls once the monthly allowance is used, but still serves cache hits', async () => {
    const d = deps();
    await computeQuote(request(), d);
    const capped = { ...d, usedLookupsThisMonth: 1_000_000 };
    expect(await computeQuote(request(), capped)).toMatchObject({ kind: 'rates', cacheHit: true });
    const other = request({ destination: normalizeAddress({ addressLine1: '2 Main', city: 'Austin', postalCode: '78702', country: 'US' }) });
    expect(await computeQuote(other, capped)).toMatchObject({ kind: 'no_rate', reason: 'quota_exceeded' });
  });
});

describe('computeQuote — entitlements', () => {
  it('blocks checkout rates without a plan but allows the simulator', async () => {
    const none = resolveEntitlement('inst', { ...proSnapshot, isFree: true }, entitlementCfg);
    expect(await computeQuote(request(), deps({ entitlement: none }))).toMatchObject({ kind: 'no_rate', reason: 'not_entitled' });
    expect(await computeQuote(request({ source: 'simulator' }), deps({ entitlement: none }))).toMatchObject({ kind: 'rates' });
  });

  it('uses the fallback rate on lost access when the merchant chose that', async () => {
    const none = resolveEntitlement('inst', { ...proSnapshot, isFree: true }, entitlementCfg);
    const s = settings({ accessEndBehavior: 'fallback_rate', fallbackRate: { title: 'Delivery', price: '10' } });
    expect(await computeQuote(request(), deps({ entitlement: none }, { settings: s }))).toMatchObject({ kind: 'fallback', reason: 'not_entitled' });
  });

  it('skips advanced rules on Basic instead of repricing them', async () => {
    const basic = resolveEntitlement('inst', { ...proSnapshot, packageName: 'basic' }, entitlementCfg);
    const tiered = makeRule({ id: 't', mode: 'graduated_tiers', tiers: [{ upTo: null, ratePerUnit: '1', flatFee: '0' }] });
    expect(await computeQuote(request(), deps({ entitlement: basic }, { rules: [tiered] }))).toMatchObject({ kind: 'no_rate', reason: 'no_matching_rule' });
  });

  it('limits Basic to one origin', async () => {
    const basic = resolveEntitlement('inst', { ...proSnapshot, packageName: 'basic' }, entitlementCfg);
    const p = provider([10]);
    await computeQuote(
      request(),
      deps({ entitlement: basic, provider: p }, { settings: settings({ originStrategy: 'nearest' }), locations: [makeLocation({ id: 'a' }), makeLocation({ id: 'b', isPrimary: false })] }),
    );
    expect(p.matrix.mock.calls[0][0]).toHaveLength(1);
  });
});
