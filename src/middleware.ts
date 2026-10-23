import { defineMiddleware } from 'astro:middleware';
import {
  AUTOCOMPLETE_API_KEY,
  CHECKOUT_BUDGET_MS,
  ENTITLEMENT_OVERRIDE_INSTANCE_IDS,
  PLAN_PACKAGE_BUSINESS,
  PLAN_PACKAGE_PRO,
  ROLLOUT_ALLOWLIST,
  ROLLOUT_MODE,
  ROUTING_API_KEY,
  ROUTING_PROVIDER,
  LIFECYCLE_SHEETS_WEBHOOK_URL,
  LIFECYCLE_SHEETS_WEBHOOK_SECRET,
} from 'astro:env/server';
import { publishServerEnv } from './lib/wix/runtime-env';
import { publishLifecycleSheetsEnv } from './backend/lifecycle-env-bridge';

/** Makes server env available to separately-bundled backend extensions (see runtime-env.ts). */
export const onRequest = defineMiddleware((_context, next) => {
  publishServerEnv({
    ROUTING_PROVIDER,
    ROUTING_API_KEY,
    AUTOCOMPLETE_API_KEY,
    PLAN_PACKAGE_PRO,
    PLAN_PACKAGE_BUSINESS,
    ENTITLEMENT_OVERRIDE_INSTANCE_IDS,
    ROLLOUT_MODE,
    ROLLOUT_ALLOWLIST,
    CHECKOUT_BUDGET_MS,
  });
  publishLifecycleSheetsEnv({ LIFECYCLE_SHEETS_WEBHOOK_URL, LIFECYCLE_SHEETS_WEBHOOK_SECRET });
  return next();
});
