import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLocation, makeRule, MILE } from '../../../tests/fixtures';
import type { BillingSnapshot } from '../billing/entitlements';
import { MemoryGateway } from '../data/memory-gateway';
import { createRepositories, type BillingRow } from '../data/repositories';
import { __resetInFlight } from '../routing/service';
import type { RoutingProvider } from '../routing/types';
import { locationInputSchema, pricingRuleInputSchema, zoneInputSchema, type PricingRuleInput } from '../validation/schemas';
import { ApiError } from './errors';
import {
  computeHealth,
  duplicateRule,
  getOverview,
  listRules,
  onboardingAction,
  reorderRules,
  saveLocation,
  saveRule,
  saveZone,
  simulate,
  updateSettings,
  type ServiceDeps,
} from './services';

const now = new Date('2026-10-15T00:00:00Z');
const snapshot = (pkg: string | null, isFree = false): BillingSnapshot => ({
  isFree,
  packageName: pkg,
  billingCycle: 'MONTHLY',
  autoRenewing: true,
  expirationDate: null,
  freeTrialStatus: 'NOT_AVAILABLE',
  freeTrialAvailable: false,
  fetchedAt: now.toISOString(),
});

function provider(): RoutingProvider {
  return {
    id: 'google',
    version: 't',
    geocode: vi.fn().mockResolvedValue({ location: { lat: 30, lng: -97 }, quality: 'high', formatted: 'Formatted' }),
    matrix: vi.fn().mockResolvedValue([{ distanceMeters: 10 * MILE, durationSeconds: 600 }]),
  };
}

function deps(plan: 'basic' | 'pro' | null = 'pro', gw = new MemoryGateway(), instanceId = 'inst'): ServiceDeps {
  const row: BillingRow = { snapshot: plan ? snapshot(plan) : snapshot(null, true), usageMonth: '', usageCount: 0, lastEventType: null, lastEventAt: null };
  return {
    repos: createRepositories(gw, instanceId),
    provider: provider(),
    providerId: 'google',
    entitlementConfig: { basicPackages: ['basic'], proPackages: ['pro'], overrideInstanceIds: [], now },
    loadBilling: async () => row,
    refreshBilling: async () => row,
    rolloutMode: 'all',
    rolloutAllowed: true,
    budgetMs: 4000,
    getCheckoutUrl: async (p) => `https://wix.example/checkout/${p}`,
    now: () => now,
  };
}

const ruleInput = (o: Partial<PricingRuleInput> = {}) =>
  pricingRuleInputSchema.parse({ name: 'R', title: 'Delivery', code: 'local', active: true, baseFee: '5', ratePerUnit: '2', ...o });

