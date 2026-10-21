# SDK & platform verification

How each Wix integration in this app was verified, with sources. Sources are listed in priority order:
**installed typings** (exactly what the code compiles against) → **Wix MCP docs** (read during implementation, Oct 2026) → **Wix skill references** shipped in `.claude/skills/wix-app`.

Anything marked **Assumption** has not been confirmed against a live Wix site and is listed in the manual test plan.

Environment at verification time: `@wix/cli` 1.1.263, `@wix/astro` 2.x, `@wix/ecom` 1.0.2567, `@wix/data` 1.0.527, `@wix/app-management` 1.0.170, `@wix/essentials` 0.1.x, Astro 5.18.

---

## 1. Shipping Rates service plugin

| Item | Verified value | Evidence |
| --- | --- | --- |
| Import | `import { shippingRates } from '@wix/ecom/service-plugins'` → `shippingRates.provideHandlers({ getShippingRates })` | `node_modules/@wix/ecom/build/cjs/service-plugins.d.ts`; [docs: introduction](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/introduction) |
| Handler signature | `getShippingRates(payload: { request: GetShippingRatesRequest; metadata: Context }): GetShippingRatesResponse \| Promise<…>` | `@wix/auto_sdk_ecom_shipping-rates/build/cjs/service-plugins-error-classes-*.d.ts` (`GetShippingRatesEnvelope`) |
| Request fields used | `lineItems[].quantity, price, totalPrice, priceBeforeDiscount, totalPriceBeforeDiscount, physicalProperties.weight/shippable`; `shippingDestination.{addressLine1 \| addressLine \| streetAddress.number/name, addressLine2, city, subdivision, postalCode, country}`; `weightUnit` (`KG`/`LB`) | same typings; [Get Shipping Rates schema](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/get-shipping-rates?apiView=SDK) |
| Metadata used | `instanceId` (tenant), `currency` (ISO 4217), `requestId` (hashed for logs) | `Context` interface |
| Response | `{ shippingRates: [{ code, title, logistics: { deliveryTime?, instructions?, pickupDetails? }, cost: { price: string, currency, additionalCharges: [{ type: 'HANDLING_FEE', price, details }] } }] }` | `ShippingOption`, `ShippingPrice`, `AdditionalCharge`, `ChargeType` |
| Price format | Decimal **string**, must match the currency's decimals; `currency` must equal `metadata.currency` | doc comment on `ShippingPrice.price` / `.currency` |
| Errors | `MissingPostalCodeWixError`, `InvalidPostalCodeWixError`, `InvalidAddressWixError({ fields: FieldViolation[] })`, `GenericShippingRatesWixError` — docs warn errors "may block the site visitor from proceeding to checkout" | error classes in typings; method schema "Possible Errors" |
| Restriction | Do **not** call Estimate Cart Totals / Get Checkout from the handler | method description |
| CLI extension builder | `extensions.ecomShippingRates({ id, name, description, fallbackDefinitionMandatory, source, learnMoreUrl?, dashboardUrl?, thumbnailUrl? })`; plugin type is **singular** per app | `@wix/astro/builders` typings; `wix-app` skill `SERVICE_PLUGIN.md` |
| Activation | Not automatic. Merchant enables the app per region in **Settings → Shipping, delivery & fulfillment → Manage your apps**, and must set a **backup rate** that Wix uses when the plugin errors or times out | skill `service-plugin/SHIPPING-RATES.md` (marked "confirmed live" by Wix); docs intro ("enable a shipping rule in the dashboard") |
| Placement / status API | **None found.** No API was found that lets an app read whether it is enabled as a carrier. The dashboard shows instructions plus *evidence* (checkout requests received), never a fabricated status. | search of SDK/REST docs; the Add Delivery Carrier API exists for site-level scripting but is not used here |

**Discrepancy noted:** the published doc schema lists `shippingDestination.location { latitude, longitude }`; the installed typings' `Address` has **no** `location` field. The code follows the typings and always geocodes the destination.

