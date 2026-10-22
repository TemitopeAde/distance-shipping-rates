// @ts-check
import { defineConfig, envField } from 'astro/config';
import wix from '@wix/astro';
import react from "@astrojs/react";
import wixHostingAdapter from "@wix/astro-wix-hosting-adapter";

export default defineConfig({
  output: "server",
  adapter: wixHostingAdapter(),
  integrations: [wix(), react()],
  image: { domains: ["static.wixstatic.com"] },
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  env: {
    // Secrets are set with `wix env set` and never reach the browser. See docs/setup.md.
    schema: {
      ROUTING_PROVIDER: envField.enum({ context: "server", access: "public", values: ["google", "geoapify"], default: "google" }),
      ROUTING_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Geoapify key used only for dashboard address autocomplete (proxied by /api/address-suggest).
      AUTOCOMPLETE_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      PLAN_PACKAGE_PRO: envField.string({ context: "server", access: "public", default: "pro" }),
      PLAN_PACKAGE_BUSINESS: envField.string({ context: "server", access: "public", default: "business" }),
      ENTITLEMENT_OVERRIDE_INSTANCE_IDS: envField.string({ context: "server", access: "secret", optional: true }),
      ROLLOUT_MODE: envField.enum({ context: "server", access: "public", values: ["all", "allowlist", "off"], default: "all" }),
      ROLLOUT_ALLOWLIST: envField.string({ context: "server", access: "secret", optional: true }),
      CHECKOUT_BUDGET_MS: envField.number({ context: "server", access: "public", default: 4000 }),
    },
  },
});
