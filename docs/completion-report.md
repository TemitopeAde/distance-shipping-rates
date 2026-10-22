# Completion report

Date: 2026-10-15. Scope: `plan.md`, delivered in phases (engine/routing/plugin/data → billing/zones/logs → i18n/docs). Decisions agreed with the product owner: **shadcn/ui + Tailwind** for the dashboard, an **app-owned routing key**, and phased delivery.

## Implemented

**Checkout integration**
- Shipping Rates service plugin (`getShippingRates`), built on the contract verified in the installed typings.
- Road distance from Google Routes (default) or Geoapify behind a provider interface. Straight-line distance is never used.
- Graceful failure: fail-closed by default, opt-in fail-open flat rate with risk acknowledgement, never a zero-cost fallback.
- Documented Wix address errors are thrown only when the merchant opts in.

**Pricing engine**
- Exact bigint money math for 0/2/3/4-decimal currencies.
- Base fee + per-distance rate, included distance, graduated and volume tiers.
- Min/max fees, max distance, billing increments.
- Free delivery measured before or after discounts, handling fee, and weight / order-value surcharges.
- Rule precedence by option code and conflict detection.

**Zones and origins**
- Include/exclude zones by country, region and postal pattern (exact, prefix, numeric range), with per-zone max distance.
- Multiple locations with primary or nearest-by-road origin (up to 3 per request) and per-location service radius and countries.

**Reliability and data**
- Explicit time budget, jittered retries within the deadline, hashed privacy-preserving route cache, negative caching, and in-flight de-duplication.
- Monthly lookup allowance per plan, a kill switch, and an env-driven staged rollout.
- 9 Wix Data collections with tenant-scoped repositories, schema versions and a migration hook.

**Billing**
- Entitlements from `getAppInstance`; 8 lifecycle event handlers with de-duplication.
- Basic/Pro limits enforced server-side in both checkout and the API; cancellation keeps access until the end of the cycle.
- Merchant-chosen behavior when access ends; developer override via a secret allowlist; checkout URL via `billing.getUrl`.

**Dashboard and API**
- Dashboard with sidebar and 10 views: Overview (checklist, health, usage, plan, recent), Locations, Pricing rules (tabs, reorder, duplicate, inline activate), Delivery zones, Rate simulator (full breakdown), Checkout integration (instructions, diagnostics, test procedure, go-live/pause), Calculations & logs (filters, pagination), Billing, Settings, Help.
- Every view has loading, empty, error and offline states. All forms use Zod. Submit buttons show a spinner with an unchanged label and block duplicate submissions. Toasts use sonner.
- Authenticated API under `src/pages/api/**`.

**Internationalization**
- i18next with 20 locales: full English, plus partial and `needsReview`-flagged translations for navigation and common UI.
- RTL support, `Intl` formatting, and translated validation messages.

## Tests and checks run

| Check | Result |
| --- | --- |
| `npx vitest run` | **15 files, 184 tests passed** |
| `tsc --noEmit` | pass |
| `eslint .` | pass |
| `wix build` | pass (dashboard bundle includes compiled Tailwind CSS) |
| `wix preview` | created successfully (preview version `b176d646-…`) |
| Live checkout on a Wix site | **not run.** Requires a release, installation and shipping activation; see `docs/test-plan.md` |

## Remaining manual setup

1. `wix env set` for `ROUTING_API_KEY` (Google key with Geocoding API + Routes API), and optionally the other variables in `.env.example`.
2. Add the permission scopes in `docs/wix-permissions.md`.
3. Offer a free plan (Basic), create the Pro/Business paid plans in the App Dashboard and set `PLAN_PACKAGE_PRO/BUSINESS`. Configure an external pricing page if you want in-app upgrade buttons.
4. `wix release --version-type major` (first data collections and events), install on a Premium test site with the CMS, and wait up to 5 minutes for collections.
5. Enable the app as a carrier with a backup rate in the site's shipping settings, then run the manual checkout table in `docs/test-plan.md`.
6. Have native speakers review the 19 partial locales, and professionally translate billing and legal text.
7. Legal review of the routing provider's terms (caching of derived distances, attribution) and of the privacy text.

## Limitations and decisions to note

- **App Market review risk:** the dashboard uses shadcn/ui + Tailwind as requested. Wix's own guidance favors the Wix Design System / `@wix/patterns` for a native look.
- **No carrier-activation status API** was found. The dashboard shows instructions, a merchant confirmation, and evidence that checkout requests arrived.
- **Fulfillment origin:** Wix sends only the business address. Per-item stock location is not available, so the origin follows the merchant's strategy.
- **Weight:** treated as per-unit (assumption). Weight surcharges are skipped, and logged, when any item lacks weight.
- **Geographic zones** are country/region/postal only. Drawn polygons aren't supported.
- **Notifications:** preferences are stored, but no alerts are sent. No verified Wix notification channel was implemented.
- **Usage counter** is read-modify-write. Concurrent checkouts can undercount slightly; the cap is a cost guard, not billing.
- **Rate limiting** of dashboard endpoints is per-isolate (best effort). The monthly allowance is the hard limit.
- **Env for backend extensions** relies on `src/middleware.ts` publishing env before the injected `/_wix/extensions/*` routes. Confirmed by build inspection, not yet on a live checkout (test plan #1).

## SDK claims not verified against a live site

See `docs/sdk-verification.md` §7. In short: the plugin wall-clock timeout; weight semantics; Wix's checkout behavior for `[]` vs thrown errors; env propagation to extensions in production; `window.open` from the dashboard iframe; and provider caching terms.
