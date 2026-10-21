# Architecture

Distance-Based Shipping & Delivery is a Wix CLI app (Astro + React, Wix-hosted). It prices delivery from **road distance** and offers the result through Wix's **Shipping Rates service plugin**. It calculates rates only. It does not dispatch couriers or create shipments.

## Components

| Path | Role |
| --- | --- |
| `src/extensions/backend/service-plugins/distance-rates/` | Shipping Rates plugin: Wix → `getShippingRates` → quote → response |
| `src/extensions/backend/events/billing-*` | App-instance lifecycle events (install, remove, plan purchased/changed/cancelled/converted/reactivated/transferred) |
| `src/extensions/backend/data-collections/` | 9 app-owned Wix Data collections |
| `src/extensions/dashboard/pages/distance-shipping/` | Single dashboard page hosting the React app (sidebar + 10 views) |
| `src/pages/api/**` | Authenticated JSON API for the dashboard |
| `src/middleware.ts` | Publishes server env for separately bundled backend extensions |
| `src/lib/shipping/` | Pure pricing engine: money, units, rules, zones |
| `src/lib/routing/` | Provider abstraction (Google, Geoapify), retries, cache keys, in-flight de-duplication |
| `src/lib/quote/` | Quote pipeline (shared by checkout and simulator), runner (budget, logging), Wix adapter |
| `src/lib/billing/` | Plans, entitlement resolution, billing sync, usage, lifecycle |
| `src/lib/data/` | Storage port + Wix Data gateway + tenant-scoped repositories |
| `src/lib/api/` | API auth/validation plumbing and dashboard services |
| `src/lib/validation/` | Zod schemas shared by UI, API and backend |
| `src/lib/i18n/` | i18next setup and locale resources |
| `src/components/` | shadcn/ui primitives (`ui/`) and the dashboard app (`app/`) |

## Checkout data flow

```
Wix cart/checkout ──getShippingRates({request, metadata})──▶ service plugin
  │  instanceId ← metadata (tenant)       currency ← metadata
  ▼
runQuote (budget = CHECKOUT_BUDGET_MS, default 4000 ms)
  ├─ parallel reads (≤1200 ms): settings, locations, rules, zones, billing snapshot
  │     (billing refreshed from getAppInstance only if older than 1 h)
  ├─ computeQuote
  │    kill switch → currency → entitlement → shippable items → address completeness
  │    → zones (no provider call for excluded/outside destinations)
  │    → origins (primary, or ≤3 nearest candidates; plan location limit)
  │    → monthly lookup allowance (cache hits always allowed)
  │    → resolveRoutes: hashed cache → in-flight de-dup → geocode → route matrix
  │    → nearest reachable origin within its service radius
  │    → global/zone max distance → rule selection → engine
  ├─ best-effort writes (≤600 ms, parallel): calculation log, usage counter
  ▼
toWixMapping → { shippingRates: [...] } | [] | MissingPostalCode/InvalidAddress error
```

Sub-requests per checkout: ≤5 reads + ≤1 billing refresh + ≤2 cache ops + ≤4 provider calls (with one retry each) + 2 writes, about 14 in the worst case and 7–8 typically. The Wix CLI limit is 20 per request.

## Timeout budget

| Stage | Budget | Notes |
| --- | --- | --- |
| Whole quote | 4000 ms (configurable 1500–8000) | Wix's plugin wall-clock limit is not documented; see sdk-verification §1 |
| Config + billing reads | min(2000 ms, 40% of budget); simulator 5000 ms | Failure → `config_unavailable` (logged as TIMEOUT / AUTH / NETWORK) → empty list (never an error that could block checkout). A stale billing snapshot is refreshed within the same budget and saved in the background |
| Geocode attempt | 1500 ms | `AbortController`; retry only for TIMEOUT / 429 / 5xx / network |
| Matrix attempt | 1500 ms | same policy |
| Retry delay | full jitter, 0–150 ms × 2^(n−1) | no attempt starts unless it can finish before the deadline |
| Writes | 150–600 ms | `Promise.allSettled` + timeout; failures never affect the response |

## Cache strategy

