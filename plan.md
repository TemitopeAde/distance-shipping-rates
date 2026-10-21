# Codex Build Specification â€” Distance-Based Shipping & Delivery for Wix

## Role and objective
Act as a senior Wix CLI, Wix eCommerce, Astro, TypeScript, and SaaS engineer. Build a complete, production-ready Wix App Market application named **Distance-Based Shipping & Delivery**. Do not stop at scaffolding, mock screens, or a proof of concept. Implement, test, and document all feasible features. Explicitly report platform limitations and any capabilities that cannot be verified or completed.

The app calculates shipping fees from **actual road-route distance** between merchant fulfillment locations and a shopper's delivery destination. Merchants configure base charges, per-mile/per-kilometer rates, delivery limits, zones, thresholds, surcharges, and fallback behavior. The app supplies eligible shipping options to Wix cart/checkout via the supported Wix Shipping Rates service plugin. This is **shipping-rate calculation only**, not courier dispatch or fulfillment.

## Mandatory documentation and capability verification
Before writing integration code:
1. Inspect the repository, installed Wix CLI version, Wix SDK packages, existing conventions, and relevant Wix skills.
2. Use available **Wix MCP tools** to verify every relevant API, service plugin, SDK, permissions scope, billing API, app-instance lifecycle event, editor placement/status API, and Wix Data operation. Do not invent SDK names, types, events, fields, or permissions.
3. Read the current official documentation. Wix docs can often be accessed by appending `.md` to `https://dev.wix.com/docs/...`; consult `https://dev.wix.com/docs/llms.txt` where useful.
4. Verify the precise Shipping Rates service plugin registration/handler contract, input address fields, output rate structure, delivery constraints, error semantics, invocation conditions, supported checkout surfaces, time limits, and caching behavior. The illustrative code in discussions is **not** a verified API contract.
5. Verify whether the plugin can be installed/activated automatically, how merchants can configure it in Wix shipping settings, and whether any editor widget/plugin placement or status check is actually supported. Never misrepresent shipping plugin activation as a site-widget placement.
6. Verify Wix billing subscription/free-trial fields and lifecycle webhooks/events. Verify Wix Data SDK methods, collection permissions, and app namespace behavior.
7. Maintain `docs/sdk-verification.md` with official source URLs, verified SDK signatures, permissions, constraints, and alternatives. If MCP tools are unavailable, state this clearly, inspect installed typings and official docs, and label remaining assumptions. Do not claim verification without evidence.

## Technology stack and conventions
- Wix CLI app with TypeScript, using the repository's verified framework setup.
- Astro for the dashboard/application shell if supported by the actual Wix CLI project setup; do not force unsupported integration patterns.
- shadcn/ui throughout the dashboard, with Tailwind CSS, lucide-react icons, and sonner toasts. Modern, polished, responsive sidebar + main-content layout.
- Astro API routes under `src/pages/api/**` (or repository-equivalent `pages/api` if configured). Use `fetchWithAuth` from authenticated client code where supported and appropriate. Do not route Wix service-plugin calls through a client-only authenticated API.
- Zod for all form and API input validation. Do not rely on native browser validation messages.
- Wix Data for merchant configuration, rate rules, cache metadata, calculation logs, subscription snapshots, and idempotency records. No PostgreSQL, Prisma, Drizzle, Redis, or QStash.
- Prefer native Wix app lifecycle events and supported backend triggers. Do not assume Wix provides a background worker or scheduler.
- All secrets and routing provider keys server-side only; never expose keys to the browser or Wix editor widget settings.
- Preserve existing project files and patterns unless a change is required. Do not introduce unnecessary infrastructure.

