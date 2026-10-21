import { pricingRuleInputSchema, settingsInputSchema, type MerchantSettings, type PricingRuleInput } from './schemas';

export function defaultSettings(): MerchantSettings {
  return {
    ...settingsInputSchema.parse({}),
    settingsVersion: 1,
    onboarding: { demoRuleSeeded: false, settingsReviewed: false, carrierEnabledConfirmed: false, checkoutTested: false, wentLiveAt: null },
  };
}

/**
 * The one-time sample rule. Inactive and flagged as demo, so it can never be
 * offered at checkout until the merchant reviews and activates it.
 */
export function demoRuleInput(): PricingRuleInput {
  return pricingRuleInputSchema.parse({
    name: 'Sample: local delivery (review before use)',
    title: 'Local delivery',
    code: 'local-delivery',
    deliveryTime: '',
    active: false,
    isDemo: true,
    priority: 100,
    mode: 'per_unit',
    baseFee: '5',
    ratePerUnit: '2',
    maxDistance: 25,
  });
}
