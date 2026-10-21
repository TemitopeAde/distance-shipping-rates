/**
 * Zod schemas shared by dashboard forms, API routes and the backend.
 * Error messages are i18n keys (`validation.*`) resolved by the UI.
 */
import { z } from 'zod';
import { isDecimalString } from '../shipping/money';

export const decimalAmount = z
  .string()
  .trim()
  .refine(isDecimalString, { message: 'validation.decimal' });

export const optionalDecimalAmount = decimalAmount.nullable().optional();

const positiveDistance = z.number({ message: 'validation.number' }).finite().positive({ message: 'validation.positive' }).max(100000);
const nonNegDistance = z.number({ message: 'validation.number' }).finite().min(0, { message: 'validation.nonNegative' }).max(100000);

export const distanceUnitSchema = z.enum(['mi', 'km']);
export const weightUnitSchema = z.enum(['KG', 'LB']);

export const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { message: 'validation.country' });

const shortText = (max: number) =>
  z.string().trim().min(1, { message: 'validation.required' }).max(max, { message: 'validation.tooLong' });

const optionalText = (max: number) => z.string().trim().max(max, { message: 'validation.tooLong' }).optional().default('');

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const addressInputSchema = z.object({
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  subdivision: optionalText(50),
  postalCode: optionalText(20),
  country: countryCode,
});
export type AddressInput = z.infer<typeof addressInputSchema>;

// ---------------------------------------------------------------------------
// Fulfillment locations
// ---------------------------------------------------------------------------

export const geocodeQualitySchema = z.enum(['high', 'medium', 'low']);
export type GeocodeQuality = z.infer<typeof geocodeQualitySchema>;

export const locationInputSchema = z.object({
  name: shortText(80),
  address: addressInputSchema,
  isPrimary: z.boolean().default(false),
  active: z.boolean().default(true),
  /** Optional per-location service radius in the merchant's distance unit. */
  serviceRadius: positiveDistance.nullable().default(null),
  /** Countries this location may serve; empty = no restriction. */
  serviceCountries: z.array(countryCode).max(50).default([]),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export interface FulfillmentLocation extends LocationInput {
  id: string;
  lat: number | null;
  lng: number | null;
  geocodeQuality: GeocodeQuality | null;
  formattedAddress: string;
  validatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Pricing rules
// ---------------------------------------------------------------------------

export const tierSchema = z.object({
  /** Upper bound of this bracket in distance units; null = open-ended final bracket. */
  upTo: positiveDistance.nullable(),
  ratePerUnit: decimalAmount,
  flatFee: decimalAmount.default('0'),
});
export type Tier = z.infer<typeof tierSchema>;

export const surchargeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('weight_over'), thresholdKg: nonNegDistance, amount: decimalAmount }),
  z.object({ kind: z.literal('order_value_over'), threshold: decimalAmount, amount: decimalAmount }),
]);
export type Surcharge = z.infer<typeof surchargeSchema>;

export const pricingModeSchema = z.enum(['per_unit', 'graduated_tiers', 'volume_tiers']);

