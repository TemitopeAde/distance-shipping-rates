/**
 * The quote pipeline shared by the checkout service plugin and the dashboard
 * simulator. All I/O is injected so it is fully testable.
 *
 * Steps (cheapest checks first, so ineligible requests cost no provider call):
 *   kill switch → currency → entitlement → shippable items → address completeness
 *   → zones → origins → usage allowance → routing → origin choice → distance limits
 *   → rule selection → sanity checks
 */
import { ruleExceedsPlan, type Entitlement } from '../billing/entitlements';
import { isValidCurrencyCode } from '../shipping/currency';
import {
  candidateLocations,
  whyNoLocation,
  effectiveMaxDistanceUnits,
  evaluateZones,
  withinDistance,
} from '../shipping/eligibility';
import { selectRates, sortRules, type BreakdownLine, type CartFacts, type RuleRejection } from '../shipping/engine';
import { microsToMinor, parseMicros } from '../shipping/money';
import { metersToUnits, toKg, type DistanceUnit, type WeightUnit } from '../shipping/units';
import { assessAddress } from '../routing/address';
import type { RoutingError, RoutingErrorKind } from '../routing/errors';
import { resolveRoutes, type RouteCacheStore, type RouteTraceEntry } from '../routing/service';
import type { RetryPolicy } from '../routing/resilience';
import type { Deadline } from '../routing/resilience';
import type { NormalizedAddress, RoutingProvider } from '../routing/types';
import type { DeliveryZone, FulfillmentLocation, GeocodeQuality, MerchantSettings, PricingRule } from '../validation/schemas';

export interface QuoteLine {
  quantity: number;
  /** Line total after discounts, micro-units. */
  totalMicros: bigint;
  /** Line total before discounts, micro-units (null if unknown). */
  totalBeforeDiscountMicros: bigint | null;
  /** Per-unit weight in the request's weight unit (null if unknown). */
  weight: number | null;
  shippable: boolean;
}

export interface QuoteRequest {
  source: 'checkout' | 'simulator';
  currency: string;
  destination: NormalizedAddress;
  lines: QuoteLine[];
  weightUnit: WeightUnit | null;
  restrictToLocationId?: string | null;
}

export interface QuoteConfig {
  settings: MerchantSettings;
  locations: FulfillmentLocation[];
  rules: PricingRule[];
  zones: DeliveryZone[];
}

export interface QuoteDeps {
  config: QuoteConfig;
  entitlement: Entitlement;
  /** Null when no routing key is configured. */
  provider: RoutingProvider | null;
  cache: RouteCacheStore;
  usedLookupsThisMonth: number;
  deadline: Deadline;
  /** Overrides for provider timeouts/retries (the simulator allows slower calls than checkout). */
  retryPolicy?: Partial<RetryPolicy>;
  trace?: RouteTraceEntry[];
}

export interface QuoteOption {
  code: string;
  title: string;
  ruleId: string | null;
  priceMinor: bigint;
  handlingMinor: bigint;
  currency: string;
  freeDelivery: boolean;
  billedUnits: number | null;
  breakdown: BreakdownLine[];
}

export type NoRateReason =
  | 'plugin_disabled'
  | 'not_entitled'
  | 'invalid_currency'
  | 'no_shippable_items'
  | 'address_incomplete'
  | 'excluded_zone'
  | 'outside_service_zones'
  | 'no_locations'
  | 'locations_unverified'
  | 'location_country_mismatch'
  | 'bad_address'
  | 'low_confidence'
  | 'no_route'
  | 'beyond_max_distance'
  | 'no_matching_rule'
  | 'routing_unavailable'
  | 'quota_exceeded'
  | 'config_unavailable'
  | 'rollout_disabled';

/** Why a rule did not produce an option (shown in the simulator when no rule applies). */
export interface RuleDiagnostic {
  ruleId: string;
  title: string;
  reason: 'inactive' | 'demo' | 'plan_rule_limit' | 'plan_advanced' | 'code_taken' | RuleRejection;
}

export type FallbackReason = 'routing_unavailable' | 'quota_exceeded' | 'not_entitled';

interface Telemetry {
  providerCalls: number;
  cacheHit: boolean;
  routingErrorKind: RoutingErrorKind | null;
}

export type QuoteOutcome =
  | ({
      kind: 'rates';
      options: QuoteOption[];
      originLocationId: string;
      distanceMeters: number;
      unit: DistanceUnit;
      geocodeQuality: GeocodeQuality;
    } & Telemetry)
  | ({ kind: 'no_rate'; reason: NoRateReason; distanceMeters?: number; originLocationId?: string; ruleDiagnostics?: RuleDiagnostic[] } & Telemetry)
  | ({ kind: 'fallback'; option: QuoteOption; reason: FallbackReason } & Telemetry)
  | ({ kind: 'address_error'; error: 'missing_postal_code' | 'partial_address'; fields: string[] } & Telemetry);

const NO_TELEMETRY: Telemetry = { providerCalls: 0, cacheHit: false, routingErrorKind: null };

