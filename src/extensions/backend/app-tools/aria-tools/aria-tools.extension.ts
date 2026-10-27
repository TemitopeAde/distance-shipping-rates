import { extensions } from '@wix/astro/builders'

// Handled in service-plugins/aria-tools-provider via lib/api/assistant-tools.ts, which reuses the dashboard's services.
// Every write returns `{ ok: false, error, message }` when validation, a plan limit or a go-live check refuses it.

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', properties, required });
const str = (description?: string) => ({ type: 'string', ...(description && { description }) });
const num = (description?: string) => ({ type: 'number', ...(description && { description }) });
const bool = (description?: string) => ({ type: 'boolean', ...(description && { description }) });
const strList = (description?: string) => ({ type: 'array', items: { type: 'string' }, ...(description && { description }) });
const money = (description: string) => str(`${description}. Decimal string in the site currency, e.g. "4.50"`);
const id = (what: string) => str(`The ${what} id, from the matching list tool`);

const address = obj(
  {
    addressLine1: str('Street address'),
    addressLine2: str(),
    city: str(),
    subdivision: str('State, province or region code, e.g. TX'),
    postalCode: str(),
    country: str('ISO 3166-1 alpha-2 country code, e.g. US'),
  },
  ['country'],
);

const rule = obj({
  title: str('Delivery option name shown to shoppers at checkout'),
  code: str('Option code: lowercase letters, digits, - or _. Rules sharing a code compete by priority'),
  active: bool('Whether checkout uses this rule. Defaults to false'),
  priority: num('Lower runs first'),
  mode: { type: 'string', enum: ['per_unit', 'graduated_tiers', 'volume_tiers'], description: 'per_unit: base fee + rate per mile/km. Tier modes use `tiers`' },
  baseFee: money('Flat fee added to every delivery'),
  ratePerUnit: money('Charge per mile or km (the settings distance unit)'),
  includedDistance: num('Distance included in the base fee before the per-unit rate applies'),
  tiers: { type: 'array', items: obj({ upTo: num('Bracket upper bound; null for the last open bracket'), ratePerUnit: str(), flatFee: str() }) },
  minFee: money('Minimum fee, or null'),
  maxFee: money('Maximum fee, or null'),
  maxDistance: num('Farthest distance this rule delivers, or null'),
  freeDelivery: obj({ enabled: bool(), threshold: money('Order value for free delivery'), basis: { type: 'string', enum: ['after_discount', 'before_discount'] }, waiveHandling: bool() }),
  handlingFee: money('Separate handling charge, or null'),
  surcharges: { type: 'array', description: 'Each is {kind:"weight_over", thresholdKg, amount} or {kind:"order_value_over", threshold, amount}' },
  conditions: obj({ minSubtotal: str(), maxSubtotal: str(), maxWeightKg: num(), zoneIds: strList('Only apply in these zones'), locationIds: strList('Only apply from these locations') }),
});

const zone = obj({
  name: str(),
  type: { type: 'string', enum: ['include', 'exclude'], description: 'include: deliver only here; exclude: never deliver here' },
  active: bool(),
  countries: strList('ISO alpha-2 country codes'),
  subdivisions: strList('Region codes, e.g. CA-ON or TX'),
  postalPatterns: strList('Exact codes, prefixes ending in * (e.g. 787*), or numeric ranges (e.g. 78701-78799)'),
  maxDistance: num('Include zones only: farthest delivery distance in this zone'),
});

const location = obj({
  name: str(),
  address,
  isPrimary: bool('Price orders from this location when the origin strategy is primary'),
  active: bool(),
  serviceRadius: num('Farthest delivery distance from this location, or null'),
  serviceCountries: strList('Countries this location may serve; empty for any'),
});

const confirmFirst = 'Confirm the change with the user before calling.';