export const pricingRuleInputSchema = z
  .object({
    name: shortText(80),
    /** Shipping method title shown to shoppers. */
    title: shortText(100),
    /** Stable option code; rules sharing a code compete by priority. */
    code: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, { message: 'validation.code' }),
    deliveryTime: optionalText(100),
    instructions: optionalText(200),
    active: z.boolean().default(false),
    isDemo: z.boolean().default(false),
    priority: z.number().int().min(0).max(10000).default(100),
    mode: pricingModeSchema.default('per_unit'),
    baseFee: decimalAmount.default('0'),
    ratePerUnit: decimalAmount.default('0'),
    includedDistance: nonNegDistance.default(0),
    tiers: z.array(tierSchema).max(20).default([]),
    minFee: optionalDecimalAmount.default(null),
    maxFee: optionalDecimalAmount.default(null),
    maxDistance: positiveDistance.nullable().default(null),
    distanceRounding: z
      .object({
        increment: z.union([z.literal(0.01), z.literal(0.1), z.literal(0.5), z.literal(1)]),
        mode: z.enum(['up', 'nearest']),
      })
      .default({ increment: 0.1, mode: 'up' }),
    freeDelivery: z
      .object({
        enabled: z.boolean(),
        threshold: decimalAmount,
        basis: z.enum(['after_discount', 'before_discount']),
        waiveHandling: z.boolean(),
      })
      .default({ enabled: false, threshold: '0', basis: 'after_discount', waiveHandling: true }),
    handlingFee: optionalDecimalAmount.default(null),
    surcharges: z.array(surchargeSchema).max(10).default([]),
    conditions: z
      .object({
        minSubtotal: optionalDecimalAmount.default(null),
        maxSubtotal: optionalDecimalAmount.default(null),
        maxWeightKg: positiveDistance.nullable().default(null),
        zoneIds: z.array(z.string().max(64)).max(50).default([]),
        locationIds: z.array(z.string().max(64)).max(50).default([]),
      })
      .default({ minSubtotal: null, maxSubtotal: null, maxWeightKg: null, zoneIds: [], locationIds: [] }),
  })
  .superRefine((rule, ctx) => {
    if (rule.mode !== 'per_unit') {
      if (rule.tiers.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['tiers'], message: 'validation.tiersRequired' });
      }
      let prev = 0;
      rule.tiers.forEach((tier, i) => {
        const isLast = i === rule.tiers.length - 1;
        if (tier.upTo === null && !isLast) {
          ctx.addIssue({ code: 'custom', path: ['tiers', i, 'upTo'], message: 'validation.openTierLast' });
        }
        if (tier.upTo !== null) {
          if (tier.upTo <= prev) {
            ctx.addIssue({ code: 'custom', path: ['tiers', i, 'upTo'], message: 'validation.tiersAscending' });
          }
          prev = tier.upTo;
        }
      });
    }
    if (rule.minFee != null && rule.maxFee != null && Number(rule.minFee) > Number(rule.maxFee)) {
      ctx.addIssue({ code: 'custom', path: ['maxFee'], message: 'validation.minAboveMax' });
    }
    const { minSubtotal, maxSubtotal } = rule.conditions;
    if (minSubtotal != null && maxSubtotal != null && Number(minSubtotal) > Number(maxSubtotal)) {
      ctx.addIssue({ code: 'custom', path: ['conditions', 'maxSubtotal'], message: 'validation.minAboveMax' });
    }
  });
export type PricingRuleInput = z.infer<typeof pricingRuleInputSchema>;
export interface PricingRule extends PricingRuleInput {
  id: string;
}

// ---------------------------------------------------------------------------
// Delivery zones
// ---------------------------------------------------------------------------

export const postalPatternSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^([A-Z0-9 -]{1,12}\*?|\d{1,10}-\d{1,10})$/, { message: 'validation.postalPattern' });

export const zoneInputSchema = z
  .object({
    name: shortText(80),
    type: z.enum(['include', 'exclude']),
    active: z.boolean().default(true),
    countries: z.array(countryCode).max(250).default([]),
    subdivisions: z.array(z.string().trim().toUpperCase().max(10)).max(200).default([]),
    postalPatterns: z.array(postalPatternSchema).max(500).default([]),
    /** Only for include zones: max road distance for destinations in this zone. */
    maxDistance: positiveDistance.nullable().default(null),
  })
  .superRefine((zone, ctx) => {
    if (zone.countries.length === 0 && zone.subdivisions.length === 0 && zone.postalPatterns.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['countries'], message: 'validation.zoneEmpty' });
    }
  });
export type ZoneInput = z.infer<typeof zoneInputSchema>;
export interface DeliveryZone extends ZoneInput {
  id: string;
}

// ---------------------------------------------------------------------------
// Merchant settings
// ---------------------------------------------------------------------------

export const supportedLocales = [
  'en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'tr', 'ru',
  'uk', 'ar', 'he', 'ja', 'ko', 'zh-CN', 'zh-TW', 'hi', 'id', 'sv',
] as const;
export const localeSchema = z.enum(supportedLocales);
export type SupportedLocale = z.infer<typeof localeSchema>;

