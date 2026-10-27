/**
 * The dashboard's features as tools for the Wix AI assistant (Aria), declared in
 * the `aria-tools` App Tools extension. Each tool calls the same service the
 * dashboard API route calls, with the same Zod validation and plan checks, and
 * returns a compact, JSON-safe result.
 *
 * Updates take partial `changes` merged onto the stored record, so Aria can say
 * "raise the base fee to $6" without resending the whole rule.
 */
import { z, type ZodType } from 'zod';
import { minorToDecimalString } from '../shipping/money';
import {
  checkoutUrl,
  deleteLocation,
  deleteRule,
  deleteZone,
  duplicateRule,
  getBilling,
  getOverview,
  getSettings,
  listLogs,
  listRules,
  onboardingAction,
  reorderRules,
  saveLocation,
  saveRule,
  saveZone,
  simulate,
  updateSettings,
  type ServiceDeps,
} from './services';
import {
  addressInputSchema,
  checkoutUrlInputSchema,
  decimalAmount,
  locationInputSchema,
  logsQuerySchema,
  onboardingActionSchema,
  pricingRuleInputSchema,
  reorderInputSchema,
  settingsInputSchema,
  zoneInputSchema,
  type MerchantSettings,
} from '../validation/schemas';
import { ApiError } from './errors';

export const ASSISTANT_TOOLS = [
  // Overview and checkout
  'get-delivery-overview',
  'run-delivery-setup-action',
  // Pricing rules
  'list-pricing-rules',
  'create-pricing-rule',
  'update-pricing-rule',
  'duplicate-pricing-rule',
  'reorder-pricing-rules',
  'delete-pricing-rule',
  // Delivery zones
  'list-delivery-zones',
  'create-delivery-zone',
  'update-delivery-zone',
  'delete-delivery-zone',
  // Fulfillment locations
  'list-fulfillment-locations',
  'create-fulfillment-location',
  'update-fulfillment-location',
  'delete-fulfillment-location',
  // Settings, plan, simulator, logs
  'get-delivery-settings',
  'update-delivery-settings',
  'get-plan-and-usage',
  'get-plan-upgrade-link',
  'quote-delivery-rate',
  'list-recent-calculations',
] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];

/** Tools that call the routing provider; the handler rate-limits them like the dashboard routes. */
export const GEOCODING_TOOLS: ReadonlySet<string> = new Set(['create-fulfillment-location', 'update-fulfillment-location']);
export const SIMULATOR_TOOLS: ReadonlySet<string> = new Set(['quote-delivery-rate']);

const idOnly = z.object({ id: z.string().trim().min(1).max(64) });
const changesOf = z.object({ id: z.string().trim().min(1).max(64), changes: z.record(z.string(), z.unknown()) });
const settingsChanges = z.object({ changes: z.record(z.string(), z.unknown()) });

const quotePayloadSchema = z.object({
  destination: addressInputSchema,
  subtotal: decimalAmount.default('0'),
  subtotalBeforeDiscount: decimalAmount.nullable().default(null),
  weight: z.number().finite().min(0).max(100000).nullable().default(null),
  weightUnit: z.enum(['KG', 'LB']).default('KG'),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  locationId: z.string().max(64).nullable().default(null),
});

