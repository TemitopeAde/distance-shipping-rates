import { extensions } from '@wix/astro/builders'

import appInstancesCollection from './app-instances';

import merchantSettingsCollection from './merchant-settings';

import fulfillmentLocationsCollection from './fulfillment-locations';

import pricingRulesCollection from './pricing-rules';

import deliveryZonesCollection from './delivery-zones';

import routeCacheCollection from './route-cache';

import calculationLogsCollection from './calculation-logs';

import billingStateCollection from './billing-state';

import eventDedupeCollection from './event-dedupe';

export default extensions.dataCollections({
  id: '226db4f0-921b-4557-9106-c326b03db029',
  name: 'Data Collections',
  collections: [
    appInstancesCollection,
    merchantSettingsCollection,
    fulfillmentLocationsCollection,
    pricingRulesCollection,
    deliveryZonesCollection,
    routeCacheCollection,
    calculationLogsCollection,
    billingStateCollection,
    eventDedupeCollection
  ],
});