**Assumptions (to confirm in the test plan):**
- `physicalProperties.weight` is **per unit** (we multiply by `quantity`). The field is documented only as "Line item weight".
- When the handler returns `{ shippingRates: [] }`, Wix simply shows no option from this carrier (no error). Documented behavior is implied, not stated.
- The **execution time limit** for shipping-rate plugin calls is not documented. CLI backend extension limits *are* documented: **1000 CPU-ms per request, 20 sub-requests per request, 1000 requests/second per app** ([About Wix CLI Backend Extensions](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-the-cli/supported-extensions/backend/about-wix-cli-backend-extensions)). The app uses a 4000 ms wall-clock budget (configurable 1.5–8 s, `CHECKOUT_BUDGET_MS`) and at most ~11 sub-requests.

## 2. Wix Data

| Item | Verified value | Evidence |
| --- | --- | --- |
| Item API | `items.get / query().eq().lt().ascending().descending().limit().skip().find({ returnTotalCount }) / save / remove / bulkRemove` from `@wix/data` | `@wix/wix-data-items-sdk` typings (`data-v2-data-item-items.context.d.ts`, `.universal.d.ts`); skill `data-collection/WIX_DATA.md` |
| Elevation | `auth.elevate(items.x)` from `@wix/essentials`, backend only | `@wix/essentials/build/auth.d.ts`; skill |
| Collection extension | `extensions.dataCollections({ collections: [ { idSuffix, displayName, displayField, fields, dataPermissions, indexes, initialData } ] })`; generated by `wix generate` | `src/extensions/backend/data-collections/*` (CLI generated) |
| Collection IDs | `<app namespace>/<idSuffix>`, namespace `@admin14744/distance-shipping-rates` (from `wix.config.json`) | skill `DATA_COLLECTION.md`, `APP_IDENTIFIERS.md` |
| OBJECT fields | require `objectOptions: { fields: [] }` | skill `data-collection/SCHEMA.md` |
| Index limits | 3 regular + 1 unique (4 total), no `name` key | skill `SCHEMA.md` |
| Permissions | `PRIVILEGED` for all operations (app-private; accessed only via elevated backend) | skill `PERMISSIONS.md` |
| Lifecycle | Collections are created **only when the app is installed/updated** with a version containing the extension; changes need a **major** release; the site needs the CMS app; propagation up to 5 min | skill `data-collection/LIFECYCLE.md` |
| Tenancy | Collections live on each merchant's site, so data is already per-site. Rows also carry `instanceId` and every repository call filters/verifies it (defense in depth). | design decision |

## 3. App instance, billing and lifecycle