## Core shipping calculation
Support:
- Merchant origin address and validated geocoordinates.
- Multiple fulfillment locations; choose origin by verified cart/product fulfillment data where available, otherwise documented merchant rules. Never silently infer stock location.
- Actual driving distance from an external routing API (not straight-line Haversine distance for billable rates).
- Miles and kilometers with correct conversions, rounding, and locale-aware presentation.
- Flat base fee + per-distance rate, optional included-distance allowance, minimum fee, maximum fee, maximum delivery distance, and tiered brackets.
- Delivery zones (postal code, region, country, or defined geographic zones where verifiable), exclusion areas, service availability, and delivery eligibility.
- Free delivery over a configurable merchandise subtotal, with clearly defined before/after-discount and tax treatment.
- Optional handling charges, weight/order-value surcharges, and product/category-based rules only when the checkout payload provides trustworthy data; otherwise document limitations.
- Multiple rate profiles, descriptive shipping method names, configurable currency handling, and accurate minor-unit arithmetic. Never assume every currency has two decimal places.
- Rule precedence, conflicting rule detection, and predictable output ordering.
- A merchant preview calculator for origin/destination, estimated road distance, pricing rule, total fee, and eligibility, with clear labeling that preview is not a guaranteed checkout quote.

Build a pure, deterministic pricing engine independent of SDK handlers, with thorough unit tests. Example: base $5 + 10 miles Ã— $2/mile = $25, before any additional rules.

## Routing API integration
Implement a provider abstraction, with an initial provider selected only after researching current official documentation, supported geographies, routing accuracy, rate limits, quotas, pricing, and commercial terms. Compare Geoapify, Google Maps Routes API, Mapbox, and OpenRouteService. Avoid hardcoded claims about free tiers or prices.

Requirements:
- Server-side route lookup and geocoding when necessary.
- Coordinate/address normalization and validation; handle ambiguous, incomplete, unsupported, or unrouteable addresses.
- Separate API timeout shorter than the verified Wix service-plugin execution limit.
- Bounded retry policy with jitter for safe retryable errors, while keeping within the checkout deadline.
- Route caching keyed by normalized origin, destination, transport profile, provider/version, and relevant route settings; configurable TTL and privacy-aware precision.
- Avoid stale cache when locations or routing settings change.
- Quota and cost controls; do not expose provider credentials in logs.
- No fabricated distances. Never substitute straight-line distance as though it were road distance.
- Document privacy, provider data-processing terms, and retention policy for shopper addresses.

## Checkout reliability and failure behavior â€” critical
Checkout must be resilient, but **never promise that Wix checkout cannot fail**. Implement and test:
- Explicit timeout budgets for all provider, data, and plugin operations.
- Graceful failure on routing outage, missing address, unsupported destination, invalid merchant configuration, quota exhaustion, and transient Wix errors.
- Merchant-selectable fail-open flat fallback rate **only if supported by the verified Wix plugin contract**, with a clear risk warning for undercharging.
- Merchant-selectable fail-closed behavior (no custom rate offered) when delivery cannot be priced; never offer a misleading zero-cost delivery option.
- Distinguish unavailable shipping from plugin exceptions and platform-owned checkout behavior.
- Safe, nonnegative, finite prices and valid currency values.
- Rate request deduplication/idempotency for repeated Wix invocations, using safe request fingerprints where feasible.
- Structured logs, anonymized request IDs, latency, cache hit/miss, routing provider error classification, and fallback reason.
- Test cases for rapid cart changes, repeated invocations, address changes, parallel requests, multiple stores, discounts, and checkout retry behavior.
- A feature-flagged rollout strategy with sandbox test sites, limited beta, and rollback/disable controls.
- Merchant-facing health/status indicator and a recent-calculations troubleshooting view without exposing customer PII.

