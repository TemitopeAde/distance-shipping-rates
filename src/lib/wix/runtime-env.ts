/**
 * Server environment access that works in every backend bundle.
 *
 * Wix CLI bundles service plugins and webhooks in a separate Vite build that
 * cannot resolve `astro:env/server`. Requests for those extensions are still
 * served through Astro routes (`/_wix/extensions/...`) in the main server
 * bundle, so `src/middleware.ts` publishes the validated env here before each
 * request. `process.env` is the fallback for local tooling.
 */
export interface ServerEnv {
  ROUTING_PROVIDER: string;
  ROUTING_API_KEY: string | undefined;
  AUTOCOMPLETE_API_KEY: string | undefined;
  PLAN_PACKAGE_BASIC: string;
  PLAN_PACKAGE_PRO: string;
  ENTITLEMENT_OVERRIDE_INSTANCE_IDS: string | undefined;
  ROLLOUT_MODE: string;
  ROLLOUT_ALLOWLIST: string | undefined;
  CHECKOUT_BUDGET_MS: number;
}

const GLOBAL_KEY = '__distanceShippingServerEnv__';

type GlobalWithEnv = typeof globalThis & { [GLOBAL_KEY]?: ServerEnv };

export function publishServerEnv(env: ServerEnv): void {
  (globalThis as GlobalWithEnv)[GLOBAL_KEY] = env;
}

function fromProcess(key: string): string | undefined {
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    return proc?.env?.[key];
  } catch {
    return undefined;
  }
}

export function getServerEnv(): ServerEnv {
  const published = (globalThis as GlobalWithEnv)[GLOBAL_KEY];
  if (published) return published;
  const budget = Number(fromProcess('CHECKOUT_BUDGET_MS'));
  return {
    ROUTING_PROVIDER: fromProcess('ROUTING_PROVIDER') ?? 'google',
    ROUTING_API_KEY: fromProcess('ROUTING_API_KEY'),
    AUTOCOMPLETE_API_KEY: fromProcess('AUTOCOMPLETE_API_KEY'),
    PLAN_PACKAGE_BASIC: fromProcess('PLAN_PACKAGE_BASIC') ?? 'basic',
    PLAN_PACKAGE_PRO: fromProcess('PLAN_PACKAGE_PRO') ?? 'pro',
    ENTITLEMENT_OVERRIDE_INSTANCE_IDS: fromProcess('ENTITLEMENT_OVERRIDE_INSTANCE_IDS'),
    ROLLOUT_MODE: fromProcess('ROLLOUT_MODE') ?? 'all',
    ROLLOUT_ALLOWLIST: fromProcess('ROLLOUT_ALLOWLIST'),
    CHECKOUT_BUDGET_MS: Number.isFinite(budget) && budget > 0 ? budget : 4000,
  };
}