- **Key:** `sha256(provider id, provider version, strictness, avoidTolls, avoidHighways, settingsVersion, canonical destination, sorted origins with 6-dp coordinates)`.
- **Value:** distance and duration per origin, plus geocode quality. **No** shopper address text or coordinates are stored.
- **TTL:** merchant-configurable (default 24 h, 0 disables). Negative results (`BAD_ADDRESS`, `LOW_CONFIDENCE`, `NO_ROUTE`) are cached for 10 minutes. Outages are never cached.
- **Invalidation:** any change to settings, locations or zones bumps `settingsVersion`, which changes every key. Moving a location also changes its coordinates in the key. Expired rows are purged when merchants open the logs.
- **De-duplication:** identical concurrent lookups in one isolate share one promise. Repeated Wix invocations (cart refreshes, checkout retries) hit the cache, so they cost no provider calls and no usage.

## Failure handling

| Situation | Behavior | Fallback eligible |
| --- | --- | --- |
| Rates switched off / rollout off | `[]` | no |
| No plan (`not_entitled`) | `[]`, or the fallback rate if *accessEndBehavior = fallback_rate* | yes (merchant choice) |
| No/partial address (cart estimate) | `[]`, no provider call | no |
| Incomplete/unknown/vague address | `[]`, or `InvalidAddressWixError` if *request_details* | no |
| Postal code required and missing | `MissingPostalCodeWixError` (opt-in) | no |
| Excluded / outside zones, beyond max distance, no route, no rule | `[]` | **never** |
| Provider timeout/429/5xx/auth, key missing, allowance used | `[]` (fail-closed, default) or flat fallback rate (fail-open, needs explicit risk acknowledgement) | yes |
| Wix Data unavailable | `[]` | no |
| Plugin crash / Wix timeout | Wix uses the merchant's **backup rate** from shipping settings (`fallbackDefinitionMandatory: true`) | platform-owned |

These invariants are enforced and tested. A fallback price must be greater than 0, and every returned price is a non-negative bigint formatted to the currency's minor units. No zero-cost option is returned unless a configured free-delivery threshold was met.

## Tenant boundaries

1. Wix Data collections are installed **per site**, so each merchant's data is physically separate.
2. Every row stores `instanceId`, and every repository query filters by it. By-ID reads, updates and deletes verify ownership first (`TenantError` → 404).
3. The instance ID comes only from the Wix auth context: plugin `metadata.instanceId`, event `metadata.instanceId`, or `auth.getTokenInfo().instanceId` for API routes. Request bodies are never trusted for this.
4. API routes accept only active Wix **users**. Visitors, members and app tokens are rejected before any handler runs.

## Data model (Wix Data, namespace `@admin14744/distance-shipping-rates`)

| Collection | `_id` | Key fields | Indexes | Retention |
| --- | --- | --- | --- | --- |
| `app-instances` | instanceId | installedAt, removedAt, lastSeenAt | — | lifetime |
| `merchant-settings` | instanceId | settingsVersion, payload (Zod-validated), schemaVersion | — | lifetime |
| `fulfillment-locations` | uuid | name, isPrimary, active, payload | instanceId | lifetime |
| `pricing-rules` | uuid | name, code, priority, active, payload | instanceId+priority | lifetime |
| `delivery-zones` | uuid | name, zoneType, active, payload | instanceId | lifetime |
| `route-cache` | sha256 key | payload (distances), expiresAt | expiresAt | TTL, purged opportunistically |
| `calculation-logs` | uuid | status, reason, providerError, latency, distance, price, destCountry, 3-char postal prefix, hashed requestRef | instanceId+createdAt, status+createdAt | merchant-set 1–90 days (capped by plan) |
| `billing-state` | instanceId | snapshot, usageMonth, usageCount, lastEventType/At | — | lifetime |
| `event-dedupe` | sha256 key | kind, processedAt | processedAt | lifetime (small) |

- **Uniqueness:** deterministic `_id` values (instance ID or content hash) make settings, billing, cache and dedupe rows unique without spending the single unique-index slot.
- **Versioning/migrations:** each payload row has `schemaVersion`. `migratePayload()` is the upgrade hook, and defaults fill fields added later. Schema changes to collections require a **major** app release.
- **Initialization:** the demo rule is seeded exactly once per instance. The `event-dedupe` claim plus `onboarding.demoRuleSeeded` guard it, and it runs on install and on first dashboard load.

## Billing & entitlements

