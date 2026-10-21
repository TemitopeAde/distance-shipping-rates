import { billing } from '@wix/app-management';
import { auth } from '@wix/essentials';
import { loadBilling, refreshBilling } from '../billing/sync';
import type { Repositories } from '../data/repositories';
import {
  checkoutBudgetMs,
  entitlementConfig,
  packageIdFor,
  rolloutAllows,
  rolloutMode,
  routingProviderId,
  routingProviderOrNull,
} from '../wix/env';
import type { ServiceDeps } from './services';

const elevatedGetUrl = auth.elevate(billing.getUrl);

export function serviceDeps(repos: Repositories): ServiceDeps {
  return {
    repos,
    provider: routingProviderOrNull(),
    providerId: routingProviderId(),
    entitlementConfig: entitlementConfig(),
    loadBilling,
    refreshBilling: (r) => refreshBilling(r),
    rolloutMode: rolloutMode(),
    rolloutAllowed: rolloutAllows(repos.instanceId),
    budgetMs: checkoutBudgetMs(),
    getCheckoutUrl: async (plan, billingCycle) => {
      const res = await elevatedGetUrl(packageIdFor(plan), { billingCycle });
      if (!res.checkoutUrl) throw new Error('Wix returned no checkout URL');
      return res.checkoutUrl;
    },
  };
}