const logsPayloadSchema = logsQuerySchema.pick({ status: true, source: true }).extend({
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

function parse<T>(schema: ZodType<T>, payload: unknown): T {
  const res = schema.safeParse(payload ?? {});
  if (!res.success) {
    const issues = res.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw new ApiError(400, 'invalid_input', `Invalid tool input: ${issues}`);
  }
  return res.data;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Top-level merge that also merges nested objects one level down (e.g. `conditions`, `freeDelivery`, `address`). */
function mergeChanges<T extends object>(base: T, changes: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(changes)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? { ...(out[key] as object), ...value } : value;
  }
  return out;
}

function withoutId<T extends { id: string }>(entity: T): Omit<T, 'id'> {
  const { id: _omit, ...rest } = entity;
  return rest;
}

function editableSettings(s: MerchantSettings) {
  const { onboarding: _o, settingsVersion: _v, ...settings } = s;
  return settings;
}

export async function runAssistantTool(d: ServiceDeps, methodName: string, payload: unknown, currency?: string): Promise<Record<string, unknown>> {
  switch (methodName as AssistantTool) {
    // -- Overview and checkout ------------------------------------------------
    case 'get-delivery-overview': {
      const o = await getOverview(d);
      return {
        live: o.pluginEnabled,
        setupCompletionPercent: o.completion,
        checklist: o.checklist.map((c) => ({ step: c.id, done: c.done })),
        checkoutHealth: o.health,
        lastCheckoutAt: o.lastCheckoutAt,
        plan: o.entitlement.plan,
        planStatus: o.entitlement.status,
        lookupsThisMonth: o.usage,
        routing: o.routing,
        distanceUnit: o.unit,
        failureMode: o.failureMode,
        counts: o.counts,
        ruleWarnings: o.ruleWarnings,
        recentCalculations: o.recent.map((r) => ({ at: r.createdAt, source: r.source, status: r.status, reason: r.reason })),
      };
    }
    case 'run-delivery-setup-action': {
      const { action } = parse(onboardingActionSchema.extend({ action: onboardingActionSchema.shape.action.exclude(['seed']) }), payload);
      const s = await onboardingAction(d, action);
      return { ok: true, live: s.pluginEnabled, onboarding: s.onboarding };
    }

    // -- Pricing rules -------------------------------------------------------
    case 'list-pricing-rules': {
      const { rules, warnings, limits } = await listRules(d);
      return { rules, warnings, maxRules: limits.maxRules };
    }
    case 'create-pricing-rule': {
      const { rule } = parse(z.object({ rule: z.record(z.string(), z.unknown()) }), payload);
      return { ok: true, rule: await saveRule(d, parse(pricingRuleInputSchema, rule)) };
    }
    case 'update-pricing-rule': {
      const { id, changes } = parse(changesOf, payload);
      const existing = await d.repos.rules.get(id);
      if (!existing) throw new ApiError(404, 'not_found', `No pricing rule with id ${id}`);
      const input = parse(pricingRuleInputSchema, mergeChanges(withoutId(existing), changes));
      return { ok: true, rule: await saveRule(d, input, id) };
    }
    case 'duplicate-pricing-rule': {
      const { id } = parse(idOnly, payload);
      return { ok: true, rule: await duplicateRule(d, id) };
    }
    case 'reorder-pricing-rules': {
      const { ids } = parse(reorderInputSchema, payload);
      await reorderRules(d, ids);
      return { ok: true };
    }
    case 'delete-pricing-rule': {
      const { id } = parse(idOnly, payload);
      await deleteRule(d, id);
      return { ok: true };
    }

    // -- Delivery zones ------------------------------------------------------
    case 'list-delivery-zones':
      return { zones: await d.repos.zones.list() };
    case 'create-delivery-zone': {
      const { zone } = parse(z.object({ zone: z.record(z.string(), z.unknown()) }), payload);
      return { ok: true, zone: await saveZone(d, parse(zoneInputSchema, zone)) };
    }
    case 'update-delivery-zone': {
      const { id, changes } = parse(changesOf, payload);
      const existing = await d.repos.zones.get(id);
      if (!existing) throw new ApiError(404, 'not_found', `No delivery zone with id ${id}`);
      return { ok: true, zone: await saveZone(d, parse(zoneInputSchema, mergeChanges(withoutId(existing), changes)), id) };
    }
    case 'delete-delivery-zone': {
      const { id } = parse(idOnly, payload);
      await deleteZone(d, id);
      return { ok: true };
    }

    // -- Fulfillment locations -----------------------------------------------
    case 'list-fulfillment-locations': {
      const locations = await d.repos.locations.list();
      return {
        locations: locations.map((l) => ({
          id: l.id,
          name: l.name,
          address: l.address,
          formattedAddress: l.formattedAddress || null,
          isPrimary: l.isPrimary,
          active: l.active,
          validated: l.validatedAt !== null,
          geocodeQuality: l.geocodeQuality,
          serviceRadius: l.serviceRadius,
          serviceCountries: l.serviceCountries,
        })),
      };
    }
    case 'create-fulfillment-location': {
      const { location } = parse(z.object({ location: z.record(z.string(), z.unknown()) }), payload);
      return { ok: true, ...(await saveLocation(d, parse(locationInputSchema, location))) };
    }
    case 'update-fulfillment-location': {
      const { id, changes } = parse(changesOf, payload);
      const existing = await d.repos.locations.get(id);
      if (!existing) throw new ApiError(404, 'not_found', `No location with id ${id}`);
      const { name, address, isPrimary, active, serviceRadius, serviceCountries } = existing;
      const input = parse(locationInputSchema, mergeChanges({ name, address, isPrimary, active, serviceRadius, serviceCountries }, changes));
      return { ok: true, ...(await saveLocation(d, input, id)) };
    }
    case 'delete-fulfillment-location': {
      const { id } = parse(idOnly, payload);
      await deleteLocation(d, id);
      return { ok: true };
    }

    // -- Settings and plan ---------------------------------------------------
    case 'get-delivery-settings':
      return { settings: editableSettings(await getSettings(d)) };
    case 'update-delivery-settings': {
      const { changes } = parse(settingsChanges, payload);
      const input = parse(settingsInputSchema, mergeChanges(editableSettings(await getSettings(d)), changes));
      const saved = await updateSettings(d, input);
      return {
        ok: true,
        settings: editableSettings(saved),
        // Rates are switched on and off with run-delivery-setup-action, never through settings.
        note: 'pluginEnabled' in changes ? 'Use run-delivery-setup-action with go_live or pause to turn rates on or off.' : undefined,
      };
    }
    case 'get-plan-and-usage': {
      const b = await getBilling(d, { refresh: true });
      return { plan: b.entitlement.plan, status: b.entitlement.status, accessUntil: b.entitlement.accessUntil, limits: b.entitlement.limits, lookupsThisMonth: b.usage, plans: b.plans };
    }
    case 'get-plan-upgrade-link': {
      const { plan, billingCycle } = parse(checkoutUrlInputSchema, payload);
      return await checkoutUrl(d, plan, billingCycle);
    }

    // -- Simulator and logs --------------------------------------------------
    case 'quote-delivery-rate': {
      const input = parse(quotePayloadSchema, payload);
      const cur = input.currency ?? currency;
      if (!cur) throw new ApiError(400, 'invalid_input', 'Invalid tool input: currency is required');
      const { outcome } = await simulate(d, { ...input, currency: cur });
      return summarizeOutcome(outcome);
    }
    case 'list-recent-calculations': {
      const q = parse(logsPayloadSchema, payload);
      const { rows, total } = await listLogs(d, { status: q.status, source: q.source, page: 0, pageSize: Math.max(q.limit, 5) });
      return {
        total,
        calculations: rows.slice(0, q.limit).map((r) => ({
          at: r.createdAt,
          source: r.source,
          status: r.status,
          reason: r.reason,
          providerError: r.providerError || null,
          price: r.price ? `${r.price} ${r.currency}` : null,
          distance: r.distance === null ? null : `${r.distance} ${r.unit}`,
          destination: [r.destPostalPrefix, r.destCountry].filter(Boolean).join(' '),
          cacheHit: r.cacheHit,
          latencyMs: r.latencyMs,
          ref: r.requestRef,
        })),
      };
    }
    default:
      throw new ApiError(404, 'unknown_tool', `Unknown tool: ${methodName}`);
  }
}

type SerializedOption = { title: string; code: string; priceMinor: string; handlingMinor: string; currency: string; freeDelivery: boolean };

/** Turns the simulator outcome (minor units as strings) into prices Aria can read out. */
function summarizeOutcome(outcome: Record<string, unknown>): Record<string, unknown> {
  const option = (o: SerializedOption) => ({
    title: o.title,
    code: o.code,
    price: `${minorToDecimalString(BigInt(o.priceMinor) + BigInt(o.handlingMinor), o.currency)} ${o.currency}`,
    freeDelivery: o.freeDelivery,
  });
  const km = (m: unknown) => (typeof m === 'number' ? Math.round(m / 100) / 10 : null);
  switch (outcome.kind) {
    case 'rates':
      return { result: 'priced', distanceKm: km(outcome.distanceMeters), options: (outcome.options as SerializedOption[]).map(option) };
    case 'fallback':
      return { result: 'fallback_rate', reason: outcome.reason, options: [option(outcome.option as SerializedOption)] };
    case 'no_rate':
      return { result: 'no_rate', reason: outcome.reason, distanceKm: km(outcome.distanceMeters), ruleDiagnostics: outcome.ruleDiagnostics ?? [] };
    default:
      return { result: 'address_error', error: outcome.error, fields: outcome.fields };
  }
}
