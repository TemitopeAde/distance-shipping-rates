# Test plan

## Automated (run with `npm test`)

| Area | File | Covers |
| --- | --- | --- |
| Money/currency | `src/lib/shipping/money.test.ts` | exact decimal parsing, 0/2/3/4-decimal currencies, half-up rounding, no negatives, Intl display |
| Pricing engine | `src/lib/shipping/engine.test.ts` | $5 + 10 mi × $2 = $25, km, included distance, zero distance, rounding increments, sub-cent rates, JPY, min/max, graduated & volume tiers, free delivery (before/after discount, handling waiver), surcharges incl. missing weight, conditions, precedence, determinism, conflict detection |
| Eligibility | `src/lib/shipping/eligibility.test.ts` | postal exact/prefix/range, subdivisions, include/exclude precedence, inactive zones, distance limits, candidate origins |
| Routing | `src/lib/routing/routing.test.ts` | Google/Geoapify parsing, geocode quality, statuses → error kinds, 429 vs quota, 5xx, key never in errors, retry/jitter/timeout/deadline, cache hit/miss, no PII in cache, in-flight de-dup of parallel requests, negative caching, no caching of outages, key invalidation, TTL 0 |
| Pipeline | `src/lib/quote/pipeline.test.ts` | happy path, rapid repeat invocations (cache), address changes, nearest origin, discounts, kill switch, incomplete address (no provider call), request details, postal requirement, exclusions, max distance, service radius, no fallback for address problems, demo rules ignored, fail-closed/fail-open, zero fallback refused, missing key, monthly allowance with cache hits, entitlement gates, Basic limits |
| Runner | `src/lib/quote/runner.test.ts` | privacy-safe logs, usage counting excludes cache hits, Wix Data outage → `[]`, hanging reads within budget, provider outage within budget, rollout gate, log write failure |
| Wix contract | `src/lib/quote/wix-adapter.test.ts`, `tests/service-plugin.test.ts` | request mapping (streetAddress, totals, weights, shippable), response shape (string prices, handling charge, JPY), `[]` for no-rate, MISSING_POSTAL_CODE / PARTIAL_ADDRESS errors, real handler module end-to-end with fail-closed and fail-open |
| Billing | `src/lib/billing/entitlements.test.ts`, `lifecycle.test.ts` | trial, active, cancelling (access until end), expired, free, unknown/stale, override allowlist, plan gates, duplicate & out-of-order events, install seeding once, uninstall |
| Tenancy/auth | `src/lib/data/repositories.test.ts`, `src/lib/api/http.test.ts`, `src/lib/api/services.test.ts` | cross-instance list/get/update/delete blocked, settings/cache isolation, token-only tenant, visitors/members/apps rejected, body limits, Zod errors, no stack traces, rate limiting, plan limits, go-live gates, settings cannot bypass go-live |
| Dashboard | `src/components/app/ui.test.tsx` | Zod validation with translated messages and no native validation, single submission under double submit, spinner with unchanged label, offline notice, error state + retry, RTL + Arabic navigation |
| i18n | `src/lib/i18n/i18n.test.ts` | every UI key exists, every backend enum has a message, all 20 locales present and flagged, fallback, RTL, locale matching |

## Manual checkout scenarios (Wix test site)

Prerequisites: a Premium test site with Wix Stores, the app installed from a release, the app enabled for the Domestic region with a backup rate of e.g. $15, one validated location, one active rule (base 5 + 2/mi), and Wix test payments.

| # | Scenario | Steps | Expected | Verify in |
| --- | --- | --- | --- | --- |
| 1 | **Env reaches plugin** | Add item, enter a full address | Option appears, priced | Logs: `priced`, `providerError` empty. If `NOT_CONFIGURED` appears, the middleware env assumption failed (see sdk-verification §5) |
| 2 | Price matches simulator | Same address in simulator and checkout | Same price and option name | Simulator vs checkout |
| 3 | Cart before address | View the cart with only a country selected | No distance option, no error | Logs: `address_incomplete`, 0 lookups |
| 4 | Address change | Change the street in checkout | Price updates | Two log rows, second with new distance |
| 5 | Rapid cart changes | Change quantity 5× quickly | Price stable; ≤2 lookups total | Logs: `cached` on repeats |
| 6 | Discount | Apply a coupon so the subtotal crosses the free-delivery threshold (before/after basis) | Matches the configured basis | Option price 0 only when the threshold is met |
| 7 | Out of zone | Address in an excluded postal code | No distance option | Logs: `excluded_zone` |
| 8 | Too far | Address beyond max distance | No option | `beyond_max_distance` |
| 9 | **Provider offline, fail-closed** | `wix env set ROUTING_API_KEY=invalid`, release, checkout | **Observe** what Wix shows (expected: other options or none; record it) | Logs: `routing_unavailable`, `AUTH` |
| 10 | **Provider offline, fail-open** | Settings → fallback $12 + acknowledge, repeat #9 | "Fallback" option at $12 | Logs: `fallback` |
| 11 | Plugin error path | Temporarily set `CHECKOUT_BUDGET_MS=1500` and a slow network or a bad key with the request-details setting | **Observe** whether Wix applies the backup rate and whether checkout is blocked | Wix checkout + logs |
| 12 | Postal required | Enable "Require a postal code", omit it | Wix prompts for a postal code (record the actual UX) | — |
| 13 | Plan ends | Cancel the plan → after the cycle ends, checkout | Per "If my plan ends" setting | Logs: `not_entitled` |
| 14 | Trial | Install a fresh site with trial | Billing shows "Free trial"; rates work | Billing page |
| 15 | Multi-store | Pro, 2 locations, nearest strategy | Origin = nearest by road | Simulator "From" + logs `originLocationId` |
| 16 | Checkout retry | Fail a test payment, retry | No duplicate charges or lookups | Logs show cache hits |
| 17 | Kill switch | `ROLLOUT_MODE=off`, release | No option, overview banner | Logs: `rollout_disabled` |
| 18 | Weight surcharge | Product with weight, surcharge >1 kg | Surcharge applied; record whether weight is per unit | Simulator vs checkout; confirms the weight assumption |
| 19 | RTL | Switch the dashboard to العربية | Mirrored layout, Arabic nav | Visual |
| 20 | Offline | Disable the network in devtools | Bottom offline notice | Visual |

Record the observed results for #9, #11, #12 and #18 in `docs/sdk-verification.md` §7. Those behaviors are platform-owned and were not assumed.

## Beta & rollback plan

1. **Sandbox:** 2–3 internal test sites. Set `ROLLOUT_MODE=allowlist` with only their instance IDs, and add them to `ENTITLEMENT_OVERRIDE_INSTANCE_IDS`. Run the full manual table.
2. **Limited beta:** add 5–20 opted-in merchants to `ROLLOUT_ALLOWLIST`. Watch per-merchant Overview health and the Google Cloud quota dashboard for 2 weeks. Exit criteria: no checkout blocked by the app, failure rate under 1%, price disputes at 0.
3. **General availability:** `ROLLOUT_MODE=all`, then submit to the App Market.
4. **Rollback levels:** (a) a merchant can switch off rates on the Checkout integration page; (b) the app owner sets `ROLLOUT_MODE=off` with `wix env set` and releases; (c) re-release the previous app version. In every case Wix falls back to the merchant's other shipping options and backup rate.
