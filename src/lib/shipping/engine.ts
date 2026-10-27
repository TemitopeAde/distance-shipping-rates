/**
 * Pure, deterministic shipping price engine. No I/O, no SDK imports.
 *
 * Order of operations for one rule:
 *   1. billed distance = road distance rounded to the rule's increment
 *   2. chargeable distance = billed distance − included distance (≥ 0)
 *   3. subtotal = base fee + distance charge (per-unit or tiers) + surcharges
 *   4. clamp subtotal to [minFee, maxFee]
 *   5. free delivery: if the merchandise subtotal (chosen basis) ≥ threshold → shipping = 0
 *   6. handling fee is reported separately (Wix `additionalCharges`), waived with free delivery if configured
 *   7. round once to the currency's minor unit (half-up)
 */
import type { DeliveryZone, FulfillmentLocation, PricingRule, Surcharge, Tier } from '../validation/schemas';
import {
  maxBig,
  microsToMinor,
  minBig,
  multiplyMicrosByMilli,
  parseMicros,
} from './money';
import { metersToBilledMilli, milliToUnits, unitsToMilli, type DistanceUnit } from './units';

export interface CartFacts {
  /** Merchandise subtotal after discounts, micro-units. */
  subtotalAfterDiscountMicros: bigint;
  /** Merchandise subtotal before discounts, micro-units; null when Wix did not send it. */
  subtotalBeforeDiscountMicros: bigint | null;
  /** Total shipment weight in kg; null when any shippable item lacked weight. */
  totalWeightKg: number | null;
}

export type BreakdownLine =
  | { kind: 'base'; micros: bigint }
  | { kind: 'distance'; micros: bigint; chargeableUnits: number; ratePerUnit: string }
  | { kind: 'tier'; micros: bigint; fromUnits: number; toUnits: number; ratePerUnit: string; flatFee: string }
  | { kind: 'included_distance'; units: number }
  | { kind: 'surcharge'; micros: bigint; surcharge: Surcharge['kind'] }
  | { kind: 'surcharge_skipped_missing_weight' }
  | { kind: 'min_fee_applied'; micros: bigint }
  | { kind: 'max_fee_applied'; micros: bigint }
  | { kind: 'free_delivery'; waivedMicros: bigint; basis: 'after_discount' | 'before_discount' }
  | { kind: 'handling'; micros: bigint };

export interface PricedRule {
  ok: true;
  ruleId: string;
  code: string;
  title: string;
  billedUnits: number;
  unit: DistanceUnit;
  /** Shipping price in minor units (excludes handling). */
  priceMinor: bigint;
  /** Handling fee in minor units (0 when none). */
  handlingMinor: bigint;
  freeDelivery: boolean;
  breakdown: BreakdownLine[];
}

export type RuleRejection =
  | 'exceeds_rule_max_distance'
  | 'below_min_subtotal'
  | 'above_max_subtotal'
  | 'above_max_weight'
  | 'weight_unknown_for_limit'
  | 'zone_condition_not_met'
  | 'location_condition_not_met';

export interface RejectedRule {
  ok: false;
  ruleId: string;
  reason: RuleRejection;
}

export interface RuleContext {
  distanceMeters: number;
  unit: DistanceUnit;
  currency: string;
  cart: CartFacts;
  matchedZoneIds: string[];
  originLocationId: string;
}

