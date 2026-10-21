/**
 * Maps between the verified Wix Shipping Rates service-plugin contract
 * (`@wix/ecom/service-plugins` → `shippingRates`) and the quote pipeline.
 */
import type { shippingRates } from '@wix/ecom/service-plugins';
import { minorToDecimalString, parseWixDecimalMicros } from '../shipping/money';
import { normalizeAddress } from '../routing/address';
import type { WeightUnit } from '../shipping/units';
import type { QuoteLine, QuoteOption, QuoteOutcome, QuoteRequest } from './pipeline';

type WixRequest = shippingRates.GetShippingRatesRequest;
type WixAddress = shippingRates.Address;
type WixResponse = shippingRates.GetShippingRatesResponse;
type WixOption = shippingRates.ShippingOption;

function streetLine(a: WixAddress | undefined): string {
  if (!a) return '';
  if (a.addressLine1) return a.addressLine1;
  const oneOf = a as WixAddress & { addressLine?: string | null };
  if (oneOf.addressLine) return oneOf.addressLine;
  const s = a.streetAddress;
  return [s?.number, s?.name].filter(Boolean).join(' ');
}

function weightUnitOf(u: WixRequest['weightUnit']): WeightUnit | null {
  return u === 'KG' || u === 'LB' ? u : null;
}

function lineFrom(item: shippingRates.ProductItem): QuoteLine {
  const quantity = Number.isInteger(item.quantity) && (item.quantity as number) > 0 ? (item.quantity as number) : 0;
  const unit = parseWixDecimalMicros(item.price);
  const total = parseWixDecimalMicros(item.totalPrice) ?? (unit !== null ? unit * BigInt(quantity) : 0n);
  const unitBefore = parseWixDecimalMicros(item.priceBeforeDiscount);
  const totalBefore =
    parseWixDecimalMicros(item.totalPriceBeforeDiscount) ?? (unitBefore !== null ? unitBefore * BigInt(quantity) : null);
  const weight = item.physicalProperties?.weight;
  return {
    quantity,
    totalMicros: total < 0n ? 0n : total,
    totalBeforeDiscountMicros: totalBefore !== null && totalBefore < 0n ? 0n : totalBefore,
    weight: typeof weight === 'number' && Number.isFinite(weight) ? weight : null,
    // Wix marks non-shippable items explicitly; absent means shippable.
    shippable: item.physicalProperties?.shippable !== false,
  };
}

export function fromWixRequest(request: WixRequest, currency: string): QuoteRequest {
  const d = request.shippingDestination;
  return {
    source: 'checkout',
    currency: (currency ?? '').toUpperCase(),
    destination: normalizeAddress({
      addressLine1: streetLine(d),
      addressLine2: d?.addressLine2,
      city: d?.city,
      subdivision: d?.subdivision,
      postalCode: d?.postalCode,
      country: d?.country,
    }),
    lines: (request.lineItems ?? []).map(lineFrom),
    weightUnit: weightUnitOf(request.weightUnit),
  };
}

function toWixOption(o: QuoteOption): WixOption {
  const additionalCharges: shippingRates.AdditionalCharge[] =
    o.handlingMinor > 0n
      ? [
          {
            type: 'HANDLING_FEE' as shippingRates.ChargeType,
            price: minorToDecimalString(o.handlingMinor, o.currency),
            details: 'Handling fee',
          },
        ]
      : [];
  return {
    code: o.code,
    title: o.title,
    logistics: {
      ...(o.deliveryTime ? { deliveryTime: o.deliveryTime } : {}),
      ...(o.instructions ? { instructions: o.instructions } : {}),
    },
    cost: {
      price: minorToDecimalString(o.priceMinor, o.currency),
      currency: o.currency,
      additionalCharges,
    },
  };
}

export type WixMapping =
  | { type: 'response'; response: WixResponse }
  | { type: 'missing_postal_code' }
  | { type: 'invalid_address'; fields: string[] };

export function toWixMapping(outcome: QuoteOutcome): WixMapping {
  switch (outcome.kind) {
    case 'rates':
      return { type: 'response', response: { shippingRates: outcome.options.map(toWixOption) } };
    case 'fallback':
      return { type: 'response', response: { shippingRates: [toWixOption(outcome.option)] } };
    case 'address_error':
      return outcome.error === 'missing_postal_code' ? { type: 'missing_postal_code' } : { type: 'invalid_address', fields: outcome.fields };
    case 'no_rate':
      // Empty list = this carrier offers nothing for this request. Wix decides what the shopper sees.
      return { type: 'response', response: { shippingRates: [] } };
  }
}

/** Request fingerprint for log correlation and de-duplication; contains no PII. */
export function requestFingerprintInput(req: QuoteRequest): string {
  const subtotal = req.lines.reduce((sum, l) => sum + l.totalMicros, 0n);
  return JSON.stringify([req.currency, req.destination.country, req.destination.postalCode, subtotal.toString(), req.lines.length]);
}