## Dashboard pages
Build an accessible, responsive dashboard with sidebar navigation:
1. **Overview**: onboarding checklist, setup completion, plugin activation/configuration status when verifiable, health, recent calculations, API usage, subscription state, and quick actions.
2. **Locations**: add/edit/validate fulfillment origins; primary location; location eligibility rules.
3. **Pricing Rules**: create/edit/duplicate/delete rules; base fees, per-mile/km rates, tiered brackets, minimum/maximum, thresholds, and surcharges; drag ordering if appropriate.
4. **Delivery Zones**: supported service regions, postal rules, exclusions, maximum distance.
5. **Rate Simulator**: origin/destination lookup, map/route summary if provider licensing allows, detailed fee breakdown, error and fallback scenarios.
6. **Checkout Integration**: exact setup instructions, current activation status only if detectable, diagnostic checks, and safe test procedure. Do not fabricate a placement-status API.
7. **Calculations & Logs**: filterable, paginated, privacy-safe diagnostics with failure and fallback reasons.
8. **Billing**: Basic/Pro plans, free trial, subscription status, upgrade/resubscribe, cancellation and expired trial handling.
9. **Settings**: unit system, routing provider configuration, cache policy, fallback mode, language, privacy, notification preferences.
10. **Help**: onboarding guide, troubleshooting, documentation, support links.

Use shadcn/ui components for cards, dialogs, sheets, forms, tables, tabs, accordions, and navigation; lucide-react for icons and sonner for success/error toasts. Provide loading, empty, offline, and error states. Display an unobtrusive offline notice at the bottom of the screen when disconnected. Keep submit button labels unchanged during requests and show a spinner inside the button. Prevent duplicate submissions.

## Merchant onboarding
- Detect install context and required capabilities without assuming activation.
- Show a step-by-step checklist: configure location, choose units, set rate rules, select routing provider/credentials where needed, configure fallback, activate shipping integration in Wix where required, simulate rates, test checkout, go live.
- Explain differences between physical delivery, local pickup, and shipping rates.
- Surface permission/installation/setup errors with actionable remediation.
- Add one **safe initial sample pricing rule** to Wix Data only once per app instance, explicitly marked as inactive/demo until merchant configures it. Never enable shipping rates with an arbitrary sample price.

## App Market billing and access control
Implement Wix App Market plans with server-side entitlement enforcement and verified lifecycle handling. Suggested commercial model (editable configuration, not assumed Wix billing API values):
- **Basic**: one origin, simple base + distance pricing, monthly usage cap configurable by product owner, standard logs.
- **Pro**: multiple locations, advanced rules, zones, simulator, richer logs, larger or unlimited app-side usage allowance subject to routing provider costs.
- Free trial if supported by configured Wix pricing plans. Enforce one trial per eligible app instance according to verified Wix billing semantics; never invent a global user trial identity.
- Handle installation, upgrade, downgrade, trial started/ended, subscription cancellation, expiration, resubscription, uninstall, and duplicate/out-of-order events.
- Distinguish cancellation effective date from immediate entitlement loss.
- Enforce subscription checks in backend calculations and dashboard API; clearly document the merchant's chosen behavior when access ends so shipping is not unexpectedly mispriced.
- Keep an idempotent app-instance/subscription state record in Wix Data.
- Provide a developer/testing entitlement override only through an explicitly secure, documented mechanism, not an unchecked email suffix.

## Internationalization
Implement i18n for the dashboard and all merchant-facing UI. Cover the top 20 target languages as configurable locale resources (propose the list and justify it), with English fallback. No hardcoded UI strings. Support RTL locales, translated validation/error messages, pluralization, localized number/currency/unit formatting, and language switching. Do not machine-translate critical legal or billing terms without review.

## Wix Data model
Design collections with app-instance scoping and access control, e.g.:
- `AppInstances`
- `MerchantSettings`
- `FulfillmentLocations`
- `PricingRules`
- `DeliveryZones`
- `RouteCache`
- `CalculationLogs`
- `BillingState`
- `EventDedupe`

Define schemas, indexes where supported, uniqueness strategy, retention policies, migrations, versioned settings, and safe initialization. Ensure tenant isolation and never trust instance IDs supplied by the browser without validating Wix authentication context.

