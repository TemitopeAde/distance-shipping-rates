import { defineMiddleware } from 'astro:middleware';
import {
  AUTOCOMPLETE_API_KEY,
  CHECKOUT_BUDGET_MS,
  ENTITLEMENT_OVERRIDE_INSTANCE_IDS,
  PLAN_PACKAGE_BASIC,
  PLAN_PACKAGE_PRO,
  ROLLOUT_ALLOWLIST,
  ROLLOUT_MODE,
  ROUTING_API_KEY,
  ROUTING_PROVIDER,
} from 'astro:env/server';
import { publishServerEnv } from './lib/wix/runtime-env';

/** Makes server env available to separately-bundled backend extensions (see runtime-env.ts). */
export const onRequest = defineMiddleware((_context, next) => {
  publishServerEnv({
    ROUTING_PROVIDER,
    ROUTING_API_KEY,
    AUTOCOMPLETE_API_KEY,
    PLAN_PACKAGE_BASIC,
    PLAN_PACKAGE_PRO,
    ENTITLEMENT_OVERRIDE_INSTANCE_IDS,
    ROLLOUT_MODE,
    ROLLOUT_ALLOWLIST,
    CHECKOUT_BUDGET_MS,
  });
  return next();
});