- **Source of truth:** `getAppInstance()`. Lifecycle events only trigger a refresh, so duplicate or out-of-order events cannot corrupt state. Exact redeliveries are also skipped through `event-dedupe`.
- **Plans** (`src/lib/billing/plans.ts`, product-owner editable):

  | | Basic | Pro |
  | --- | --- | --- |
  | Locations | 1 | 25 |
  | Rules | 3 | 50 |
  | Advanced rules | no | yes |
  | Zones | no | yes |
  | Lookups/month | 1000 | 20000 |
  | Log history | 14 days | 90 days |

  Without a plan, the dashboard and simulator still work (25 lookups/month), but checkout rates are off.
- **Status:** trial (`freeTrialInfo.status = IN_PROGRESS`); cancelling (`autoRenewing = false`), which keeps access until the cycle ends; expired (yearly `expirationDate` passed, no renewal); unknown (no snapshot or one older than 7 days), which never grants checkout.
- **Downgrade:** rules using Pro features are **skipped**, never repriced. Existing zones keep being enforced, because ignoring an exclusion could deliver to excluded areas. Only the primary location is used.
- **Developer override:** the `ENTITLEMENT_OVERRIDE_INSTANCE_IDS` secret, an explicit server-side allowlist of instance IDs.

## Routing provider choice

Both providers satisfy the interface (`geocode` + one-to-many `matrix`), so each checkout costs at most 2 billable calls. Prices and free tiers are **intentionally not stated**: they change, and they were not verified. Check each provider's current pricing page before launch.

| | Google Maps Platform | Geoapify | Mapbox | OpenRouteService |
| --- | --- | --- | --- | --- |
| Coverage / accuracy | Global, strongest address coverage | Global, OSM-based | Global | Global, OSM-based |
| Geocode quality signal | `location_type`, `partial_match`, `types` | `rank.confidence`, `result_type` | relevance | confidence |
| Matrix API | Routes `computeRouteMatrix` | `/v1/routematrix` | Matrix API | `/v2/matrix` |
| Caching terms | Restrictive; confirm before raising TTL | Check terms | Restrictive for geocoding | Check terms |
| Implemented | **Yes (default)** | **Yes** | No | No |

**Default: Google.** It has the best global address resolution, which is what prevents vague or fabricated distances, and it exposes explicit match-quality fields. Geoapify is the drop-in alternative (`ROUTING_PROVIDER=geoapify`). Mapbox and OpenRouteService can be added by implementing `RoutingProvider`.

## Internationalization

There are 20 locales: en, es, pt, fr, de, it, nl, sv, pl, tr, ru, uk, ar, he, ja, ko, zh-CN, zh-TW, hi, id. Together they cover the major Wix and e-commerce merchant markets in the Americas, Europe, the Middle East (including RTL) and Asia. English is the source and fallback. Other locales currently translate navigation and common UI only, and are flagged `needsReview`. Billing, legal and policy text stays English until professionally translated. RTL (`ar`, `he`) is handled with `dir` on `<html>` and logical CSS properties. Numbers, currency, distance and dates use `Intl`. Validation messages are i18n keys.

## Security & privacy

- Routing keys are Wix server secrets, read only in backend code and never sent to the browser or logged. Provider error messages exclude keys and addresses (tested).
- Logs keep no names, emails, phone numbers, street lines or coordinates: only country, a 3-character postal prefix, the price and diagnostics. Wix's `requestId` is stored as a 16-hex sha256 prefix.
- API: Zod validation, 32 KB body limit, uniform error JSON, no stack traces, per-instance rate limits on provider-costing endpoints (best effort, per isolate) plus the monthly allowance (hard cap).
- Plugin authenticity is enforced by the Wix runtime before our handler runs. `setupServicePlugin` calls `client.servicePlugins.parseJWT(payload)` on the Wix-signed request (`node_modules/@wix/astro/build/dependencies/astro-backend-extensions/backend-runtime/runtime/setupServicePlugin.mjs`). Webhooks go through the equivalent `setupWebhook`.
- Retention: logs are purged by merchant setting (capped by plan) and cache rows by TTL. Uninstall leaves data on the site's CMS collections according to Wix's collection lifecycle.

## Rollout & rollback

- **Staged:** `ROLLOUT_MODE=allowlist` with `ROLLOUT_ALLOWLIST` (sandbox sites → beta) → `all`.
- **Emergency:** `ROLLOUT_MODE=off` returns `[]` app-wide. Customers then see the merchant's other shipping options, and Wix uses the backup rate if the plugin fails.
- **Per merchant:** the "Switch off distance-based rates" control (`pluginEnabled`).
- **Code rollback:** release the previous version (`wix release`) from the App Dashboard version history.
