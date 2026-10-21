# Setup

## 1. Prerequisites

- Node 22 (`.nvmrc`), `npm install`
- Logged in to the Wix CLI (`npx wix login`), with the app linked (`wix.config.json`)
- App ID `9ae3b4e3-d854-4337-8629-031d98971a9a`, namespace `@admin14744/distance-shipping-rates`

## 2. Routing provider credentials (app-owned)

The app uses **one server-side key that you own**. Merchants never enter keys.

**Google (default):**
1. In Google Cloud, create a project and enable **Geocoding API** and **Routes API**.
2. Create an API key. Restrict it by API to those two. Set quotas and budget alerts in Google Cloud.
3. Store it as a Wix secret:
   ```bash
   npx wix env set --key=ROUTING_API_KEY --value=<key>
   npx wix env set --key=ROUTING_PROVIDER --value=google
   npx wix env pull   # needed before `wix dev`
   ```

**Geoapify (alternative):** create a key with Geocoding and Route Matrix access, then set `ROUTING_PROVIDER=geoapify` and `ROUTING_API_KEY`.

Review the provider's current pricing, quotas and caching terms before launch (see `docs/architecture.md#routing-provider-choice`).

### Address autocomplete (dashboard)

The Locations and Rate simulator forms suggest addresses as you type, using Geoapify Address Autocomplete. The browser calls the app's `/api/address-suggest`, and the backend calls Geoapify, so the key never reaches the browser.

```bash
npx wix env set --key=AUTOCOMPLETE_API_KEY --value=<Geoapify key>
```

If it's unset and `ROUTING_PROVIDER=geoapify`, the routing key is used. Suggestions only prefill the form: a location is still verified on save, and checkout never uses autocomplete.

## 3. Other environment variables

See `.env.example`. Set them with `wix env set`:

| Key | Purpose |
| --- | --- |
| `PLAN_PACKAGE_BASIC`, `PLAN_PACKAGE_PRO` | The Wix plan IDs (vendor product IDs) you create in step 5 |
| `ENTITLEMENT_OVERRIDE_INSTANCE_IDS` | Test sites that get Pro without paying (secret) |
| `ROLLOUT_MODE`, `ROLLOUT_ALLOWLIST` | Staged rollout / kill switch |
| `CHECKOUT_BUDGET_MS` | Per-quote time budget (default 4000) |

## 4. Permissions

Add the scopes in `docs/wix-permissions.md` in the App Dashboard → Develop → Permissions.

## 5. App Market plans (billing)

1. App Dashboard → **Pricing**: create two paid plans, **Basic** and **Pro**, with optional free trials. Prices are your decision.
2. Copy each plan's ID into `PLAN_PACKAGE_BASIC` / `PLAN_PACKAGE_PRO` (comma-separate aliases if you have several IDs per tier).
3. Optional in-app upgrade buttons: configure an **external pricing page** in the App Dashboard. Wix's `billing.getUrl` only issues checkout URLs when one is configured. Without it, the Billing page shows a clear message and merchants upgrade via **Manage Apps → Upgrade**.
4. To change plan limits, edit `src/lib/billing/plans.ts`.

## 6. Build, preview, release

```bash
npm run check                       # typecheck + lint + tests + build
npx wix preview                     # private preview (backend works for 3 days)
npx wix release --version-type major -c "Initial release"   # major: first data collections + events
```

The first release must be **major**, because it adds data collections and event extensions. Later changes to collections also need a major release.

## 7. Install on a test site

1. Open the preview/release install link and install the app on a **Premium** test site with Wix Stores and the CMS.
2. Wait up to 5 minutes for collections to be created. If they're missing, check the site has the CMS app.
3. Open the app's dashboard page. The Overview seeds one **inactive** sample rule.

## 8. Merchant activation (shipping)

In the site dashboard: **Settings → Shipping, delivery & fulfillment** → open the region (for example, Domestic) → **Manage your apps** → check **Distance-Based Delivery** → set the **backup rate** → **Save**. Then in the app, go to **Checkout integration → Switch on distance-based rates**.

## 9. Local development

```bash
npx wix env pull
npm run dev
```

Service plugins are only invoked by Wix for a released version enabled in shipping settings. Use the Rate simulator for local iteration.
