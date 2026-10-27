/**
 * End-to-end test of the real service-plugin handler module with Wix I/O
 * replaced: Wix Data → in-memory gateway, routing → mocked HTTP, billing →
 * stubbed snapshot. Verifies the response contract and error semantics.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryGateway } from '../src/lib/data/memory-gateway';
import { createRepositories } from '../src/lib/data/repositories';
import { publishServerEnv } from '../src/lib/wix/runtime-env';
import { __resetInFlight } from '../src/lib/routing/service';
import { makeLocation, makeRule } from './fixtures';

type Handler = (payload: { request: unknown; metadata: Record<string, unknown> }) => Promise<unknown>;
const captured: { handler?: Handler } = {};

class FakeWixError extends Error {
  constructor(readonly data: unknown) {
    super('wix spi error');
  }
}

vi.mock('@wix/ecom/service-plugins', () => ({
  shippingRates: {
    provideHandlers: (h: { getShippingRates: Handler }) => {
      captured.handler = h.getShippingRates;
    },
    MissingPostalCodeWixError: class extends FakeWixError {
      kind = 'MISSING_POSTAL_CODE';
    },
    InvalidAddressWixError: class extends FakeWixError {
      kind = 'PARTIAL_ADDRESS';
    },
  },
}));

const gateway = new MemoryGateway();
vi.mock('../src/lib/data/wix-gateway', () => ({ wixGateway: gateway }));
vi.mock('../src/lib/billing/sync', () => ({
  loadBilling: async () => ({
    snapshot: {
      isFree: false,
      packageName: 'pro',
      billingCycle: 'MONTHLY',
      autoRenewing: true,
      expirationDate: null,
      freeTrialStatus: 'NOT_AVAILABLE',
      freeTrialAvailable: false,
      fetchedAt: new Date().toISOString(),
    },
    usageMonth: '',
    usageCount: 0,
    lastEventType: null,
    lastEventAt: null,
  }),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

publishServerEnv({
  ROUTING_PROVIDER: 'google',
  ROUTING_API_KEY: 'test-key',
  AUTOCOMPLETE_API_KEY: undefined,
  PLAN_PACKAGE_PRO: 'pro',
  PLAN_PACKAGE_BUSINESS: 'business',
  ENTITLEMENT_OVERRIDE_INSTANCE_IDS: undefined,
  ROLLOUT_MODE: 'all',
  ROLLOUT_ALLOWLIST: undefined,
  CHECKOUT_BUDGET_MS: 4000,
});

await import('../src/extensions/backend/service-plugins/distance-rates/distance-rates');

const wixRequest = (destination: Record<string, string>) => ({
  lineItems: [{ name: 'Mug', quantity: 1, price: '30.00', totalPrice: '30.00', physicalProperties: { shippable: true } }],
  shippingDestination: destination,
  weightUnit: 'KG',
});
const metadata = { instanceId: 'inst-e2e', currency: 'USD', requestId: 'req-1' };

async function seed(settingsOverrides: Record<string, unknown> = {}) {
  const repos = createRepositories(gateway, 'inst-e2e');
  await repos.settings.save({ ...(await repos.settings.get()), pluginEnabled: true, ...settingsOverrides });
  const { id: _l, ...loc } = makeLocation();
  await repos.locations.upsert(loc);
  const { id: _r, ...rule } = makeRule({ handlingFee: '1.5' });
  await repos.rules.upsert(rule);
}

function mockRouting(miles = 10) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('geocode')) {
      return json({ status: 'OK', results: [{ types: ['street_address'], geometry: { location: { lat: 30.27, lng: -97.74 }, location_type: 'ROOFTOP' } }] });
    }
    return json([{ originIndex: 0, destinationIndex: 0, status: {}, condition: 'ROUTE_EXISTS', distanceMeters: miles * 1609.344, duration: '600s' }]);
  });
}

beforeEach(() => {
  gateway.tables.clear();
  fetchMock.mockReset();
  __resetInFlight();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('getShippingRates handler', () => {
  it('returns the documented response shape for a priced destination', async () => {
    await seed();
    mockRouting(10);
    const res = await captured.handler!({
      request: wixRequest({ addressLine1: '500 Congress Ave', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' }),
      metadata,
    });
    expect(res).toEqual({
      shippingRates: [
        {
          code: 'local',
          title: 'Local delivery',
          cost: { price: '25.00', currency: 'USD', additionalCharges: [{ type: 'HANDLING_FEE', price: '1.50', details: 'Handling fee' }] },
        },
      ],
    });
    // Routing keys stay server-side: only provider hosts are called.
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toMatch(/googleapis\.com/);
  });

  it('returns an empty list (not an error, not a zero price) for cart estimates without an address', async () => {
    await seed();
    mockRouting();
    expect(await captured.handler!({ request: wixRequest({ country: 'US' }), metadata })).toEqual({ shippingRates: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty list without tenant context', async () => {
    expect(await captured.handler!({ request: wixRequest({}), metadata: { currency: 'USD' } })).toEqual({ shippingRates: [] });
  });

  it('throws the documented Wix error when a postal code is required', async () => {
    await seed({ requirePostalCode: true });
    await expect(
      captured.handler!({ request: wixRequest({ addressLine1: '1 Main', city: 'Austin', country: 'US' }), metadata }),
    ).rejects.toMatchObject({ kind: 'MISSING_POSTAL_CODE' });
  });

  it('throws PARTIAL_ADDRESS with field names when configured to request details', async () => {
    await seed({ addressErrorBehavior: 'request_details' });
    await expect(captured.handler!({ request: wixRequest({ city: 'Austin', postalCode: '78701', country: 'US' }), metadata })).rejects.toMatchObject({
      kind: 'PARTIAL_ADDRESS',
      data: { fields: [{ field: 'shippingDestination.addressLine1' }] },
    });
  });

  it('applies fail-closed on provider outage (empty list) and fail-open when configured', async () => {
    await seed();
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const dest = { addressLine1: '500 Congress Ave', city: 'Austin', postalCode: '78701', country: 'US' };
    expect(await captured.handler!({ request: wixRequest(dest), metadata })).toEqual({ shippingRates: [] });

    gateway.tables.clear();
    __resetInFlight();
    await seed({ failureMode: 'fail_open', fallbackRate: { title: 'Delivery (estimated)', price: '12' }, fallbackRiskAcknowledged: true });
    const res = (await captured.handler!({ request: wixRequest(dest), metadata })) as { shippingRates: Array<{ code: string; cost: { price: string } }> };
    expect(res.shippingRates).toEqual([expect.objectContaining({ code: 'distance-fallback', cost: expect.objectContaining({ price: '12.00' }) })]);
  });
});
