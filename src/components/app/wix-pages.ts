import { dashboard } from '@wix/dashboard';
import { pages } from '@wix/ecom/dashboard';

export const SUPPORT_EMAIL = 'admin@hikonsults.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Distance Shipping Rates support')}`;

/**
 * Opens Settings → Shipping, delivery & fulfillment in the site dashboard,
 * where merchants enable this app per region. Wix exposes no API to read that
 * state, so the checklist can only send them there.
 */
export function openShippingSettings() {
  dashboard.navigate(pages.deliveryProfiles());
}
