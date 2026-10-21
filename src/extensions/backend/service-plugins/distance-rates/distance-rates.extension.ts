import { extensions } from '@wix/astro/builders'

export default extensions.ecomShippingRates({
  id: '0673e8a1-abf2-463a-b709-f70fe734f34a',
  name: 'Distance-Based Delivery',
  description: 'Delivery rates calculated from actual road distance between your fulfillment locations and the customer.',
  // The merchant must define a backup rate in Wix shipping settings; Wix uses it if this plugin errors or times out.
  fallbackDefinitionMandatory: true,
  source: './extensions/backend/service-plugins/distance-rates/distance-rates.ts',
});
