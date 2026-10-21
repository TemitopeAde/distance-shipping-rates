import { app } from '@wix/astro/builders';
import distanceShippingPage from './extensions/dashboard/pages/distance-shipping/distance-shipping.extension.ts';

import distanceRates from './extensions/backend/service-plugins/distance-rates/distance-rates.extension.ts';

import dataCollections from './extensions/backend/data-collections/data-collections.extension.ts';

import billingInstalled from './extensions/backend/events/billing-installed/billing-installed.extension.ts';

import billingRemoved from './extensions/backend/events/billing-removed/billing-removed.extension.ts';

import billingPurchased from './extensions/backend/events/billing-purchased/billing-purchased.extension.ts';

import billingChanged from './extensions/backend/events/billing-changed/billing-changed.extension.ts';

import billingCancelled from './extensions/backend/events/billing-cancelled/billing-cancelled.extension.ts';

import billingConverted from './extensions/backend/events/billing-converted/billing-converted.extension.ts';

import billingReactivated from './extensions/backend/events/billing-reactivated/billing-reactivated.extension.ts';

import billingTransferred from './extensions/backend/events/billing-transferred/billing-transferred.extension.ts';

export default app()
  .use(distanceShippingPage).use(distanceRates).use(dataCollections).use(billingInstalled).use(billingRemoved).use(billingPurchased).use(billingChanged).use(billingCancelled).use(billingConverted).use(billingReactivated).use(billingTransferred);