const locationInput = locationInputSchema.parse({
  name: 'Store',
  address: { addressLine1: '1 Main', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' },
});

beforeEach(() => __resetInFlight());

describe('locations', () => {
  it('geocodes and validates on save; first location becomes primary', async () => {
    const d = deps();
    const { location, warning } = await saveLocation(d, locationInput);
    expect(warning).toBeNull();
    expect(location).toMatchObject({ isPrimary: true, lat: 30, lng: -97, geocodeQuality: 'high', formattedAddress: 'Formatted' });
    expect(location.validatedAt).not.toBeNull();
  });

  it('keeps a single primary location', async () => {
    const d = deps();
    const a = await saveLocation(d, locationInput);
    const b = await saveLocation(d, { ...locationInput, name: 'B', isPrimary: true });
    const all = await d.repos.locations.list();
    expect(all.filter((l) => l.isPrimary).map((l) => l.id)).toEqual([b.location.id]);
    expect(a.location.id).not.toBe(b.location.id);
  });

  it('enforces the plan location limit', async () => {
    const d = deps('basic');
    await saveLocation(d, locationInput);
    await expect(saveLocation(d, locationInput)).rejects.toMatchObject({ code: 'plan_limit_locations' });
  });

  it('saves without coordinates and warns when the routing service is unavailable', async () => {
    const d = { ...deps(), provider: null };
    const { location, warning } = await saveLocation(d, locationInput);
    expect(warning).toBe('geocode_unavailable');
    expect(location.validatedAt).toBeNull();
  });

  it('does not validate low-confidence origins', async () => {
    const d = deps();
    (d.provider!.geocode as ReturnType<typeof vi.fn>).mockResolvedValue({ location: { lat: 1, lng: 1 }, quality: 'low', formatted: '' });
    const { location, warning } = await saveLocation(d, locationInput);
    expect(warning).toBe('geocode_low_confidence');
    expect(location.lat).toBeNull();
  });
});

describe('rules', () => {
  it('blocks advanced rules on Basic', async () => {
    await expect(saveRule(deps('basic'), ruleInput({ surcharges: [{ kind: 'weight_over', thresholdKg: 1, amount: '1' }] }))).rejects.toBeInstanceOf(ApiError);
  });

  it('activating a demo rule clears its demo flag', async () => {
    const saved = await saveRule(deps(), ruleInput({ isDemo: true, active: true }));
    expect(saved.isDemo).toBe(false);
  });

  it('duplicates as an inactive copy', async () => {
    const d = deps();
    const r = await saveRule(d, ruleInput());
    const copy = await duplicateRule(d, r.id);
    expect(copy).toMatchObject({ active: false, name: 'R (copy)' });
  });

  it('reorders priorities and rejects mismatched lists', async () => {
    const d = deps();
    const a = await saveRule(d, ruleInput({ code: 'a' }));
    const b = await saveRule(d, ruleInput({ code: 'b' }));
    await reorderRules(d, [b.id, a.id]);
    const { rules } = await listRules(d);
    expect(rules.map((r) => r.id)).toEqual([b.id, a.id]);
    await expect(reorderRules(d, [a.id])).rejects.toMatchObject({ code: 'reorder_mismatch' });
  });
});

describe('zones', () => {
  it('requires Pro to create zones', async () => {
    const zone = zoneInputSchema.parse({ name: 'Z', type: 'include', countries: ['US'] });
    await expect(saveZone(deps('basic'), zone)).rejects.toMatchObject({ code: 'plan_limit_zones' });
    await expect(saveZone(deps('pro'), zone)).resolves.toMatchObject({ name: 'Z' });
  });
});

describe('settings', () => {
  it('bumps the version, marks review and clamps retention to the plan', async () => {
    const d = deps('basic');
    const before = await d.repos.settings.get();
    const s = await updateSettings(d, { ...before, logRetentionDays: 90 });
    expect(s.settingsVersion).toBe(before.settingsVersion + 1);
    expect(s.logRetentionDays).toBe(14);
    expect(s.onboarding.settingsReviewed).toBe(true);
  });

  it('cannot switch rates on through settings (go-live checks must run)', async () => {
    const d = deps();
    const s = await updateSettings(d, { ...(await d.repos.settings.get()), pluginEnabled: true });
    expect(s.pluginEnabled).toBe(false);
  });
});

describe('billing', () => {
  it('maps a failed Wix checkout URL to a clear error', async () => {
    const { checkoutUrl } = await import('./services');
    const d = { ...deps(), getCheckoutUrl: async () => Promise.reject(new Error('no pricing page')) };
    await expect(checkoutUrl(d, 'pro', 'MONTHLY')).rejects.toMatchObject({ code: 'checkout_url_unavailable' });
    await expect(checkoutUrl(deps(), 'pro', 'MONTHLY')).resolves.toEqual({ url: 'https://wix.example/checkout/pro' });
  });
});

describe('go live', () => {
  it('refuses until a validated location, an active rule and a plan exist', async () => {
    const d = deps();
    await expect(onboardingAction(d, 'go_live')).rejects.toMatchObject({ code: 'golive_no_location' });
    await saveLocation(d, locationInput);
    await expect(onboardingAction(d, 'go_live')).rejects.toMatchObject({ code: 'golive_no_rule' });
    await saveRule(d, ruleInput());
    const live = await onboardingAction(d, 'go_live');
    expect(live.pluginEnabled).toBe(true);
    expect((await onboardingAction(d, 'pause')).pluginEnabled).toBe(false);
  });

  it('refuses without a paid plan', async () => {
    const d = deps(null);
    await saveLocation(d, locationInput);
    await saveRule(d, ruleInput());
    await expect(onboardingAction(d, 'go_live')).rejects.toMatchObject({ code: 'golive_no_plan' });
  });
});

describe('simulator and overview', () => {
  it('simulates with the checkout pipeline and logs a simulator entry', async () => {
    const d = deps();
    await saveLocation(d, locationInput);
    await saveRule(d, ruleInput());
    const res = await simulate(d, {
      destination: { addressLine1: '500 Congress', addressLine2: '', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US' },
      subtotal: '40',
      subtotalBeforeDiscount: null,
      weight: null,
      weightUnit: 'KG',
      currency: 'USD',
      locationId: null,
    });
    expect(res.outcome.kind).toBe('rates');
    expect(res.outcome.options[0].priceMinor).toBe('2500');
    expect(res.trace.map((x) => [x.step, x.attempt, x.error])).toEqual([
      ['geocode', 1, null],
      ['matrix', 1, null],
    ]);
    const overview = await getOverview(d);
    expect(overview.checklist.find((c) => c.id === 'simulate')?.done).toBe(true);
    expect(overview.checklist.find((c) => c.id === 'carrier')?.done).toBe(false);
  });

  it('seeds the demo rule once via onboarding', async () => {
    const d = deps();
    await onboardingAction(d, 'seed');
    await onboardingAction(d, 'seed');
    expect(await d.repos.rules.list()).toHaveLength(1);
  });

  it('computes health from recent checkout outcomes', () => {
    const ok = { status: 'priced', reason: '', providerError: '' };
    const down = { status: 'no_rate', reason: 'routing_unavailable', providerError: 'TIMEOUT' };
    expect(computeHealth([], false)).toBe('not_configured');
    expect(computeHealth([], true)).toBe('idle');
    expect(computeHealth([ok, ok, ok], true)).toBe('healthy');
    expect(computeHealth([ok, ok, ok, ok, ok, ok, ok, ok, ok, down], true)).toBe('degraded');
    expect(computeHealth([down, ok], true)).toBe('down');
  });

  it('keeps tenants apart through the services layer', async () => {
    const gw = new MemoryGateway();
    const a = deps('pro', gw, 'a');
    const b = deps('pro', gw, 'b');
    const r = await saveRule(a, ruleInput());
    await expect(saveRule(b, ruleInput(), r.id)).rejects.toThrow();
    expect((await listRules(b)).rules).toHaveLength(0);
    void makeLocation;
    void makeRule;
  });
});