export function cartFacts(lines: QuoteLine[], weightUnit: WeightUnit | null): CartFacts {
  let after = 0n;
  let before: bigint | null = 0n;
  let weightKg: number | null = 0;
  for (const line of lines) {
    after += line.totalMicros;
    before = before !== null && line.totalBeforeDiscountMicros !== null ? before + line.totalBeforeDiscountMicros : null;
    if (line.shippable) {
      if (weightKg === null || line.weight === null || weightUnit === null || !Number.isFinite(line.weight) || line.weight < 0) {
        weightKg = null;
      } else {
        weightKg += toKg(line.weight, weightUnit) * line.quantity;
      }
    }
  }
  return { subtotalAfterDiscountMicros: after, subtotalBeforeDiscountMicros: before, totalWeightKg: weightKg };
}

function fallbackOption(settings: MerchantSettings, currency: string): QuoteOption | null {
  const fb = settings.fallbackRate;
  if (!fb) return null;
  const priceMinor = microsToMinor(parseMicros(fb.price), currency);
  // A fallback must never be a zero-cost option.
  if (priceMinor <= 0n) return null;
  return {
    code: 'distance-fallback',
    title: fb.title,
    ruleId: null,
    priceMinor,
    handlingMinor: 0n,
    currency,
    freeDelivery: false,
    billedUnits: null,
    breakdown: [],
  };
}

function outage(reason: FallbackReason & NoRateReason, deps: QuoteDeps, req: QuoteRequest, t: Telemetry): QuoteOutcome {
  const s = deps.config.settings;
  if (s.failureMode === 'fail_open' && s.fallbackRiskAcknowledged) {
    const option = fallbackOption(s, req.currency);
    if (option) return { kind: 'fallback', option, reason, ...t };
  }
  return { kind: 'no_rate', reason, ...t };
}

function addressFailure(deps: QuoteDeps, req: QuoteRequest, reason: NoRateReason, fields: string[], t: Telemetry): QuoteOutcome {
  if (req.source === 'checkout' && deps.config.settings.addressErrorBehavior === 'request_details') {
    return { kind: 'address_error', error: 'partial_address', fields, ...t };
  }
  return { kind: 'no_rate', reason, ...t };
}

