import { shippingRates } from '@wix/ecom/service-plugins';
import { loadBilling } from '../../../../lib/billing/sync';
import { createRepositories } from '../../../../lib/data/repositories';
import { wixGateway } from '../../../../lib/data/wix-gateway';
import { runQuote } from '../../../../lib/quote/runner';
import { fromWixRequest, toWixMapping } from '../../../../lib/quote/wix-adapter';
import {
  checkoutBudgetMs,
  entitlementConfig,
  rolloutAllows,
  routingProviderOrNull,
} from '../../../../lib/wix/env';

shippingRates.provideHandlers({
  getShippingRates: async ({ request, metadata }) => {
    const instanceId = metadata.instanceId ?? '';
    const currency = metadata.currency ?? '';
    if (!instanceId) {
      // No tenant context: we cannot load configuration, so offer nothing.
      return { shippingRates: [] };
    }

    const budgetMs = checkoutBudgetMs();
    const { outcome, latencyMs, log } = await runQuote(fromWixRequest(request, currency), {
      repos: createRepositories(wixGateway, instanceId),
      provider: routingProviderOrNull(),
      entitlementConfig: entitlementConfig(),
      budgetMs,
      // Provider geocoding often takes 2–3 s; a fixed 1.5 s attempt timed out and forced the fallback rate.
      // Attempts are still capped by the overall deadline, so this never extends checkout latency.
      retryPolicy: { attemptTimeoutMs: Math.floor(budgetMs * 0.6) },
      rolloutAllowed: rolloutAllows(instanceId),
      requestId: metadata.requestId,
      loadBilling,
    });

    // Structured, PII-free log line for `wix` backend logs.
    console.log(
      JSON.stringify({
        evt: 'shipping_rates',
        ref: log.requestRef,
        status: log.status,
        reason: log.reason,
        providerError: log.providerError,
        cacheHit: log.cacheHit,
        providerCalls: log.providerCalls,
        latencyMs,
      }),
    );

    const mapped = toWixMapping(outcome);
    switch (mapped.type) {
      case 'response':
        return mapped.response;
      case 'missing_postal_code':
        throw new shippingRates.MissingPostalCodeWixError({
          error: { code: 'MISSING_POSTAL_CODE', description: 'A postal code is required to calculate delivery.' },
        });
      case 'invalid_address':
        throw new shippingRates.InvalidAddressWixError({
          fields: mapped.fields.map((field) => ({
            field,
            description: 'More address detail is needed to calculate delivery.',
            violatedRule: 'REQUIRED_FIELD' as shippingRates.RuleType,
          })),
        });
    }
  },
});
