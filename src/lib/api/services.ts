/**
 * Business logic behind the dashboard API. Pure of Astro/Wix runtime imports:
 * every external capability is injected, so it is unit-tested with the
 * in-memory gateway.
 */
import { resolveEntitlement, ruleExceedsPlan, type Entitlement, type EntitlementConfig } from '../billing/entitlements';
import { seedOnboarding } from '../billing/lifecycle';
import { PLAN_LIMITS } from '../billing/plans';
import { usageThisMonth } from '../billing/usage';
import type { BillingRow, Repositories } from '../data/repositories';
import { detectRuleConflicts } from '../shipping/engine';
import { normalizeAddress } from '../routing/address';
import { RoutingError } from '../routing/errors';
import { withRetry } from '../routing/resilience';
import type { RoutingProvider } from '../routing/types';
import { runQuote } from '../quote/runner';
import type { QuoteOutcome } from '../quote/pipeline';
import type {
  DeliveryZone,
  FulfillmentLocation,
  LocationInput,
  LogsQuery,
  MerchantSettings,
  PricingRule,
  PricingRuleInput,
  SettingsInput,
  SimulateInput,
  ZoneInput,
} from '../validation/schemas';
import { parseMicros } from '../shipping/money';
import { ApiError } from './errors';

export interface ServiceDeps {
  repos: Repositories;
  provider: RoutingProvider | null;
  providerId: string;
  entitlementConfig: EntitlementConfig;
  loadBilling: (repos: Repositories, opts: { timeoutMs: number }) => Promise<BillingRow>;
  refreshBilling: (repos: Repositories) => Promise<BillingRow>;
  rolloutMode: string;
  rolloutAllowed: boolean;
  budgetMs: number;
  getCheckoutUrl: (plan: 'basic' | 'pro', billingCycle: 'MONTHLY' | 'YEARLY') => Promise<string>;
  now?: () => Date;
}

const nowOf = (d: ServiceDeps) => (d.now ? d.now() : new Date());