export const settingsInputSchema = z
  .object({
    unit: distanceUnitSchema.default('mi'),
    /** Kill switch: when false the plugin offers no rates. */
    pluginEnabled: z.boolean().default(false),
    failureMode: z.enum(['fail_closed', 'fail_open']).default('fail_closed'),
    fallbackRate: z
      .object({ title: shortText(100), price: decimalAmount })
      .nullable()
      .default(null),
    fallbackRiskAcknowledged: z.boolean().default(false),
    originStrategy: z.enum(['primary', 'nearest']).default('primary'),
    addressStrictness: z.enum(['strict', 'standard']).default('standard'),
    addressErrorBehavior: z.enum(['no_rate', 'request_details']).default('no_rate'),
    requirePostalCode: z.boolean().default(false),
    maxDeliveryDistance: positiveDistance.nullable().default(null),
    routing: z
      .object({ avoidTolls: z.boolean(), avoidHighways: z.boolean() })
      .default({ avoidTolls: false, avoidHighways: false }),
    cacheTtlHours: z.number().int().min(0).max(720).default(24),
    logRetentionDays: z.number().int().min(1).max(90).default(30),
    language: localeSchema.default('en'),
    notifications: z
      .object({ failureAlerts: z.boolean(), weeklySummary: z.boolean() })
      .default({ failureAlerts: true, weeklySummary: false }),
    accessEndBehavior: z.enum(['no_rates', 'fallback_rate']).default('no_rates'),
  })
  .superRefine((s, ctx) => {
    if (s.failureMode === 'fail_open') {
      if (!s.fallbackRate) {
        ctx.addIssue({ code: 'custom', path: ['fallbackRate'], message: 'validation.fallbackRequired' });
      } else if (Number(s.fallbackRate.price) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['fallbackRate', 'price'], message: 'validation.fallbackPositive' });
      }
      if (!s.fallbackRiskAcknowledged) {
        ctx.addIssue({ code: 'custom', path: ['fallbackRiskAcknowledged'], message: 'validation.ackRequired' });
      }
    }
    if (s.accessEndBehavior === 'fallback_rate' && !s.fallbackRate) {
      ctx.addIssue({ code: 'custom', path: ['accessEndBehavior'], message: 'validation.fallbackRequired' });
    }
  });
export type SettingsInput = z.infer<typeof settingsInputSchema>;

export interface MerchantSettings extends SettingsInput {
  /** Monotonic counter bumped on any change that affects routing or pricing; part of cache keys. */
  settingsVersion: number;
  onboarding: OnboardingState;
}

export interface OnboardingState {
  demoRuleSeeded: boolean;
  /** Merchant saved units / fallback settings at least once. */
  settingsReviewed: boolean;
  /** Merchant confirmed enabling the app as a carrier in Wix shipping settings (not detectable via API). */
  carrierEnabledConfirmed: boolean;
  /** Merchant confirmed a successful test checkout. */
  checkoutTested: boolean;
  wentLiveAt: string | null;
}

export const onboardingActionSchema = z.object({
  action: z.enum(['seed', 'confirm_carrier', 'confirm_checkout_test', 'go_live', 'pause']),
});

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

export const simulateInputSchema = z.object({
  destination: addressInputSchema,
  subtotal: decimalAmount.default('0'),
  subtotalBeforeDiscount: decimalAmount.nullable().default(null),
  weight: nonNegDistance.nullable().default(null),
  weightUnit: weightUnitSchema.default('KG'),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { message: 'validation.currency' }),
  /** Restrict simulation to one location (otherwise the merchant's origin strategy applies). */
  locationId: z.string().max(64).nullable().default(null),
}).superRefine((s, ctx) => {
  if (s.subtotalBeforeDiscount !== null && Number(s.subtotalBeforeDiscount) < Number(s.subtotal)) {
    ctx.addIssue({ code: 'custom', path: ['subtotalBeforeDiscount'], message: 'validation.beforeDiscountLower' });
  }
});
export type SimulateInput = z.infer<typeof simulateInputSchema>;

export const reorderInputSchema = z.object({ ids: z.array(z.string().max(64)).min(1).max(200) });

export const logsQuerySchema = z.object({
  status: z.enum(['all', 'priced', 'no_rate', 'fallback', 'error']).default('all'),
  source: z.enum(['all', 'checkout', 'simulator']).default('all'),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});
export type LogsQuery = z.infer<typeof logsQuerySchema>;

export const checkoutUrlInputSchema = z.object({
  plan: z.enum(['basic', 'pro']),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});
