import { describe, expect, it } from 'vitest';
import { makeRule, makeZone, MILE } from '../../../tests/fixtures';
import { parseMicros } from './money';
import { detectRuleConflicts, priceRule, selectRates, type CartFacts, type RuleContext } from './engine';
import { metersToBilledMilli } from './units';

const cart = (subtotal = '50', before: string | null = null, weightKg: number | null = 2): CartFacts => ({
  subtotalAfterDiscountMicros: parseMicros(subtotal),
  subtotalBeforeDiscountMicros: before === null ? null : parseMicros(before),
  totalWeightKg: weightKg,
});

const ctx = (miles: number, overrides: Partial<RuleContext> = {}): RuleContext => ({
  distanceMeters: miles * MILE,
  unit: 'mi',
  currency: 'USD',
  cart: cart(),
  matchedZoneIds: [],
  originLocationId: 'loc-1',
  ...overrides,
});

function price(rule = makeRule(), c = ctx(10)) {
  const r = priceRule(rule, c);
  if (!r.ok) throw new Error(`rejected: ${r.reason}`);
  return r;
}

describe('per-unit pricing', () => {
  it('base $5 + 10 miles × $2/mile = $25', () => {
    const r = price();
    expect(r.priceMinor).toBe(2500n);
    expect(r.billedUnits).toBe(10);
    expect(r.handlingMinor).toBe(0n);
  });

  it('bills kilometres when the merchant uses km', () => {
    const r = price(makeRule({ baseFee: '3', ratePerUnit: '1.5' }), ctx(0, { distanceMeters: 8000, unit: 'km' }));
    expect(r.priceMinor).toBe(1500n); // 3 + 8 × 1.5
  });

  it('applies the included-distance allowance', () => {
    const r = price(makeRule({ includedDistance: 3 }));
    expect(r.priceMinor).toBe(1900n); // 5 + 7 × 2
  });

  it('never charges negative distance when inside the allowance', () => {
    const r = price(makeRule({ includedDistance: 50 }));
    expect(r.priceMinor).toBe(500n);
  });

  it('zero distance charges only the base fee', () => {
    expect(price(makeRule(), ctx(0)).priceMinor).toBe(500n);
  });

  it('rounds distance up to the billing increment', () => {
    // 10.01 mi rounds up to 10.1 mi → 5 + 20.2 = 25.20
    expect(price(makeRule(), ctx(10.01)).priceMinor).toBe(2520n);
    // whole-unit increment, nearest
    const nearest = makeRule({ distanceRounding: { increment: 1, mode: 'nearest' } });
    expect(price(nearest, ctx(10.4)).priceMinor).toBe(2500n);
    expect(price(nearest, ctx(10.5)).priceMinor).toBe(2700n);
  });

  it('keeps sub-cent rates exact until the final rounding', () => {
    const r = price(makeRule({ baseFee: '0', ratePerUnit: '0.333' }), ctx(3));
    expect(r.priceMinor).toBe(100n); // 0.999 → 1.00
  });

  it('respects zero-decimal currencies', () => {
    const r = price(makeRule({ baseFee: '500', ratePerUnit: '120.5' }), ctx(0, { distanceMeters: 3000, unit: 'km', currency: 'JPY' }));
    expect(r.priceMinor).toBe(862n); // 500 + 361.5 → 862 (half up)
  });
});

describe('min / max fees', () => {
  it('raises to the minimum fee', () => {
    const r = price(makeRule({ baseFee: '0', ratePerUnit: '1', minFee: '8' }), ctx(2));
    expect(r.priceMinor).toBe(800n);
    expect(r.breakdown.some((l) => l.kind === 'min_fee_applied')).toBe(true);
  });

  it('caps at the maximum fee', () => {
    expect(price(makeRule({ maxFee: '20' }), ctx(30)).priceMinor).toBe(2000n);
  });
});

describe('tiers', () => {
  const tiers = [
    { upTo: 5, ratePerUnit: '1', flatFee: '0' },
    { upTo: 15, ratePerUnit: '2', flatFee: '0' },
    { upTo: null, ratePerUnit: '3', flatFee: '0' },
  ];

  it('graduated tiers bill each segment at its own rate', () => {
    const rule = makeRule({ baseFee: '0', mode: 'graduated_tiers', tiers });
    // 5×1 + 10×2 + 5×3 = 40
    expect(price(rule, ctx(20)).priceMinor).toBe(4000n);
    // inside first bracket
    expect(price(rule, ctx(3)).priceMinor).toBe(300n);
  });

  it('graduated tiers bill overflow past the last closed bracket at its rate', () => {
    const rule = makeRule({ baseFee: '0', mode: 'graduated_tiers', tiers: tiers.slice(0, 2) });
    // 5×1 + 10×2 + 5×2 = 35
    expect(price(rule, ctx(20)).priceMinor).toBe(3500n);
  });

  it('volume tiers bill the whole distance at the bracket rate plus flat fee', () => {
    const rule = makeRule({
      baseFee: '0',
      mode: 'volume_tiers',
      tiers: [
        { upTo: 5, ratePerUnit: '1', flatFee: '2' },
        { upTo: null, ratePerUnit: '1.5', flatFee: '4' },
      ],
    });
    expect(price(rule, ctx(4)).priceMinor).toBe(600n); // 4×1 + 2
    expect(price(rule, ctx(10)).priceMinor).toBe(1900n); // 10×1.5 + 4
  });

  it('rejects descending tiers at validation time', () => {
    expect(() =>
      makeRule({ mode: 'graduated_tiers', tiers: [{ upTo: 10, ratePerUnit: '1', flatFee: '0' }, { upTo: 5, ratePerUnit: '1', flatFee: '0' }] }),
    ).toThrow();
  });
});