async function entitlementOf(d: ServiceDeps, opts: { fresh?: boolean } = {}): Promise<{ entitlement: Entitlement; billing: BillingRow }> {
  // `fresh` re-reads billing from Wix (falling back to the stored row) for decisions the merchant makes explicitly.
  const billing = opts.fresh
    ? await d.refreshBilling(d.repos).catch(() => d.loadBilling(d.repos, { timeoutMs: 2500 }))
    : await d.loadBilling(d.repos, { timeoutMs: 2500 });
  return { entitlement: resolveEntitlement(d.repos.instanceId, billing.snapshot, d.entitlementConfig), billing };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(d: ServiceDeps): Promise<MerchantSettings> {
  return d.repos.settings.get();
}

export async function updateSettings(d: ServiceDeps, input: SettingsInput): Promise<MerchantSettings> {
  const current = await d.repos.settings.get();
  const { entitlement } = await entitlementOf(d);
  const logRetentionDays = Math.min(input.logRetentionDays, entitlement.limits.maxLogRetentionDays);
  return d.repos.settings.save({
    ...current,
    ...input,
    // Switching rates on/off goes through the go-live checks (onboardingAction), never through settings.
    pluginEnabled: current.pluginEnabled,
    logRetentionDays,
    // Any change may affect routing or pricing: invalidate cached routes.
    settingsVersion: current.settingsVersion + 1,
    onboarding: { ...current.onboarding, settingsReviewed: true },
  });
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export interface LocationSaveResult {
  location: FulfillmentLocation;
  warning: 'geocode_unavailable' | 'geocode_low_confidence' | 'geocode_failed' | null;
}

async function geocodeLocation(d: ServiceDeps, input: LocationInput) {
  if (!d.provider) return { warning: 'geocode_unavailable' as const };
  const address = normalizeAddress(input.address);
  try {
    const start = Date.now();
    const geo = await withRetry(
      (signal) => d.provider!.geocode(address, { signal }),
      { attemptTimeoutMs: 3000, maxAttempts: 2, baseDelayMs: 200 },
      { at: start + 7000, now: Date.now },
    );
    if (geo.quality === 'low') return { warning: 'geocode_low_confidence' as const, geo };
    return { warning: null, geo };
  } catch (err) {
    if (err instanceof RoutingError && err.isAddressProblem) return { warning: 'geocode_failed' as const };
    return { warning: 'geocode_unavailable' as const };
  }
}

export async function saveLocation(d: ServiceDeps, input: LocationInput, id?: string): Promise<LocationSaveResult> {
  const { entitlement } = await entitlementOf(d);
  const existing = await d.repos.locations.list();
  if (!id && existing.length >= entitlement.limits.maxLocations) {
    throw new ApiError(403, 'plan_limit_locations', 'plan_limit_locations', { limit: entitlement.limits.maxLocations });
  }
  if (id && !existing.some((l) => l.id === id)) throw new ApiError(404, 'not_found');

  const { warning, geo } = await geocodeLocation(d, input);
  const location: Omit<FulfillmentLocation, 'id'> = {
    ...input,
    isPrimary: input.isPrimary || existing.filter((l) => l.id !== id).length === 0,
    lat: geo && warning === null ? geo.location.lat : null,
    lng: geo && warning === null ? geo.location.lng : null,
    geocodeQuality: geo ? geo.quality : null,
    formattedAddress: geo?.formatted ?? '',
    validatedAt: geo && warning === null ? nowOf(d).toISOString() : null,
  };
  const saved = await d.repos.locations.upsert(location, id);
  if (saved.isPrimary) {
    for (const other of existing.filter((l) => l.id !== saved.id && l.isPrimary)) {
      const { id: otherId, ...rest } = other;
      await d.repos.locations.upsert({ ...rest, isPrimary: false }, otherId);
    }
  }
  await d.repos.settings.bumpVersion();
  return { location: saved, warning };
}

export async function deleteLocation(d: ServiceDeps, id: string): Promise<void> {
  if (!(await d.repos.locations.remove(id))) throw new ApiError(404, 'not_found');
  await d.repos.settings.bumpVersion();
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export async function listRules(d: ServiceDeps) {
  const [rules, { entitlement }] = await Promise.all([d.repos.rules.list(), entitlementOf(d, { fresh: true })]);
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return {
    rules: sorted.map((r) => ({ ...r, exceedsPlan: ruleExceedsPlan(r, entitlement.limits) })),
    warnings: detectRuleConflicts(rules),
    limits: entitlement.limits,
  };
}

function assertRuleAllowed(rule: PricingRuleInput, entitlement: Entitlement) {
  if (ruleExceedsPlan({ ...rule, id: 'new' }, entitlement.limits)) {
    throw new ApiError(403, 'plan_limit_advanced_rules');
  }
}

export async function saveRule(d: ServiceDeps, input: PricingRuleInput, id?: string): Promise<PricingRule> {
  const { entitlement } = await entitlementOf(d);
  const existing = await d.repos.rules.list();
  if (!id && existing.length >= entitlement.limits.maxRules) {
    throw new ApiError(403, 'plan_limit_rules', 'plan_limit_rules', { limit: entitlement.limits.maxRules });
  }
  assertRuleAllowed(input, entitlement);
  // Activating a rule clears the demo flag: the merchant has reviewed it.
  const rule = { ...input, isDemo: input.active ? false : input.isDemo };
  return d.repos.rules.upsert(rule, id);
}

export async function duplicateRule(d: ServiceDeps, id: string): Promise<PricingRule> {
  const source = await d.repos.rules.get(id);
  if (!source) throw new ApiError(404, 'not_found');
  const { id: _omit, ...rest } = source;
  return saveRule(d, { ...rest, name: `${rest.name} (copy)`.slice(0, 80), active: false, isDemo: false, priority: rest.priority + 1 });
}

export async function reorderRules(d: ServiceDeps, ids: string[]): Promise<void> {
  const rules = await d.repos.rules.list();
  const byId = new Map(rules.map((r) => [r.id, r]));
  if (ids.length !== rules.length || ids.some((id) => !byId.has(id))) throw new ApiError(400, 'reorder_mismatch');
  for (const [index, id] of ids.entries()) {
    const { id: ruleId, ...rest } = byId.get(id)!;
    const priority = (index + 1) * 10;
    if (rest.priority !== priority) await d.repos.rules.upsert({ ...rest, priority }, ruleId);
  }
}

export async function deleteRule(d: ServiceDeps, id: string): Promise<void> {
  if (!(await d.repos.rules.remove(id))) throw new ApiError(404, 'not_found');
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export async function saveZone(d: ServiceDeps, input: ZoneInput, id?: string): Promise<DeliveryZone> {
  const { entitlement } = await entitlementOf(d);
  if (!entitlement.limits.zones) throw new ApiError(403, 'plan_limit_zones');
  const zone = await d.repos.zones.upsert(input, id);
  await d.repos.settings.bumpVersion();
  return zone;
}

export async function deleteZone(d: ServiceDeps, id: string): Promise<void> {
  // Deleting is always allowed, even after a downgrade.
  if (!(await d.repos.zones.remove(id))) throw new ApiError(404, 'not_found');
  await d.repos.settings.bumpVersion();
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

export async function simulate(d: ServiceDeps, input: SimulateInput) {
  const lines = [
    {
      quantity: 1,
      totalMicros: parseMicros(input.subtotal),
      totalBeforeDiscountMicros: input.subtotalBeforeDiscount === null ? null : parseMicros(input.subtotalBeforeDiscount),
      weight: input.weight,
      shippable: true,
    },
  ];
  const { outcome, latencyMs, trace } = await runQuote(
    {
      source: 'simulator',
      currency: input.currency,
      destination: normalizeAddress(input.destination),
      lines,
      weightUnit: input.weightUnit,
      restrictToLocationId: input.locationId,
    },
    {
      repos: d.repos,
      provider: d.provider,
      entitlementConfig: d.entitlementConfig,
      // The simulator isn't bound by checkout latency: allow slow Wix Data reads (e.g. during `wix dev`).
      budgetMs: Math.max(d.budgetMs, 10000),
      readTimeoutMs: 5000,
      retryPolicy: { attemptTimeoutMs: 4000 },
      collectTrace: true,
      rolloutAllowed: true,
      loadBilling: d.loadBilling,
    },
  );
  return { outcome: serializeOutcome(outcome), latencyMs, trace };
}

/** Converts bigint amounts for JSON transport. */
export function serializeOutcome(outcome: QuoteOutcome) {
  return JSON.parse(JSON.stringify(outcome, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export async function listLogs(d: ServiceDeps, q: LogsQuery) {
  const settings = await d.repos.settings.get();
  const cutoff = new Date(nowOf(d).getTime() - settings.logRetentionDays * 86_400_000);
  // Retention is enforced opportunistically when merchants look at logs.
  await d.repos.logs.purgeOlderThan(cutoff, 100).catch(() => 0);
  await d.repos.routeCache.purgeExpired(nowOf(d), 100).catch(() => 0);
  return d.repos.logs.page({
    status: q.status === 'all' ? undefined : q.status,
    source: q.source === 'all' ? undefined : q.source,
    page: q.page,
    pageSize: q.pageSize,
  });
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export async function getBilling(d: ServiceDeps, opts: { refresh: boolean }) {
  const billing = opts.refresh ? await d.refreshBilling(d.repos) : await d.loadBilling(d.repos, { timeoutMs: 2500 });
  const entitlement = resolveEntitlement(d.repos.instanceId, billing.snapshot, d.entitlementConfig);
  return {
    entitlement,
    snapshot: billing.snapshot,
    usage: { used: usageThisMonth(billing, nowOf(d)), limit: entitlement.limits.monthlyLookups },
    plans: { basic: PLAN_LIMITS.basic, pro: PLAN_LIMITS.pro },
  };
}

export async function checkoutUrl(d: ServiceDeps, plan: 'basic' | 'pro', billingCycle: 'MONTHLY' | 'YEARLY') {
  try {
    return { url: await d.getCheckoutUrl(plan, billingCycle) };
  } catch {
    // Wix only issues checkout URLs when an external pricing page is configured for the app.
    throw new ApiError(502, 'checkout_url_unavailable');
  }
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function onboardingAction(d: ServiceDeps, action: 'seed' | 'confirm_carrier' | 'confirm_checkout_test' | 'go_live' | 'pause') {
  if (action === 'seed') {
    await seedOnboarding(d.repos);
    return d.repos.settings.get();
  }
  const s = await d.repos.settings.get();
  if (action === 'confirm_carrier') return d.repos.settings.save({ ...s, onboarding: { ...s.onboarding, carrierEnabledConfirmed: true } });
  if (action === 'confirm_checkout_test') return d.repos.settings.save({ ...s, onboarding: { ...s.onboarding, checkoutTested: true } });
  if (action === 'pause') return d.repos.settings.save({ ...s, pluginEnabled: false });

  // go_live: refuse unless the minimum safe configuration exists.
  const [locations, rules, { entitlement }] = await Promise.all([d.repos.locations.list(), d.repos.rules.list(), entitlementOf(d, { fresh: true })]);
  if (!locations.some((l) => l.active && l.validatedAt)) throw new ApiError(409, 'golive_no_location');
  if (!rules.some((r) => r.active && !r.isDemo)) throw new ApiError(409, 'golive_no_rule');
  if (!entitlement.limits.checkout) throw new ApiError(409, 'golive_no_plan');
  return d.repos.settings.save({
    ...s,
    pluginEnabled: true,
    onboarding: { ...s.onboarding, wentLiveAt: s.onboarding.wentLiveAt ?? nowOf(d).toISOString() },
  });
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'not_configured' | 'idle';

export function computeHealth(rows: Array<{ status: string; reason: string; providerError: string }>, routingConfigured: boolean): HealthStatus {
  if (!routingConfigured) return 'not_configured';
  if (rows.length === 0) return 'idle';
  const outages = rows.filter((r) => r.reason === 'routing_unavailable' || r.reason === 'config_unavailable').length;
  const ratio = outages / rows.length;
  if (ratio >= 0.5) return 'down';
  if (ratio >= 0.1) return 'degraded';
  return 'healthy';
}

export async function getOverview(d: ServiceDeps) {
  const [settings, locations, rules, { entitlement, billing }, recent, simulations, checkouts] = await Promise.all([
    d.repos.settings.get(),
    d.repos.locations.list(),
    d.repos.rules.list(),
    entitlementOf(d),
    d.repos.logs.page({ page: 0, pageSize: 50 }),
    d.repos.logs.page({ source: 'simulator', page: 0, pageSize: 1 }),
    d.repos.logs.page({ source: 'checkout', page: 0, pageSize: 1 }),
  ]);

  const routingConfigured = d.provider !== null;
  const hasLocation = locations.some((l) => l.active && l.validatedAt);
  const hasRule = rules.some((r) => r.active && !r.isDemo);
  const checkoutSeen = (checkouts.total ?? checkouts.rows.length) > 0;

  const checklist = [
    { id: 'location', done: hasLocation },
    { id: 'units', done: settings.onboarding.settingsReviewed },
    { id: 'rules', done: hasRule },
    { id: 'routing', done: routingConfigured },
    { id: 'fallback', done: settings.onboarding.settingsReviewed },
    { id: 'carrier', done: settings.onboarding.carrierEnabledConfirmed || checkoutSeen, evidence: checkoutSeen ? 'checkout_requests_seen' : null },
    { id: 'simulate', done: (simulations.total ?? simulations.rows.length) > 0 },
    { id: 'test_checkout', done: settings.onboarding.checkoutTested },
    { id: 'go_live', done: settings.pluginEnabled },
  ];

  const lastCheckout = recent.rows.find((r) => r.source === 'checkout') ?? null;
  return {
    checklist,
    completion: Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100),
    health: computeHealth(recent.rows.filter((r) => r.source === 'checkout').slice(0, 20), routingConfigured),
    pluginEnabled: settings.pluginEnabled,
    unit: settings.unit,
    failureMode: settings.failureMode,
    lastCheckoutAt: lastCheckout?.createdAt ?? null,
    recent: recent.rows.slice(0, 8),
    usage: { used: usageThisMonth(billing, nowOf(d)), limit: entitlement.limits.monthlyLookups },
    entitlement,
    routing: { provider: d.providerId, configured: routingConfigured },
    rollout: { mode: d.rolloutMode, allowed: d.rolloutAllowed },
    ruleWarnings: detectRuleConflicts(rules),
    counts: { locations: locations.length, rules: rules.length },
  };
}
