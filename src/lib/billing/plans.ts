/**
 * Commercial plan matrix. These are product decisions, not Wix API values:
 * edit freely. The Wix plan (vendor product) IDs created in the App Dashboard
 * are mapped to these plans via PLAN_PACKAGE_BASIC / PLAN_PACKAGE_PRO.
 */
export type PlanId = 'none' | 'basic' | 'pro';

export interface PlanLimits {
  /** Whether the checkout service plugin may return calculated rates. */
  checkout: boolean;
  maxLocations: number;
  maxRules: number;
  /** Tiers, surcharges, free-delivery thresholds and rule conditions. */
  advancedRules: boolean;
  /** Create/edit delivery zones (existing zones always keep being enforced). */
  zones: boolean;
  /** Paid routing-provider lookups per calendar month (cache hits are free). */
  monthlyLookups: number;
  maxLogRetentionDays: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  none: {
    checkout: false,
    maxLocations: 1,
    maxRules: 1,
    advancedRules: false,
    zones: false,
    monthlyLookups: 25,
    maxLogRetentionDays: 7,
  },
  basic: {
    checkout: true,
    maxLocations: 1,
    maxRules: 3,
    advancedRules: false,
    zones: false,
    monthlyLookups: 1000,
    maxLogRetentionDays: 14,
  },
  pro: {
    checkout: true,
    maxLocations: 25,
    maxRules: 50,
    advancedRules: true,
    zones: true,
    monthlyLookups: 20000,
    maxLogRetentionDays: 90,
  },
};

/**
 * Wix staff sites (verified @wix.com owner): every feature, at the ceilings the
 * app itself supports — lists are read up to 200 rows and logs are kept ≤ 90 days.
 * Lookups keep a very high cap only as a guard against runaway provider bills.
 */
export const STAFF_LIMITS: PlanLimits = {
  checkout: true,
  maxLocations: 200,
  maxRules: 200,
  advancedRules: true,
  zones: true,
  monthlyLookups: 1_000_000,
  maxLogRetentionDays: 90,
};
