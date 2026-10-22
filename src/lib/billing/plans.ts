/**
 * Commercial plan matrix. These are product decisions, not Wix API values:
 * edit freely. Basic is the free plan (a free install on Wix); the paid Wix plan
 * (vendor product) IDs created in the App Dashboard are mapped to Pro and
 * Business via PLAN_PACKAGE_PRO / PLAN_PACKAGE_BUSINESS. `none` means the plan
 * couldn't be confirmed or has expired, and never returns checkout rates.
 */
export type PlanId = 'none' | 'basic' | 'pro' | 'business';
/** Plans bought through Wix checkout; Basic is free and has no Wix package. */
export type PaidPlanId = 'pro' | 'business';

export interface PlanLimits {
  /** Whether the checkout service plugin may return calculated rates. */
  checkout: boolean;
  maxLocations: number;
  maxRules: number;
  /** Tiers, surcharges, free-delivery thresholds and rule conditions. */
  advancedRules: boolean;
  /** Create/edit delivery zones (existing zones always keep being enforced). */
  zones: boolean;
  /** New-address routing lookups per calendar month (cache hits are free). */
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
    monthlyLookups: 10,
    maxLogRetentionDays: 7,
  },
  basic: {
    checkout: true,
    maxLocations: 1,
    maxRules: 50,
    advancedRules: true,
    zones: true,
    monthlyLookups: 10,
    maxLogRetentionDays: 7,
  },
  pro: {
    checkout: true,
    maxLocations: 3,
    maxRules: 50,
    advancedRules: true,
    zones: true,
    monthlyLookups: 1500,
    maxLogRetentionDays: 30,
  },
  business: {
    checkout: true,
    maxLocations: 25,
    maxRules: 50,
    advancedRules: true,
    zones: true,
    monthlyLookups: 6000,
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