| Item | Verified value | Evidence |
| --- | --- | --- |
| Read billing | `appInstances.getAppInstance()` (elevated) → `instance.{ isFree, billing: { packageName, billingCycle, timeStamp, expirationDate (yearly+ only), autoRenewing, freeTrialInfo: { status: IN_PROGRESS \| ENDED \| NOT_AVAILABLE, endDate } }, freeTrialAvailable }` | `@wix/auto_sdk_app-management_app-instances` typings; [Get App Instance](https://dev.wix.com/docs/api-reference/app-management/app-instance/get-app-instance?apiView=SDK) |
| Events | `onAppInstanceInstalled` (AppInstalled), `onAppInstanceRemoved`, `onAppInstancePaidPlanPurchased`, `onAppInstancePaidPlanChanged`, `onAppInstancePaidPlanAutoRenewalCancelled` ("can continue to use your app until the end of the current billing cycle"), `onAppInstancePlanConvertedToPaid` (trial ended + charged), `onAppInstancePlanReactivated`, `onAppInstancePlanTransferred` | typings (`index.d.ts`), event docs e.g. [Paid Plan Auto Renewal Cancelled](https://dev.wix.com/docs/api-reference/app-management/app-instance/paid-plan-auto-renewal-cancelled?apiView=SDK) |
| Event payload | `{ data, metadata: { instanceId, eventType, identity, accountInfo } }`; **no event ID** is provided | `BaseEventMetadata` in typings |
| Checkout URL | `billing.getUrl(productId, { billingCycle, successUrl?, testCheckout?, ... })` → `{ checkoutUrl }`. **Only works when an external pricing page is configured** in the App Dashboard; URL valid 48 h | [Get Url](https://dev.wix.com/docs/api-reference/app-management/app-billing/billing/get-url?apiView=SDK) |
| Scope | `SCOPE.DC.MANAGE-YOUR-APP` (Manage Your App) for all of the above; events also list `SCOPE.DEV_CENTER.APP-INSTANCE-READ-BASIC-INFO` | typings `@permissionScopeId` tags |

**Trial semantics:** Wix manages trials per app instance (`freeTrialAvailable`, `freeTrialInfo`). The app never tracks its own trial identity; "one trial per instance" is Wix's responsibility.

## 4. Dashboard ↔ backend auth

| Item | Verified value | Evidence |
| --- | --- | --- |
| Client call | `httpClient.fetchWithAuth(url, init)` from `@wix/essentials`; URL built from `import.meta.url` | `@wix/essentials/build/http-client.d.ts`; skill `BACKEND_API.md` |
| Server identity | `auth.getTokenInfo()` → `{ active, subjectType: 'APP' \| 'USER' \| 'MEMBER' \| 'VISITOR' \| 'UNKNOWN', subjectId, instanceId?, siteId }` | `@wix/essentials/build/auth.d.ts` |
| Policy | API routes accept only `active && subjectType === 'USER' && instanceId`; tenant = token `instanceId` | `src/lib/api/http.ts` |

## 5. Environment variables / secrets

| Item | Verified value | Evidence |
| --- | --- | --- |
| Secrets | `wix env set --key=… --value=…`, stored on Wix servers; `wix env pull` for local dev; declared with `envField` in `astro.config.mjs`; read via `astro:env/server` | [Manage Environment Variables](https://dev.wix.com/docs/build-apps/develop-your-app/develop-an-app-with-the-cli/project-development/environment-variables/manage-environment-variables-in-the-cli) |
| Backend-extension caveat | `astro:env/server` **cannot be imported** from service plugins/webhooks: the Wix CLI bundles them in a separate Vite build (`wix build` failed with "Rollup failed to resolve import astro:env/server"). Workaround: `src/middleware.ts` (main Astro bundle) publishes the env to a global before each request; extension requests are served through Astro routes `/_wix/extensions/service-plugins/...` and `/_wix/extensions/webhooks/...`, so the middleware runs first. | `node_modules/@wix/astro/build/integration/index.mjs` (`getViteConfig$3`, injected routes); `src/lib/wix/runtime-env.ts` |

**Assumption:** the middleware runs before injected extension routes on Wix hosting. If a deployed plugin logs `routing_unavailable / NOT_CONFIGURED` while the key is set, this assumption failed — see `docs/test-plan.md` §1.

## 6. Routing providers (external)

| Provider | Endpoints used | Evidence |
| --- | --- | --- |
| Google Maps Platform (default) | Geocoding `GET https://maps.googleapis.com/maps/api/geocode/json` (`status`, `results[].geometry.location`, `location_type`, `partial_match`, `types`); Routes `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix` with `X-Goog-Api-Key` and `X-Goog-FieldMask: originIndex,destinationIndex,status,condition,distanceMeters,duration` | [computeRouteMatrix guide](https://developers.google.com/maps/documentation/routes/compute_route_matrix); Geocoding statuses per Google docs |
| Geoapify (alternative) | `GET https://api.geoapify.com/v1/geocode/search?text&filter=countrycode:xx&format=json` (`results[].lat/lon/rank.confidence/result_type`); `POST https://api.geoapify.com/v1/routematrix` (`sources_to_targets[i][j].distance/time`) | [forward geocoding](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/), [route matrix](https://apidocs.geoapify.com/docs/route-matrix/) |

| Geoapify Address Autocomplete (dashboard only) | `GET https://api.geoapify.com/v1/geocode/autocomplete?text&filter=countrycode:xx&lang&format=json&limit` → `results[].formatted, address_line1, housenumber, street, city, state_code, postcode, country_code, result_type` | live call with the project key, Oct 2026 (response fields confirmed) |

Not verified: provider pricing, free tiers, and the exact caching clauses of each provider's terms (Google's service-specific terms page could not be retrieved in full). See `docs/architecture.md#routing-provider-choice`.

## 7. Claims that could not be verified

1. Shipping-rates plugin wall-clock timeout (designed for ≤ 4 s budget).
2. Whether `physicalProperties.weight` is per unit or per line.
3. Exact Wix checkout behavior for an empty `shippingRates` list vs. a thrown error (test plan §3).
4. Middleware-published env reaching backend extensions in production (test plan §1).
5. Whether Wix dashboard iframes allow `window.open` for the billing checkout URL in all browsers.
6. Google/Geoapify caching terms for derived distances (the app caches only distances under a hashed key, default 24 h; confirm with legal).
