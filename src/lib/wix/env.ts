/**
 * Typed accessors over the server environment. Backend-only.
 */
import { parseList, type EntitlementConfig } from '../billing/entitlements';
import type { PaidPlanId } from '../billing/plans';
import { createRoutingProvider } from '../routing';
import type { RoutingProvider } from '../routing/types';
import { getServerEnv } from './runtime-env';

export function routingProviderOrNull(): RoutingProvider | null {
  const env = getServerEnv();
  try {
    return createRoutingProvider(env.ROUTING_PROVIDER, env.ROUTING_API_KEY);
  } catch {
    return null;
  }
}

/** Key for dashboard address autocomplete; falls back to the routing key when that is a Geoapify key. */
export function autocompleteApiKey(): string | null {
  const env = getServerEnv();
  if (env.AUTOCOMPLETE_API_KEY) return env.AUTOCOMPLETE_API_KEY;
  return env.ROUTING_PROVIDER === 'geoapify' && env.ROUTING_API_KEY ? env.ROUTING_API_KEY : null;
}

export function routingProviderId(): string {
  return getServerEnv().ROUTING_PROVIDER;
}

export function routingConfigured(): boolean {
  return Boolean(getServerEnv().ROUTING_API_KEY);
}

export function entitlementConfig(now = new Date()): EntitlementConfig {
  const env = getServerEnv();
  return {
    proPackages: parseList(env.PLAN_PACKAGE_PRO),
    businessPackages: parseList(env.PLAN_PACKAGE_BUSINESS),
    overrideInstanceIds: parseList(env.ENTITLEMENT_OVERRIDE_INSTANCE_IDS),
    now,
  };
}

/** Staged rollout gate: 'off' disables checkout rates app-wide (emergency rollback). */
export function rolloutAllows(instanceId: string): boolean {
  const env = getServerEnv();
  if (env.ROLLOUT_MODE === 'off') return false;
  if (env.ROLLOUT_MODE === 'allowlist') return parseList(env.ROLLOUT_ALLOWLIST).includes(instanceId);
  return true;
}

export function rolloutMode(): string {
  return getServerEnv().ROLLOUT_MODE;
}

export function checkoutBudgetMs(): number {
  // Clamp so a misconfiguration cannot exceed a sane checkout budget.
  return Math.min(Math.max(getServerEnv().CHECKOUT_BUDGET_MS, 1500), 8000);
}

export function packageIdFor(plan: PaidPlanId): string {
  const env = getServerEnv();
  const list = parseList(plan === 'business' ? env.PLAN_PACKAGE_BUSINESS : env.PLAN_PACKAGE_PRO);
  return list[0] ?? plan;
}
