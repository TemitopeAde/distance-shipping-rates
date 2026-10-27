import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLocation, makeRule, MILE } from '../../../tests/fixtures';
import { MemoryGateway } from '../data/memory-gateway';
import { createRepositories, type BillingRow } from '../data/repositories';
import { __resetInFlight } from '../routing/service';
import type { RoutingProvider } from '../routing/types';
import { ApiError } from './errors';
import { ASSISTANT_TOOLS, runAssistantTool } from './assistant-tools';
import type { ServiceDeps } from './services';

const now = new Date('2026-10-15T00:00:00Z');

function deps(gw = new MemoryGateway()): ServiceDeps {
  const row: BillingRow = {
    snapshot: { isFree: false, packageName: 'pro', billingCycle: 'MONTHLY', autoRenewing: true, expirationDate: null, freeTrialStatus: 'NOT_AVAILABLE', freeTrialAvailable: false, fetchedAt: now.toISOString() },
    usageMonth: '',
    usageCount: 0,
    lastEventType: null,
    lastEventAt: null,
  };
  const provider: RoutingProvider = {
    id: 'google',
    version: 't',
    geocode: vi.fn().mockResolvedValue({ location: { lat: 30, lng: -97 }, quality: 'high', formatted: 'Formatted' }),
    matrix: vi.fn().mockResolvedValue([{ distanceMeters: 10 * MILE, durationSeconds: 600 }]),
  };
  return {
    repos: createRepositories(gw, 'inst'),
    provider,
    providerId: 'google',
    entitlementConfig: { proPackages: ['pro'], businessPackages: ['business'], overrideInstanceIds: [], now },
    loadBilling: async () => row,
    refreshBilling: async () => row,
    rolloutMode: 'all',
    rolloutAllowed: true,
    budgetMs: 4000,
    getCheckoutUrl: async (p) => `https://wix.example/checkout/${p}`,
    now: () => now,
  };
}

beforeEach(() => __resetInFlight());

describe('runAssistantTool', () => {
  it('answers every read tool on an empty site', async () => {
    const d = deps();
    for (const tool of ASSISTANT_TOOLS.filter((t) => t.startsWith('list-') || t.startsWith('get-delivery') || t === 'get-plan-and-usage')) {
      await expect(runAssistantTool(d, tool, {})).resolves.toBeTypeOf('object');
    }
  });

  it('declares exactly the tools it handles', () => {
    const source = readFileSync(new URL('../../extensions/backend/app-tools/aria-tools/aria-tools.extension.ts', import.meta.url), 'utf8');
    const declared = [...source.matchAll(/methodName: '([^']+)'/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual([...ASSISTANT_TOOLS].sort());
    expect(declared.every((name) => name.length <= 30)).toBe(true);
    expect(source.match(/activated: true/g)?.length).toBe(ASSISTANT_TOOLS.length);
  });

  it('creates, partially updates, duplicates, reorders and deletes rules', async () => {
    const d = deps();
    const created = await runAssistantTool(d, 'create-pricing-rule', { rule: { title: 'Local delivery', code: 'local', baseFee: '5', ratePerUnit: '1.5', active: true } });
    const id = (created.rule as { id: string }).id;
    const updated = await runAssistantTool(d, 'update-pricing-rule', { id, changes: { baseFee: '6', freeDelivery: { enabled: true, threshold: '100' } } });
    expect(updated.rule).toMatchObject({ baseFee: '6', ratePerUnit: '1.5', freeDelivery: { enabled: true, threshold: '100', basis: 'after_discount' } });
    const copy = await runAssistantTool(d, 'duplicate-pricing-rule', { id });
    const copyId = (copy.rule as { id: string }).id;
    await runAssistantTool(d, 'reorder-pricing-rules', { ids: [copyId, id] });
    await runAssistantTool(d, 'delete-pricing-rule', { id: copyId });
    expect(((await runAssistantTool(d, 'list-pricing-rules', {})).rules as unknown[]).length).toBe(1);
  });

  it('manages zones, locations, settings and go-live', async () => {
    const d = deps();
    const zone = await runAssistantTool(d, 'create-delivery-zone', { zone: { name: 'Texas', type: 'include', countries: ['US'], subdivisions: ['TX'] } });
    const zoneId = (zone.zone as { id: string }).id;
    expect((await runAssistantTool(d, 'update-delivery-zone', { id: zoneId, changes: { maxDistance: 30 } })).zone).toMatchObject({ subdivisions: ['TX'], maxDistance: 30 });
    await runAssistantTool(d, 'delete-delivery-zone', { id: zoneId });

    const loc = await runAssistantTool(d, 'create-fulfillment-location', {
      location: { name: 'Store', address: { addressLine1: '1 Main', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' } },
    });
    expect(loc).toMatchObject({ ok: true, warning: null, location: { isPrimary: true } });
    const locId = (loc.location as { id: string }).id;
    expect((await runAssistantTool(d, 'update-fulfillment-location', { id: locId, changes: { serviceRadius: 25 } })).location).toMatchObject({ name: 'Store', serviceRadius: 25 });

    const settings = await runAssistantTool(d, 'update-delivery-settings', { changes: { unit: 'km', routing: { avoidTolls: true }, pluginEnabled: true } });
    expect(settings.settings).toMatchObject({ unit: 'km', routing: { avoidTolls: true, avoidHighways: false }, pluginEnabled: false });

    await expect(runAssistantTool(d, 'run-delivery-setup-action', { action: 'go_live' })).rejects.toMatchObject({ code: 'golive_no_rule' });
    await runAssistantTool(d, 'create-pricing-rule', { rule: { title: 'Delivery', code: 'local', baseFee: '5', active: true } });
    expect(await runAssistantTool(d, 'run-delivery-setup-action', { action: 'go_live' })).toMatchObject({ ok: true, live: true });
    await expect(runAssistantTool(d, 'run-delivery-setup-action', { action: 'seed' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('returns an upgrade link', async () => {
    expect(await runAssistantTool(deps(), 'get-plan-upgrade-link', { plan: 'business' })).toEqual({ url: 'https://wix.example/checkout/business' });
  });

  it('quotes a destination with readable prices', async () => {
    const d = deps();
    await d.repos.locations.upsert(makeLocation());
    await d.repos.rules.upsert(makeRule());
    const res = await runAssistantTool(d, 'quote-delivery-rate', { destination: { addressLine1: '500 Congress', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' }, subtotal: '20' }, 'USD');
    expect(res.result).toBe('priced');
    expect((res.options as Array<{ price: string }>)[0].price).toMatch(/^\d+\.\d{2} USD$/);
  });

  it('rejects bad input and unknown tools', async () => {
    const d = deps();
    await expect(runAssistantTool(d, 'quote-delivery-rate', {}, 'USD')).rejects.toBeInstanceOf(ApiError);
    await expect(runAssistantTool(d, 'delete-everything', {})).rejects.toMatchObject({ status: 404 });
  });
});