function distanceChargeMicros(rule: PricingRule, chargeableMilli: bigint, breakdown: BreakdownLine[]): bigint {
  if (rule.mode === 'per_unit') {
    const micros = multiplyMicrosByMilli(parseMicros(rule.ratePerUnit), chargeableMilli);
    breakdown.push({ kind: 'distance', micros, chargeableUnits: milliToUnits(chargeableMilli), ratePerUnit: rule.ratePerUnit });
    return micros;
  }

  const tiers: Tier[] = rule.tiers;
  if (rule.mode === 'volume_tiers') {
    // Whole chargeable distance is billed at the rate of the bracket it falls into.
    const bracket =
      tiers.find((t) => t.upTo === null || chargeableMilli <= unitsToMilli(t.upTo)) ?? tiers[tiers.length - 1];
    const micros = multiplyMicrosByMilli(parseMicros(bracket.ratePerUnit), chargeableMilli) + parseMicros(bracket.flatFee);
    breakdown.push({
      kind: 'tier',
      micros,
      fromUnits: 0,
      toUnits: milliToUnits(chargeableMilli),
      ratePerUnit: bracket.ratePerUnit,
      flatFee: bracket.flatFee,
    });
    return micros;
  }

  // Graduated: each segment of distance is billed at its own bracket rate.
  let total = 0n;
  let lowerMilli = 0n;
  for (const tier of tiers) {
    if (chargeableMilli <= lowerMilli) break;
    const upperMilli = tier.upTo === null ? chargeableMilli : minBig(unitsToMilli(tier.upTo), chargeableMilli);
    const segment = upperMilli - lowerMilli;
    const micros = multiplyMicrosByMilli(parseMicros(tier.ratePerUnit), segment) + parseMicros(tier.flatFee);
    breakdown.push({
      kind: 'tier',
      micros,
      fromUnits: milliToUnits(lowerMilli),
      toUnits: milliToUnits(lowerMilli + segment),
      ratePerUnit: tier.ratePerUnit,
      flatFee: tier.flatFee,
    });
    total += micros;
    if (tier.upTo === null) break;
    lowerMilli = unitsToMilli(tier.upTo);
  }
  // Distance beyond the last closed bracket is billed at the last bracket's rate.
  const last = tiers[tiers.length - 1];
  if (last && last.upTo !== null && chargeableMilli > unitsToMilli(last.upTo)) {
    const extra = chargeableMilli - unitsToMilli(last.upTo);
    const micros = multiplyMicrosByMilli(parseMicros(last.ratePerUnit), extra);
    breakdown.push({
      kind: 'tier',
      micros,
      fromUnits: last.upTo,
      toUnits: milliToUnits(chargeableMilli),
      ratePerUnit: last.ratePerUnit,
      flatFee: '0',
    });
    total += micros;
  }
  return total;
}

/** Checks a rule's applicability conditions that don't depend on price. */
export function checkRuleConditions(rule: PricingRule, ctx: RuleContext): RuleRejection | null {
  const c = rule.conditions;
  if (c.zoneIds.length > 0 && !c.zoneIds.some((id) => ctx.matchedZoneIds.includes(id))) return 'zone_condition_not_met';
  if (c.locationIds.length > 0 && !c.locationIds.includes(ctx.originLocationId)) return 'location_condition_not_met';
  if (c.minSubtotal != null && ctx.cart.subtotalAfterDiscountMicros < parseMicros(c.minSubtotal)) return 'below_min_subtotal';
  if (c.maxSubtotal != null && ctx.cart.subtotalAfterDiscountMicros > parseMicros(c.maxSubtotal)) return 'above_max_subtotal';
  if (c.maxWeightKg != null) {
    if (ctx.cart.totalWeightKg === null) return 'weight_unknown_for_limit';
    if (ctx.cart.totalWeightKg > c.maxWeightKg) return 'above_max_weight';
  }
  if (rule.maxDistance != null) {
    const billed = metersToBilledMilli(ctx.distanceMeters, ctx.unit, rule.distanceRounding);
    if (billed > unitsToMilli(rule.maxDistance)) return 'exceeds_rule_max_distance';
  }
  return null;
}

export function priceRule(rule: PricingRule, ctx: RuleContext): PricedRule | RejectedRule {
  const rejection = checkRuleConditions(rule, ctx);
  if (rejection) return { ok: false, ruleId: rule.id, reason: rejection };

  const breakdown: BreakdownLine[] = [];
  const billedMilli = metersToBilledMilli(ctx.distanceMeters, ctx.unit, rule.distanceRounding);
  const includedMilli = unitsToMilli(rule.includedDistance);
  const chargeableMilli = maxBig(billedMilli - includedMilli, 0n);

  const base = parseMicros(rule.baseFee);
  breakdown.push({ kind: 'base', micros: base });
  if (includedMilli > 0n) breakdown.push({ kind: 'included_distance', units: rule.includedDistance });

  let shipping = base + distanceChargeMicros(rule, chargeableMilli, breakdown);

  for (const s of rule.surcharges) {
    if (s.kind === 'weight_over') {
      if (ctx.cart.totalWeightKg === null) {
        breakdown.push({ kind: 'surcharge_skipped_missing_weight' });
        continue;
      }
      if (ctx.cart.totalWeightKg > s.thresholdKg) {
        const micros = parseMicros(s.amount);
        shipping += micros;
        breakdown.push({ kind: 'surcharge', micros, surcharge: s.kind });
      }
    } else if (ctx.cart.subtotalAfterDiscountMicros > parseMicros(s.threshold)) {
      const micros = parseMicros(s.amount);
      shipping += micros;
      breakdown.push({ kind: 'surcharge', micros, surcharge: s.kind });
    }
  }

  if (rule.minFee != null) {
    const min = parseMicros(rule.minFee);
    if (shipping < min) {
      breakdown.push({ kind: 'min_fee_applied', micros: min });
      shipping = min;
    }
  }
  if (rule.maxFee != null) {
    const max = parseMicros(rule.maxFee);
    if (shipping > max) {
      breakdown.push({ kind: 'max_fee_applied', micros: max });
      shipping = max;
    }
  }

  let handling = rule.handlingFee != null ? parseMicros(rule.handlingFee) : 0n;
  let free = false;
  const fd = rule.freeDelivery;
  if (fd.enabled) {
    const basisAmount =
      fd.basis === 'before_discount'
        ? (ctx.cart.subtotalBeforeDiscountMicros ?? ctx.cart.subtotalAfterDiscountMicros)
        : ctx.cart.subtotalAfterDiscountMicros;
    if (basisAmount >= parseMicros(fd.threshold)) {
      free = true;
      breakdown.push({ kind: 'free_delivery', waivedMicros: shipping, basis: fd.basis });
      shipping = 0n;
      if (fd.waiveHandling) handling = 0n;
    }
  }
  if (handling > 0n) breakdown.push({ kind: 'handling', micros: handling });

  return {
    ok: true,
    ruleId: rule.id,
    code: rule.code,
    title: rule.title,
    billedUnits: milliToUnits(billedMilli),
    unit: ctx.unit,
    priceMinor: microsToMinor(shipping, ctx.currency),
    handlingMinor: microsToMinor(handling, ctx.currency),
    freeDelivery: free,
    breakdown,
  };
}