export default extensions.appTools({
  id: 'c293f3fb-e64c-4449-acfd-cb5c7c01c1ad',
  name: 'aria-tools',
  // learn more about JSON Schema - https://json-schema.org/overview/what-is-jsonschema
  tools: [
    // -- Overview and checkout ----------------------------------------------
    {
      methodName: 'get-delivery-overview',
      displayName: 'Delivery Setup Overview',
      description:
        'Returns the Distance-Based Shipping & Delivery overview: whether distance-based delivery rates are live at checkout, the setup checklist and percent complete, checkout health, the last checkout calculation, the plan, address lookups used this month, rule warnings and recent calculations. Use when the user asks if delivery rates are working, what is left to set up, or why customers see no delivery option.',
      activated: true,
      requestSchema: obj(),
      responseSchema: obj({ live: bool(), setupCompletionPercent: num(), checklist: { type: 'array' }, checkoutHealth: str(), plan: str(), lookupsThisMonth: obj() }),
    },
    {
      methodName: 'run-delivery-setup-action',
      displayName: 'Go Live or Pause Delivery Rates',
      description: `Runs a checkout setup step. go_live turns distance-based rates on at checkout (refused unless an active validated location, an active non-demo rule and a plan with checkout exist); pause turns them off; confirm_carrier records that the app is enabled as a carrier in Wix shipping settings; confirm_checkout_test records a successful test checkout. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ action: { type: 'string', enum: ['go_live', 'pause', 'confirm_carrier', 'confirm_checkout_test'] } }, ['action']),
      responseSchema: obj({ ok: bool(), live: bool(), error: str() }),
    },

    // -- Pricing rules ------------------------------------------------------
    {
      methodName: 'list-pricing-rules',
      displayName: 'List Delivery Pricing Rules',
      description:
        'Lists the delivery pricing rules in priority order with their ids: base fee, rate per mile or km, distance brackets, minimum and maximum fees, surcharges, free-delivery thresholds, conditions and whether each is active, plus conflict warnings. Use when the user asks how delivery is priced, or before changing a rule.',
      activated: true,
      requestSchema: obj(),
      responseSchema: obj({ rules: { type: 'array' }, warnings: { type: 'array' }, maxRules: num() }),
    },
    {
      methodName: 'create-pricing-rule',
      displayName: 'Create Delivery Pricing Rule',
      description: `Creates a delivery pricing rule. Requires name, title and code; for a simple rule also set baseFee and ratePerUnit, and active: true to use it at checkout. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ rule }, ['rule']),
      responseSchema: obj({ ok: bool(), rule: obj(), error: str() }),
    },
    {
      methodName: 'update-pricing-rule',
      displayName: 'Update Delivery Pricing Rule',
      description: `Changes fields of an existing pricing rule, such as fees, rate per distance, brackets, free-delivery threshold, conditions or active state. Send only the fields to change in changes. Use list-pricing-rules for the id. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ id: id('rule'), changes: rule }, ['id', 'changes']),
      responseSchema: obj({ ok: bool(), rule: obj(), error: str() }),
    },
    {
      methodName: 'duplicate-pricing-rule',
      displayName: 'Duplicate Delivery Pricing Rule',
      description: 'Copies a pricing rule as an inactive draft named "(copy)". Use when the user wants a variant of an existing rule.',
      activated: true,
      requestSchema: obj({ id: id('rule') }, ['id']),
      responseSchema: obj({ ok: bool(), rule: obj() }),
    },
    {
      methodName: 'reorder-pricing-rules',
      displayName: 'Reorder Delivery Pricing Rules',
      description: `Sets the priority order of all pricing rules. ids must list every rule id exactly once, highest priority first. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ ids: strList('Every rule id, highest priority first') }, ['ids']),
      responseSchema: obj({ ok: bool() }),
    },
    {
      methodName: 'delete-pricing-rule',
      displayName: 'Delete Delivery Pricing Rule',
      description: `Permanently deletes a pricing rule. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ id: id('rule') }, ['id']),
      responseSchema: obj({ ok: bool() }),
    },

    // -- Delivery zones -----------------------------------------------------
    {
      methodName: 'list-delivery-zones',
      displayName: 'List Delivery Zones',
      description:
        'Lists delivery zones with their ids: include or exclude zones by country, region or postal code pattern, any maximum distance, and whether each is active. Use when the user asks where they deliver or whether an area is excluded.',
      activated: true,
      requestSchema: obj(),
      responseSchema: obj({ zones: { type: 'array' } }),
    },
    {
      methodName: 'create-delivery-zone',
      displayName: 'Create Delivery Zone',
      description: `Creates a delivery zone that limits (include) or blocks (exclude) delivery by country, region or postal code. Needs a name, a type and at least one country, region or postal pattern. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ zone }, ['zone']),
      responseSchema: obj({ ok: bool(), zone: obj(), error: str() }),
    },
    {
      methodName: 'update-delivery-zone',
      displayName: 'Update Delivery Zone',
      description: `Changes fields of an existing delivery zone. Send only the fields to change; lists such as postalPatterns are replaced whole. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ id: id('zone'), changes: zone }, ['id', 'changes']),
      responseSchema: obj({ ok: bool(), zone: obj(), error: str() }),
    },
    {
      methodName: 'delete-delivery-zone',
      displayName: 'Delete Delivery Zone',
      description: `Permanently deletes a delivery zone. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ id: id('zone') }, ['id']),
      responseSchema: obj({ ok: bool() }),
    },

    // -- Fulfillment locations ----------------------------------------------
    {
      methodName: 'list-fulfillment-locations',
      displayName: 'List Delivery Locations',
      description:
        'Lists the stores or warehouses deliveries are priced from, with ids, addresses, which is primary, whether each is active and its address validated, and any service radius or country limits.',
      activated: true,
      requestSchema: obj(),
      responseSchema: obj({ locations: { type: 'array' } }),
    },
    {
      methodName: 'create-fulfillment-location',
      displayName: 'Add Delivery Location',
      description: `Adds a store or warehouse to deliver from and validates its address. Needs a name and a full address. Returns a warning if the address could not be confirmed. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ location }, ['location']),
      responseSchema: obj({ ok: bool(), location: obj(), warning: str(), error: str() }),
    },
    {
      methodName: 'update-fulfillment-location',
      displayName: 'Update Delivery Location',
      description: `Changes a delivery location's name, address, primary flag, active state, service radius or countries, and revalidates the address. Send only the fields to change. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ id: id('location'), changes: location }, ['id', 'changes']),
      responseSchema: obj({ ok: bool(), location: obj(), warning: str(), error: str() }),
    },
    {
      methodName: 'delete-fulfillment-location',
      displayName: 'Delete Delivery Location',
      description: `Permanently removes a delivery location. ${confirmFirst}`,
      activated: true,
      requestSchema: obj({ id: id('location') }, ['id']),
      responseSchema: obj({ ok: bool() }),
    },

    // -- Settings and plan --------------------------------------------------
    {
      methodName: 'get-delivery-settings',
      displayName: 'Delivery Settings',
      description:
        'Returns delivery settings: distance unit, what happens when routing fails and the fallback rate, origin strategy (primary or nearest location), maximum delivery distance, address rules, toll and highway avoidance, route cache and history retention, language and notifications.',
      activated: true,
      requestSchema: obj(),
      responseSchema: obj({ settings: obj() }),
    },
    {
      methodName: 'update-delivery-settings',
      displayName: 'Update Delivery Settings',
      description: `Changes delivery settings. Send only the fields to change. Turning rates on or off is done with run-delivery-setup-action, not here. ${confirmFirst}`,
      activated: true,
      requestSchema: obj(
        {
          changes: obj({
            unit: { type: 'string', enum: ['mi', 'km'] },
            failureMode: { type: 'string', enum: ['fail_closed', 'fail_open'], description: 'fail_open shows the fallback rate when routing fails; needs fallbackRate and fallbackRiskAcknowledged: true' },
            fallbackRate: obj({ title: str(), price: str() }),
            fallbackRiskAcknowledged: bool(),
            originStrategy: { type: 'string', enum: ['primary', 'nearest'] },
            addressStrictness: { type: 'string', enum: ['strict', 'standard'] },
            addressErrorBehavior: { type: 'string', enum: ['no_rate', 'request_details'] },
            requirePostalCode: bool(),
            maxDeliveryDistance: num('Or null for no limit'),
            routing: obj({ avoidTolls: bool(), avoidHighways: bool() }),
            cacheTtlHours: num('0 to 720'),
            logRetentionDays: num('1 to 90, capped by the plan'),
            language: str('Dashboard language code, e.g. en'),
            notifications: obj({ failureAlerts: bool(), weeklySummary: bool() }),
            accessEndBehavior: { type: 'string', enum: ['no_rates', 'fallback_rate'] },
          }),
        },
        ['changes'],
      ),
      responseSchema: obj({ ok: bool(), settings: obj(), error: str() }),
    },
    {
      methodName: 'get-plan-and-usage',
      displayName: 'Delivery App Plan and Usage',
      description:
        'Returns the current plan (basic, pro or business), its status, its limits (locations, rules, monthly address lookups, history days) and lookups used this month, plus every plan\'s limits for comparison. Use when the user asks about their plan, limits, usage or whether to upgrade.',
      activated: true,
      requestSchema: obj(),
      responseSchema: obj({ plan: str(), status: str(), limits: obj(), lookupsThisMonth: obj(), plans: obj() }),
    },
    {
      methodName: 'get-plan-upgrade-link',
      displayName: 'Delivery App Upgrade Link',
      description: 'Returns a Wix checkout link to buy or change to the Pro or Business plan. Give the link to the user to open; this does not charge anything by itself.',
      activated: true,
      requestSchema: obj({ plan: { type: 'string', enum: ['pro', 'business'] }, billingCycle: { type: 'string', enum: ['MONTHLY', 'YEARLY'] } }, ['plan']),
      responseSchema: obj({ url: str(), error: str() }),
    },

    // -- Simulator and logs -------------------------------------------------
    {
      methodName: 'quote-delivery-rate',
      displayName: 'Preview Delivery Fee',
      description:
        'Previews the delivery fee a customer would see at checkout for a destination, using the same rules as checkout, and returns each option\'s price, the road distance, or why no rate applies. Use when the user asks what delivery costs to an address or why an address gets no delivery option. Needs a destination with at least a country; a full street address is most accurate. A new address uses one monthly lookup.',
      activated: true,
      requestSchema: obj(
        {
          destination: address,
          subtotal: money('Order subtotal after discounts. Defaults to 0'),
          subtotalBeforeDiscount: money('Subtotal before discounts, or null'),
          weight: num('Total order weight, optional'),
          weightUnit: { type: 'string', enum: ['KG', 'LB'] },
          currency: str('ISO 4217 code; defaults to the site currency'),
          locationId: str('Price from this location only, optional'),
        },
        ['destination'],
      ),
      responseSchema: obj({ result: { type: 'string', enum: ['priced', 'fallback_rate', 'no_rate', 'address_error'] }, distanceKm: num(), options: { type: 'array' }, reason: str() }),
    },
    {
      methodName: 'list-recent-calculations',
      displayName: 'Recent Delivery Calculations',
      description:
        'Lists recent delivery fee calculations from checkout and the rate simulator, newest first, with status (priced, no_rate, fallback, error), reason, price, distance and destination country and postal prefix. Use when the user asks what customers were charged or whether checkout calculations are failing.',
      activated: true,
      requestSchema: obj({
        status: { type: 'string', enum: ['all', 'priced', 'no_rate', 'fallback', 'error'] },
        source: { type: 'string', enum: ['all', 'checkout', 'simulator'] },
        limit: num('1 to 25, default 10'),
      }),
      responseSchema: obj({ total: num(), calculations: { type: 'array' } }),
    },
  ],
});
