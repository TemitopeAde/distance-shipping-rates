/**
 * Contract tests against the verified Get Shipping Rates payload/response
 * shape (installed @wix/ecom typings, see docs/sdk-verification.md).
 */
import { describe, expect, it } from 'vitest';
import type { shippingRates } from '@wix/ecom/service-plugins';
import { fromWixRequest, toWixMapping } from './wix-adapter';
import type { QuoteOption } from './pipeline';

const wixRequest: shippingRates.GetShippingRatesRequest = {
  lineItems: [
    {
      name: 'Mug',
      quantity: 2,
      catalogReference: { catalogItemId: 'abc', appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e' },
      physicalProperties: { weight: 0.5, sku: 'MUG', shippable: true },
      price: '9.00',
      priceBeforeDiscount: '10.00',
      totalPrice: '18.00',
      totalPriceBeforeDiscount: '20.00',
    },
    { name: 'Gift card', quantity: 1, price: '25', physicalProperties: { shippable: false } },
  ],
  shippingDestination: {
    streetAddress: { number: '500', name: 'Congress Ave' },
    city: 'Austin',
    subdivision: 'US-TX',
    country: 'US',
    postalCode: '78701',
  },
  weightUnit: 'KG' as shippingRates.WeightUnit,
  purchaseFlowId: '7f1c1a2e-0000-4000-8000-000000000000',
};

const option = (o: Partial<QuoteOption> = {}): QuoteOption => ({
  code: 'local',
  title: 'Local delivery',
  ruleId: 'r1',
  priceMinor: 2500n,
  handlingMinor: 0n,
  currency: 'USD',
  freeDelivery: false,
  billedUnits: 10,
  breakdown: [],
  ...o,
});

const telemetry = { providerCalls: 0, cacheHit: true, routingErrorKind: null };

describe('fromWixRequest', () => {
  it('maps destination, line totals, weights and shippability', () => {
    const q = fromWixRequest(wixRequest, 'usd');
    expect(q.currency).toBe('USD');
    expect(q.destination).toEqual({
      addressLine1: '500 Congress Ave',
      addressLine2: '',
      city: 'Austin',
      subdivision: 'US-TX',
      postalCode: '78701',
      country: 'US',
    });
    expect(q.lines[0]).toEqual({ quantity: 2, totalMicros: 18_000_000n, totalBeforeDiscountMicros: 20_000_000n, weight: 0.5, shippable: true });
    expect(q.lines[1]).toMatchObject({ quantity: 1, totalMicros: 25_000_000n, shippable: false, weight: null });
    expect(q.weightUnit).toBe('KG');
  });

  it('tolerates missing destination and malformed prices', () => {
    const q = fromWixRequest({ lineItems: [{ quantity: 1, price: 'oops' }] }, 'EUR');
    expect(q.destination.country).toBe('');
    expect(q.lines[0].totalMicros).toBe(0n);
  });
});

describe('toWixMapping', () => {
  it('returns string prices in the request currency and handling as an additional charge', () => {
    const m = toWixMapping({
      kind: 'rates',
      options: [option({ handlingMinor: 150n })],
      originLocationId: 'loc',
      distanceMeters: 1,
      unit: 'mi',
      geocodeQuality: 'high',
      ...telemetry,
    });
    expect(m).toEqual({
      type: 'response',
      response: {
        shippingRates: [
          {
            code: 'local',
            title: 'Local delivery',
            cost: { price: '25.00', currency: 'USD', additionalCharges: [{ type: 'HANDLING_FEE', price: '1.50', details: 'Handling fee' }] },
          },
        ],
      },
    });
  });

  it('formats zero-decimal currencies without a fraction', () => {
    const m = toWixMapping({ kind: 'fallback', option: option({ currency: 'JPY', priceMinor: 800n }), reason: 'routing_unavailable', ...telemetry });
    expect(m.type === 'response' && m.response.shippingRates?.[0].cost?.price).toBe('800');
  });

  it('maps no-rate outcomes to an empty list (never a zero-price option)', () => {
    expect(toWixMapping({ kind: 'no_rate', reason: 'no_route', ...telemetry })).toEqual({ type: 'response', response: { shippingRates: [] } });
  });

  it('maps address errors to the documented Wix errors', () => {
    expect(toWixMapping({ kind: 'address_error', error: 'missing_postal_code', fields: [], ...telemetry })).toEqual({ type: 'missing_postal_code' });
    expect(toWixMapping({ kind: 'address_error', error: 'partial_address', fields: ['shippingDestination.addressLine1'], ...telemetry })).toEqual({
      type: 'invalid_address',
      fields: ['shippingDestination.addressLine1'],
    });
  });
});
