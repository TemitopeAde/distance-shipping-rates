import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLocation, makeRule, MILE } from '../../../tests/fixtures';
import type { BillingSnapshot } from '../billing/entitlements';
import { COLLECTIONS } from '../data/gateway';
import { MemoryGateway } from '../data/memory-gateway';
import { createRepositories, type BillingRow, type Repositories } from '../data/repositories';
import { normalizeAddress } from '../routing/address';
import { RoutingError } from '../routing/errors';
import { __resetInFlight } from '../routing/service';
import type { RoutingProvider } from '../routing/types';
import { parseMicros } from '../shipping/money';
import type { QuoteRequest } from './pipeline';
import { runQuote, type RunOptions } from './runner';

const now = new Date();
const snapshot: BillingSnapshot = {
  isFree: false,
  packageName: 'pro',
  billingCycle: 'MONTHLY',
  autoRenewing: true,
  expirationDate: null,
  freeTrialStatus: 'NOT_AVAILABLE',
  freeTrialAvailable: false,
  fetchedAt: now.toISOString(),
};

const request: QuoteRequest = {
  source: 'checkout',
  currency: 'USD',
  destination: normalizeAddress({ addressLine1: '500 Congress Ave', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' }),
  lines: [{ quantity: 1, totalMicros: parseMicros('30'), totalBeforeDiscountMicros: null, weight: null, shippable: true }],
  weightUnit: null,
};

function provider(): RoutingProvider & { geocode: ReturnType<typeof vi.fn> } {
  return {
    id: 'google',
    version: 't',
    geocode: vi.fn().mockResolvedValue({ location: { lat: 30.3, lng: -97.7 }, quality: 'high', formatted: '' }),
    matrix: vi.fn().mockResolvedValue([{ distanceMeters: 10 * MILE, durationSeconds: 900 }]),
  } as never;
}

async function setup(gw = new MemoryGateway()) {
  const repos = createRepositories(gw, 'inst');
  const settings = await repos.settings.get();
  await repos.settings.save({ ...settings, pluginEnabled: true });
  const { id: _l, ...loc } = makeLocation();
  await repos.locations.upsert(loc);
  const { id: _r, ...rule } = makeRule();
  await repos.rules.upsert(rule);
  const row: BillingRow = { snapshot, usageMonth: '', usageCount: 0, lastEventType: null, lastEventAt: null };
  await repos.billing.save(row);
  return { gw, repos };
}

const opts = (repos: Repositories, overrides: Partial<RunOptions> = {}): RunOptions => ({
  repos,
  provider: provider(),
  entitlementConfig: { basicPackages: ['basic'], proPackages: ['pro'], overrideInstanceIds: [], now },
  budgetMs: 4000,
  rolloutAllowed: true,
  requestId: 'wix-request-123',
  loadBilling: async (r) => (await r.billing.get())!,
  ...overrides,
});

beforeEach(() => __resetInFlight());

describe('runQuote', () => {
  it('prices, logs a privacy-safe entry and records provider usage', async () => {
    const { gw, repos } = await setup();
    const { outcome, log } = await runQuote(request, opts(repos));
    expect(outcome.kind).toBe('rates');
    expect(log).toMatchObject({ status: 'priced', price: '25.00', currency: 'USD', destCountry: 'US', destPostalPrefix: '787', providerCalls: 2 });
    expect(log.requestRef).toMatch(/^[0-9a-f]{16}$/);

    const stored = JSON.stringify([...(gw.tables.get(COLLECTIONS.logs)?.values() ?? [])]);
    expect(stored).not.toMatch(/Congress|78701|wix-request-123/);
    expect((await repos.billing.get())?.usageCount).toBe(2);
  });

  it('stores full, JSON-safe diagnostics in the log details', async () => {
    const { gw, repos } = await setup();
    const { log } = await runQuote(request, opts(repos));
    expect(log.details).toMatchObject({
      routingProvider: 'google',
      budgetMs: 4000,
      attemptTimeoutMs: 1500,
      configError: null,
      entitlement: { plan: 'pro', status: 'active', usedLookupsThisMonth: 0 },
      settings: { failureMode: 'fail_closed' },
      cart: { lines: 1, shippableLines: 1, subtotalMicros: '30000000' },
      destination: { country: 'US', subdivision: 'TX', postalPrefix: '787' },
      geocodeQuality: 'high',
      options: [{ price: '25.00', handling: '0.00' }],
    });
    expect(log.details?.trace.map((t) => [t.step, t.attempt, t.error])).toEqual([
      ['geocode', 1, null],
      ['matrix', 1, null],
    ]);
    expect(typeof log.details?.timings.quoteMs).toBe('number');
    expect(() => JSON.stringify(log.details)).not.toThrow();

    const [row] = (await repos.logs.page({ page: 0, pageSize: 1 })).rows;
    expect(row.details?.options[0].breakdown.length).toBeGreaterThan(0);
    expect(JSON.stringify([...(gw.tables.get(COLLECTIONS.logs)?.values() ?? [])])).not.toMatch(/Congress|Austin|78701/);
  });

  it('logs each timed-out provider attempt with its error', async () => {
    const { repos } = await setup();
    const failing = provider();
    failing.geocode.mockRejectedValue(new RoutingError('AUTH', 'Geocoding HTTP 403', 403));
    const { log } = await runQuote(request, opts(repos, { provider: failing }));
    expect(log.details?.trace).toEqual([
      expect.objectContaining({ step: 'geocode', attempt: 1, error: 'AUTH', httpStatus: 403, message: 'Geocoding HTTP 403' }),
    ]);
  });

  it('does not count cache hits against usage', async () => {
    const { repos } = await setup();
    const o = opts(repos);
    await runQuote(request, o);
    await runQuote(request, o);
    expect((await repos.billing.get())?.usageCount).toBe(2);
  });

  it('offers nothing (never throws) when Wix Data is unavailable', async () => {
    const { repos } = await setup();
    const broken = { ...repos, settings: { ...repos.settings, get: () => Promise.reject(new Error('wix data down')) } } as Repositories;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { outcome, log } = await runQuote(request, opts(broken));
    expect(outcome).toMatchObject({ kind: 'no_rate', reason: 'config_unavailable', routingErrorKind: 'NETWORK' });
    expect(log.status).toBe('no_rate');
  });

  it('honours the time budget when config reads hang', async () => {
    const { repos } = await setup();
    const hanging = { ...repos, rules: { ...repos.rules, list: () => new Promise<never>(() => undefined) } } as Repositories;
    const started = Date.now();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { outcome } = await runQuote(request, opts(hanging, { budgetMs: 1500 }));
    expect(outcome).toMatchObject({ kind: 'no_rate', reason: 'config_unavailable', routingErrorKind: 'TIMEOUT' });
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('keeps total time within budget during a provider outage', async () => {
    const { repos } = await setup();
    const slow = provider();
    slow.geocode.mockImplementation((_a: unknown, { signal }: { signal: AbortSignal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new RoutingError('TIMEOUT', 't')))));
    const started = Date.now();
    const { outcome } = await runQuote(request, opts(repos, { provider: slow, budgetMs: 2000 }));
    expect(outcome).toMatchObject({ kind: 'no_rate', reason: 'routing_unavailable', routingErrorKind: 'TIMEOUT' });
    expect(Date.now() - started).toBeLessThan(2600);
  });

  it('respects the rollout gate for checkout but not the simulator', async () => {
    const { repos } = await setup();
    expect((await runQuote(request, opts(repos, { rolloutAllowed: false }))).outcome).toMatchObject({ reason: 'rollout_disabled' });
    expect((await runQuote({ ...request, source: 'simulator' }, opts(repos, { rolloutAllowed: false }))).outcome.kind).toBe('rates');
  });

  it('reports permission failures from Wix Data as AUTH', async () => {
    const { repos } = await setup();
    const forbidden = Object.assign(new Error('Forbidden'), { details: { applicationError: { code: 403 } } });
    const denied = { ...repos, zones: { ...repos.zones, list: () => Promise.reject(forbidden) } } as Repositories;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await runQuote(request, opts(denied))).outcome).toMatchObject({ reason: 'config_unavailable', routingErrorKind: 'AUTH' });
  });

  it('tolerates slow reads up to the configured read timeout', async () => {
    const { repos } = await setup();
    const slowList = repos.rules.list;
    const slow = { ...repos, rules: { ...repos.rules, list: () => new Promise<Awaited<ReturnType<typeof slowList>>>((r) => setTimeout(() => void slowList().then(r), 1400)) } } as Repositories;
    expect((await runQuote(request, opts(slow, { budgetMs: 10000, readTimeoutMs: 5000 }))).outcome.kind).toBe('rates');
  });

  it('survives log write failures', async () => {
    const { repos } = await setup();
    const failingLogs = { ...repos, logs: { ...repos.logs, insert: () => Promise.reject(new Error('quota')) } } as Repositories;
    expect((await runQuote(request, opts(failingLogs))).outcome.kind).toBe('rates');
  });
});