/** Deterministic rule ordering: priority ascending, then id. */
export function sortRules(rules: PricingRule[]): PricingRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export interface SelectionResult {
  options: PricedRule[];
  rejected: RejectedRule[];
}

/**
 * Evaluates all active rules. Rules sharing a `code` compete: the first eligible
 * rule in priority order wins that code. Output order follows rule priority.
 */
export function selectRates(rules: PricingRule[], ctx: RuleContext): SelectionResult {
  const options: PricedRule[] = [];
  const rejected: RejectedRule[] = [];
  const takenCodes = new Set<string>();
  for (const rule of sortRules(rules.filter((r) => r.active && !r.isDemo))) {
    if (takenCodes.has(rule.code)) continue;
    const result = priceRule(rule, ctx);
    if (result.ok) {
      takenCodes.add(rule.code);
      options.push(result);
    } else {
      rejected.push(result);
    }
  }
  return { options, rejected };
}

export type RuleWarning =
  | { kind: 'same_code_same_priority'; ruleIds: [string, string]; code: string }
  | { kind: 'shadowed_rule'; ruleId: string; shadowedBy: string; code: string }
  | { kind: 'no_active_rules' }
  | { kind: 'zone_condition_unusable'; ruleId: string; code: string }
  | { kind: 'location_condition_unusable'; ruleId: string; code: string };

/** Static analysis surfaced in the dashboard so merchants can fix ambiguous setups. */
export function detectRuleConflicts(rules: PricingRule[], zones: DeliveryZone[], locations: FulfillmentLocation[]): RuleWarning[] {
  const active = sortRules(rules.filter((r) => r.active && !r.isDemo));
  const warnings: RuleWarning[] = [];
  if (active.length === 0) warnings.push({ kind: 'no_active_rules' });
  // Only active include zones ever match, so a rule limited to other zones (deleted, inactive, exclusions) never applies.
  const usableZoneIds = new Set(zones.filter((z) => z.active && z.type === 'include').map((z) => z.id));
  for (const r of active) {
    if (r.conditions.zoneIds.length > 0 && !r.conditions.zoneIds.some((id) => usableZoneIds.has(id))) {
      warnings.push({ kind: 'zone_condition_unusable', ruleId: r.id, code: r.code });
    }
  }
  const usableLocationIds = new Set(locations.filter((l) => l.active).map((l) => l.id));
  for (const r of active) {
    if (r.conditions.locationIds.length > 0 && !r.conditions.locationIds.some((id) => usableLocationIds.has(id))) {
      warnings.push({ kind: 'location_condition_unusable', ruleId: r.id, code: r.code });
    }
  }
  const byCode = new Map<string, PricingRule[]>();
  for (const r of active) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  for (const [code, group] of byCode) {
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const cur = group[i];
      if (prev.priority === cur.priority) {
        warnings.push({ kind: 'same_code_same_priority', ruleIds: [prev.id, cur.id], code });
      } else if (isUnconditional(prev)) {
        warnings.push({ kind: 'shadowed_rule', ruleId: cur.id, shadowedBy: prev.id, code });
      }
    }
  }
  return warnings;
}

function isUnconditional(rule: PricingRule): boolean {
  const c = rule.conditions;
  return (
    c.zoneIds.length === 0 &&
    c.locationIds.length === 0 &&
    c.minSubtotal == null &&
    c.maxSubtotal == null &&
    c.maxWeightKg == null &&
    rule.maxDistance == null
  );
}
