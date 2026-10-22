/**
 * Entitlement resolution. The source of truth is Wix's App Instance billing
 * data (`appInstances.getAppInstance()`); lifecycle events only trigger a
 * refresh of that snapshot, so duplicate or out-of-order events cannot leave
 * the stored state wrong.
 */
import type { PricingRule } from '../validation/schemas';
import { PLAN_LIMITS, STAFF_LIMITS, type PlanId, type PlanLimits } from './plans';

export interface BillingSnapshot {
  isFree: boolean;
  packageName: string | null;
  billingCycle: string | null;
  autoRenewing: boolean | null;
  /** Only provided by Wix for yearly / multi-year cycles. */
  expirationDate: string | null;
  freeTrialStatus: 'IN_PROGRESS' | 'ENDED' | 'NOT_AVAILABLE' | null;
  freeTrialAvailable: boolean;
  /** Site owner has a verified @wix.com login email (internal testing). Only the flag is stored, never the email. */
  ownerIsWixStaff?: boolean;
  fetchedAt: string;
}

export type EntitlementStatus = 'active' | 'trial' | 'cancelling' | 'expired' | 'free' | 'override' | 'unknown';

export interface Entitlement {
  plan: PlanId;
  status: EntitlementStatus;
  limits: PlanLimits;
  /** When access ends for a cancelled plan, if Wix reports it. */
  accessUntil: string | null;
  packageName: string | null;
}

export interface EntitlementConfig {
  proPackages: string[];
  businessPackages: string[];
  overrideInstanceIds: string[];
  now: Date;
}

/** Snapshots older than this are treated as unknown rather than trusted. */
export const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function parseList(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * True only for a verified @wix.com owner email. `site.ownerInfo` is returned only with the
 * Read Site Owner Email scope; without it this is false and normal plan rules apply.
 */
export function isWixStaffOwner(owner: { email?: string | null; emailStatus?: string | null } | null | undefined): boolean {
  const email = owner?.email?.trim().toLowerCase() ?? '';
  return email.endsWith('@wix.com') && (owner?.emailStatus ?? '').startsWith('VERIFIED');
}

export function planForPackage(packageName: string | null, cfg: Pick<EntitlementConfig, 'proPackages' | 'businessPackages'>): PlanId {
  if (!packageName) return 'none';
  const name = packageName.toLowerCase();
  if (cfg.businessPackages.some((p) => p.toLowerCase() === name)) return 'business';
  if (cfg.proPackages.some((p) => p.toLowerCase() === name)) return 'pro';
  return 'none';
}

const make = (plan: PlanId, status: EntitlementStatus, accessUntil: string | null = null, packageName: string | null = null): Entitlement => ({
  plan,
  status,
  limits: PLAN_LIMITS[plan],
  accessUntil,
  packageName,
});

export function resolveEntitlement(instanceId: string, snapshot: BillingSnapshot | null, cfg: EntitlementConfig): Entitlement {
  // Developer/testing override: an explicit server-side allowlist of instance IDs (secret env var).
  if (instanceId && cfg.overrideInstanceIds.includes(instanceId)) return make('business', 'override');
  if (!snapshot) return make('none', 'unknown');
  if (cfg.now.getTime() - Date.parse(snapshot.fetchedAt) > MAX_SNAPSHOT_AGE_MS) return make('none', 'unknown');
  // Wix staff sites get all access without a plan (e.g. App Market review and internal testing).
  if (snapshot.ownerIsWixStaff) return { ...make('business', 'override'), limits: STAFF_LIMITS };
  // A free install is the Basic plan.
  if (snapshot.isFree) return make('basic', 'free');

  const plan = planForPackage(snapshot.packageName, cfg);
  if (plan === 'none') return make('none', 'unknown', null, snapshot.packageName);

  if (snapshot.expirationDate && Date.parse(snapshot.expirationDate) < cfg.now.getTime() && snapshot.autoRenewing === false) {
    return make('none', 'expired', snapshot.expirationDate, snapshot.packageName);
  }
  if (snapshot.freeTrialStatus === 'IN_PROGRESS') return make(plan, 'trial', snapshot.expirationDate, snapshot.packageName);
  // Cancellation keeps access until the end of the paid cycle (Wix docs: Paid Plan Auto Renewal Cancelled).
  if (snapshot.autoRenewing === false) return make(plan, 'cancelling', snapshot.expirationDate, snapshot.packageName);
  return make(plan, 'active', snapshot.expirationDate, snapshot.packageName);
}

/** Whether a rule uses features above the plan; such rules are skipped at runtime, never repriced. */
export function ruleExceedsPlan(rule: PricingRule, limits: PlanLimits): boolean {
  if (limits.advancedRules) return false;
  const c = rule.conditions;
  return (
    rule.mode !== 'per_unit' ||
    rule.surcharges.length > 0 ||
    rule.freeDelivery.enabled ||
    c.zoneIds.length > 0 ||
    c.locationIds.length > 0 ||
    c.minSubtotal != null ||
    c.maxSubtotal != null ||
    c.maxWeightKg != null
  );
}

export function currentUsageMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}