## API and backend design
Implement authenticated API routes for dashboard CRUD, simulation, logs, onboarding, settings, and billing views. Apply Zod validation, authorization, tenant isolation, request size limits, consistent error responses, and pagination. Use `fetchWithAuth` for supported frontend-to-backend calls. Keep routing calls, service plugin logic, credentials, and entitlement checks server-side.

Organize modules into:
- `lib/wix/` SDK adapters and context
- `lib/shipping/` deterministic pricing and eligibility
- `lib/routing/` provider abstraction, geocoding, caching
- `lib/billing/` entitlement state
- `lib/data/` Wix Data repositories
- `lib/validation/` Zod schemas
- `lib/i18n/` locale resources
- `components/` dashboard UI
- `pages/api/` Astro endpoints
- `service-plugins/` or the Wix CLI-verified service-plugin location

Adapt paths to the actual repository and Wix CLI conventions after inspection.

## Security and compliance
- Never expose API keys, merchant credentials, addresses, or internal stack traces.
- Encrypt/store credentials using supported secret management; verify how merchant-specific secrets are safely managed.
- Scope all queries by validated app instance/tenant; use least-privilege permissions.
- Minimize stored delivery addresses; redact PII from logs; configurable retention/deletion.
- Protect API endpoints against unauthorized access, injection, abusive traffic, and repeated provider calls.
- Validate callback/webhook authenticity according to current Wix docs, where applicable.
- Document provider licensing and data protection considerations.

## Testing and acceptance criteria
Use the repository's established test tooling (or add a lightweight compatible test setup). Implement:
- Unit tests for pricing tiers, unit conversion, rounding, zero/negative values, currency handling, eligibility, free-delivery rules, and rule precedence.
- Integration tests for provider success, timeout, invalid route, 429, 5xx, quota exceeded, caching, and fallback.
- Contract tests based on verified Wix shipping plugin payloads and outputs.
- Entitlement/lifecycle tests for trials, cancellation, renewal, duplicates, and expired subscriptions.
- Tenant-isolation and authorization tests.
- Dashboard form validation, loading, offline, error, and i18n tests.
- End-to-end merchant setup and Wix test checkout walkthrough, with a manual checklist for scenarios that cannot be automated.
- Test checkout when provider is offline; verify the observed behavior rather than assuming a fallback is accepted by Wix.

Acceptance criteria:
1. Merchant can install, configure, and safely test distance-based rates.
2. Correct road-route distances and pricing are returned for supported destinations.
3. Unsupported destinations never receive invented delivery charges.
4. External provider outages follow the merchant's documented fallback policy within the verified plugin deadline.
5. Dashboard data is tenant-isolated and persisted in Wix Data.
6. Billing access is enforced server-side and handles lifecycle changes.
7. All required UI strings are localized and all forms use Zod.
8. Build, typecheck, lint, and automated tests pass.
9. No placeholder/mock integration is presented as complete.

## Deliverables
1. Full source implementation in the current repository.
2. `docs/sdk-verification.md` with evidence and official links for each Wix integration.
3. `docs/architecture.md` including data flow, timeout budget, cache strategy, failure handling, and tenant boundaries.
4. `docs/wix-permissions.md` listing **verified exact permission scopes** needed and why.
5. `docs/setup.md` for Wix app configuration, routing provider credentials, App Market plans, and shipping activation.
6. `docs/test-plan.md` with detailed checkout scenarios and beta/rollback plan.
7. `.env.example` without secrets.
8. A completion report listing implemented features, tests executed, remaining manual setup, unresolved limitations, and any SDK claims that could not be verified.

## Execution instructions
First inspect the repository and verify SDK/API contracts with Wix MCP and skills. Then create a concise implementation plan and **execute it**. Do not ask for approval at every stage; make reasonable implementation decisions and document them. Ask only when blocked by missing credentials, an essential business decision, or an unsupported platform capability. Do not skip production code in favor of plans. Do not claim features work until they have been implemented and tested.