export async function computeQuote(req: QuoteRequest, deps: QuoteDeps): Promise<QuoteOutcome> {
  const { settings, zones } = deps.config;
  const limits = deps.entitlement.limits;

  if (req.source === 'checkout' && !settings.pluginEnabled) return { kind: 'no_rate', reason: 'plugin_disabled', ...NO_TELEMETRY };
  if (!isValidCurrencyCode(req.currency)) return { kind: 'no_rate', reason: 'invalid_currency', ...NO_TELEMETRY };

  if (req.source === 'checkout' && !limits.checkout) {
    if (settings.accessEndBehavior === 'fallback_rate') {
      const option = fallbackOption(settings, req.currency);
      if (option) return { kind: 'fallback', option, reason: 'not_entitled', ...NO_TELEMETRY };
    }
    return { kind: 'no_rate', reason: 'not_entitled', ...NO_TELEMETRY };
  }

  const shippable = req.lines.filter((l) => l.shippable && l.quantity > 0);
  if (shippable.length === 0) return { kind: 'no_rate', reason: 'no_shippable_items', ...NO_TELEMETRY };
  const cart = cartFacts(req.lines, req.weightUnit);

  const dest = req.destination;
  if (settings.requirePostalCode && /^[A-Z]{2}$/.test(dest.country) && !dest.postalCode && req.source === 'checkout') {
    return { kind: 'address_error', error: 'missing_postal_code', fields: ['shippingDestination.postalCode'], ...NO_TELEMETRY };
  }
  const completeness = assessAddress(dest);
  if (completeness !== 'routable') {
    // Before the shopper enters an address (e.g. cart estimates) this is normal: offer nothing rather than guess.
    if (completeness === 'missing_country') return { kind: 'no_rate', reason: 'address_incomplete', ...NO_TELEMETRY };
    const fields = completeness === 'missing_street' ? ['shippingDestination.addressLine1'] : ['shippingDestination.city', 'shippingDestination.postalCode'];
    return addressFailure(deps, req, 'address_incomplete', fields, NO_TELEMETRY);
  }

  const zoneVerdict = evaluateZones(zones, dest);
  if (!zoneVerdict.eligible) return { kind: 'no_rate', reason: zoneVerdict.reason, ...NO_TELEMETRY };

  let candidates = candidateLocations(deps.config.locations, dest).slice(0, limits.maxLocations);
  if (req.restrictToLocationId) candidates = candidates.filter((l) => l.id === req.restrictToLocationId);
  else if (settings.originStrategy === 'primary') candidates = candidates.slice(0, 1);
  // Bound provider cost and checkout latency: at most 3 origins per lookup.
  candidates = candidates.slice(0, 3);
  if (candidates.length === 0) {
    const reason = req.restrictToLocationId && candidateLocations(deps.config.locations, dest).length > 0 ? 'location_country_mismatch' : whyNoLocation(deps.config.locations);
    return { kind: 'no_rate', reason, ...NO_TELEMETRY };
  }

  if (!deps.provider) {
    return outage('routing_unavailable', deps, req, { ...NO_TELEMETRY, routingErrorKind: 'NOT_CONFIGURED' });
  }

  const resolution = await resolveRoutes({
    provider: deps.provider,
    destination: dest,
    origins: candidates.map((l) => ({ id: l.id, lat: l.lat as number, lng: l.lng as number })),
    profile: settings.routing,
    strictness: settings.addressStrictness,
    settingsVersion: settings.settingsVersion,
    cacheTtlMs: settings.cacheTtlHours * 3_600_000,
    deadline: deps.deadline,
    cache: deps.cache,
    allowProviderCalls: deps.usedLookupsThisMonth < limits.monthlyLookups,
    policy: deps.retryPolicy,
    trace: deps.trace,
  });

  const telemetry: Telemetry = {
    providerCalls: resolution.providerCalls,
    cacheHit: resolution.cacheHit,
    routingErrorKind: resolution.ok ? null : resolution.error.kind,
  };

  if (!resolution.ok) return routingFailure(resolution.error, deps, req, telemetry);

  // Choose the nearest reachable origin that also satisfies its own service radius.
  const unit = settings.unit;
  const reachable = resolution.cells
    .map((cell, i) => ({ cell, location: candidates[i] }))
    .filter((x): x is { cell: NonNullable<typeof x.cell>; location: FulfillmentLocation } => x.cell !== null)
    .filter((x) => withinDistance(x.cell.distanceMeters, x.location.serviceRadius, unit))
    .sort((a, b) => a.cell.distanceMeters - b.cell.distanceMeters || candidates.indexOf(a.location) - candidates.indexOf(b.location));

  const best = reachable[0];
  if (!best) return { kind: 'no_rate', reason: 'beyond_max_distance', ...telemetry };

  const distanceMeters = best.cell.distanceMeters;
  const maxUnits = effectiveMaxDistanceUnits(settings.maxDeliveryDistance, zones, zoneVerdict.matchedIncludeZoneIds);
  if (!withinDistance(distanceMeters, maxUnits, unit)) {
    return { kind: 'no_rate', reason: 'beyond_max_distance', distanceMeters, originLocationId: best.location.id, ...telemetry };
  }

  const withinRuleLimit = sortRules(deps.config.rules.filter((r) => r.active && !r.isDemo)).slice(0, limits.maxRules);
  const allowedRules = withinRuleLimit.filter((r) => !ruleExceedsPlan(r, limits));
  const selection = selectRates(allowedRules, {
    distanceMeters,
    unit,
    currency: req.currency,
    cart,
    matchedZoneIds: zoneVerdict.matchedIncludeZoneIds,
    originLocationId: best.location.id,
  });

  const options: QuoteOption[] = selection.options
    .filter((o) => o.priceMinor >= 0n && o.handlingMinor >= 0n)
    .map((o) => ({
      code: o.code,
      title: o.title,
      ruleId: o.ruleId,
      priceMinor: o.priceMinor,
      handlingMinor: o.handlingMinor,
      currency: req.currency,
      freeDelivery: o.freeDelivery,
      billedUnits: o.billedUnits,
      breakdown: o.breakdown,
    }));

  if (options.length === 0) {
    const rejected = new Map(selection.rejected.map((r) => [r.ruleId, r.reason]));
    const ruleDiagnostics: RuleDiagnostic[] = sortRules(deps.config.rules).map((r) => ({
      ruleId: r.id,
      title: r.title,
      reason: r.isDemo
        ? 'demo'
        : !r.active
          ? 'inactive'
          : !withinRuleLimit.includes(r)
            ? 'plan_rule_limit'
            : ruleExceedsPlan(r, limits)
              ? 'plan_advanced'
              : (rejected.get(r.id) ?? 'code_taken'),
    }));
    return { kind: 'no_rate', reason: 'no_matching_rule', distanceMeters, originLocationId: best.location.id, ruleDiagnostics, ...telemetry };
  }

  return {
    kind: 'rates',
    options,
    originLocationId: best.location.id,
    distanceMeters,
    unit,
    geocodeQuality: resolution.quality,
    ...telemetry,
  };
}

function routingFailure(error: RoutingError, deps: QuoteDeps, req: QuoteRequest, t: Telemetry): QuoteOutcome {
  switch (error.kind) {
    case 'BAD_ADDRESS':
      return addressFailure(deps, req, 'bad_address', ['shippingDestination.addressLine1'], t);
    case 'LOW_CONFIDENCE':
      return addressFailure(deps, req, 'low_confidence', ['shippingDestination.addressLine1'], t);
    case 'NO_ROUTE':
      return { kind: 'no_rate', reason: 'no_route', ...t };
    case 'QUOTA_EXCEEDED':
      return outage('quota_exceeded', deps, req, t);
    default:
      return outage('routing_unavailable', deps, req, t);
  }
}

/** Distance expressed in the merchant's unit, for logs and UI. */
export function distanceInUnit(meters: number, unit: DistanceUnit): number {
  return Math.round(metersToUnits(meters, unit) * 10) / 10;
}