describe('free delivery', () => {
  const rule = makeRule({
    handlingFee: '1.50',
    freeDelivery: { enabled: true, threshold: '100', basis: 'after_discount', waiveHandling: true },
  });

  it('applies at or above the threshold after discounts', () => {
    const r = price(rule, ctx(10, { cart: cart('100') }));
    expect(r.priceMinor).toBe(0n);
    expect(r.handlingMinor).toBe(0n);
    expect(r.freeDelivery).toBe(true);
  });

  it('does not apply below the threshold', () => {
    const r = price(rule, ctx(10, { cart: cart('99.99') }));
    expect(r.priceMinor).toBe(2500n);
    expect(r.handlingMinor).toBe(150n);
  });

  it('uses the before-discount basis when configured', () => {
    const before = makeRule({ freeDelivery: { enabled: true, threshold: '100', basis: 'before_discount', waiveHandling: false }, handlingFee: '2' });
    const r = price(before, ctx(10, { cart: cart('80', '120') }));
    expect(r.priceMinor).toBe(0n);
    expect(r.handlingMinor).toBe(200n);
  });
});

describe('surcharges', () => {
  it('adds weight and order-value surcharges', () => {
    const rule = makeRule({
      surcharges: [
        { kind: 'weight_over', thresholdKg: 1, amount: '3' },
        { kind: 'order_value_over', threshold: '40', amount: '2' },
      ],
    });
    expect(price(rule).priceMinor).toBe(3000n);
  });

  it('skips weight surcharges when weight data is missing rather than guessing', () => {
    const rule = makeRule({ surcharges: [{ kind: 'weight_over', thresholdKg: 1, amount: '3' }] });
    const r = price(rule, ctx(10, { cart: cart('50', null, null) }));
    expect(r.priceMinor).toBe(2500n);
    expect(r.breakdown.some((l) => l.kind === 'surcharge_skipped_missing_weight')).toBe(true);
  });
});

describe('conditions and selection', () => {
  it('rejects rules beyond their max distance', () => {
    const r = priceRule(makeRule({ maxDistance: 5 }), ctx(10));
    expect(r).toEqual({ ok: false, ruleId: 'rule-1', reason: 'exceeds_rule_max_distance' });
  });

  it('rejects weight-limited rules when weight is unknown', () => {
    const r = priceRule(makeRule({ conditions: { minSubtotal: null, maxSubtotal: null, maxWeightKg: 5, zoneIds: [], locationIds: [] } }), ctx(1, { cart: cart('10', null, null) }));
    expect(r.ok).toBe(false);
  });

  it('rules with the same code compete by priority; first eligible wins', () => {
    const near = makeRule({ id: 'a', priority: 1, maxDistance: 5, baseFee: '1' });
    const far = makeRule({ id: 'b', priority: 2, baseFee: '9' });
    expect(selectRates([far, near], ctx(3)).options.map((o) => o.ruleId)).toEqual(['a']);
    expect(selectRates([far, near], ctx(8)).options.map((o) => o.ruleId)).toEqual(['b']);
  });

  it('returns one option per code in priority order and skips inactive/demo rules', () => {
    const express = makeRule({ id: 'x', code: 'express', priority: 5, title: 'Express' });
    const standard = makeRule({ id: 's', code: 'standard', priority: 10 });
    const inactive = makeRule({ id: 'i', code: 'other', active: false });
    const demo = makeRule({ id: 'd', code: 'demo', isDemo: true });
    const res = selectRates([standard, inactive, express, demo], ctx(1));
    expect(res.options.map((o) => o.code)).toEqual(['express', 'standard']);
  });

  it('is deterministic regardless of input order', () => {
    const rules = [makeRule({ id: 'b', priority: 1 }), makeRule({ id: 'a', priority: 1 })];
    expect(selectRates(rules, ctx(1)).options[0].ruleId).toBe('a');
    expect(selectRates([...rules].reverse(), ctx(1)).options[0].ruleId).toBe('a');
  });

  it('detects conflicts and shadowed rules', () => {
    const warnings = detectRuleConflicts(
      [makeRule({ id: 'a', priority: 1 }), makeRule({ id: 'b', priority: 1 }), makeRule({ id: 'c', priority: 2 })],
      [],
    );
    expect(warnings.map((w) => w.kind)).toEqual(['same_code_same_priority', 'shadowed_rule']);
    expect(detectRuleConflicts([], []).map((w) => w.kind)).toEqual(['no_active_rules']);
  });

  it('warns when a rule is limited to zones that can never match', () => {
    const zoned = (zoneIds: string[]) => makeRule({ id: 'z', code: 'zoned', conditions: { ...makeRule().conditions, zoneIds } });
    const zones = [makeZone({ id: 'live' }), makeZone({ id: 'off', active: false }), makeZone({ id: 'ex', type: 'exclude' })];
    expect(detectRuleConflicts([zoned(['live', 'off'])], zones)).toEqual([]);
    expect(detectRuleConflicts([zoned(['off', 'ex', 'deleted'])], zones)).toEqual([{ kind: 'zone_condition_unusable', ruleId: 'z', code: 'zoned' }]);
  });
});

describe('distance rounding helper', () => {
  it('absorbs floating point noise', () => {
    expect(metersToBilledMilli(10 * MILE, 'mi', { increment: 0.1, mode: 'up' })).toBe(10_000n);
  });

  it('rejects invalid distances', () => {
    expect(() => metersToBilledMilli(-1, 'mi', { increment: 0.1, mode: 'up' })).toThrow();
    expect(() => metersToBilledMilli(Number.NaN, 'mi', { increment: 0.1, mode: 'up' })).toThrow();
  });
});
