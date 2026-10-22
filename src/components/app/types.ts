/** Shapes returned by the dashboard API (JSON; bigint amounts arrive as strings). */
import type { Entitlement } from '../../lib/billing/entitlements';
import type { PlanLimits } from '../../lib/billing/plans';
import type { RuleWarning } from '../../lib/shipping/engine';
import type { DeliveryZone, FulfillmentLocation, MerchantSettings, PricingRule } from '../../lib/validation/schemas';

export type { DeliveryZone, Entitlement, FulfillmentLocation, MerchantSettings, PlanLimits, PricingRule, RuleWarning };

export interface LogRow {
  id: string;
  source: 'checkout' | 'simulator';
  status: 'priced' | 'no_rate' | 'fallback' | 'error';
  reason: string;
  providerError: string;
  cacheHit: boolean;
  providerCalls: number;
  latencyMs: number;
  distance: number | null;
  unit: string;
  originLocationId: string;
  optionCodes: string;
  price: string;
  currency: string;
  destCountry: string;
  destPostalPrefix: string;
  requestRef: string;
  createdAt: string;
}

export interface Overview {
  checklist: Array<{ id: string; done: boolean; evidence?: string | null }>;
  completion: number;
  health: 'healthy' | 'degraded' | 'down' | 'not_configured' | 'idle';
  pluginEnabled: boolean;
  unit: 'mi' | 'km';
  failureMode: 'fail_closed' | 'fail_open';
  lastCheckoutAt: string | null;
  recent: LogRow[];
  usage: { used: number; limit: number };
  entitlement: Entitlement;
  routing: { provider: string; configured: boolean };
  rollout: { mode: string; allowed: boolean };
  ruleWarnings: RuleWarning[];
  counts: { locations: number; rules: number };
}

export interface RulesResponse {
  rules: Array<PricingRule & { exceedsPlan: boolean }>;
  warnings: RuleWarning[];
  limits: PlanLimits;
}

export interface BillingResponse {
  entitlement: Entitlement;
  snapshot: {
    isFree: boolean;
    packageName: string | null;
    billingCycle: string | null;
    autoRenewing: boolean | null;
    expirationDate: string | null;
    freeTrialStatus: string | null;
    freeTrialAvailable: boolean;
    fetchedAt: string;
  } | null;
  usage: { used: number; limit: number };
  plans: { basic: PlanLimits; pro: PlanLimits; business: PlanLimits };
}

export interface SerializedOption {
  code: string;
  title: string;
  ruleId: string | null;
  priceMinor: string;
  handlingMinor: string;
  currency: string;
  deliveryTime: string;
  freeDelivery: boolean;
  billedUnits: number | null;
  breakdown: Array<Record<string, unknown> & { kind: string }>;
}

export type SerializedOutcome =
  | { kind: 'rates'; options: SerializedOption[]; originLocationId: string; distanceMeters: number; unit: 'mi' | 'km'; geocodeQuality: string; providerCalls: number; cacheHit: boolean; routingErrorKind: string | null }
  | { kind: 'no_rate'; reason: string; distanceMeters?: number; originLocationId?: string; ruleDiagnostics?: Array<{ ruleId: string; name: string; reason: string }>; providerCalls: number; cacheHit: boolean; routingErrorKind: string | null }
  | { kind: 'fallback'; option: SerializedOption; reason: string; providerCalls: number; cacheHit: boolean; routingErrorKind: string | null }
  | { kind: 'address_error'; error: string; fields: string[]; providerCalls: number; cacheHit: boolean; routingErrorKind: string | null };
