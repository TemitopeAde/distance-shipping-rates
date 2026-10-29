import { useTranslation } from 'react-i18next';
import manageAppsShot from '../../assets/wix-shipping-manage-apps.png';

/** Wix's Shipping, Delivery & Fulfillment page with "Manage Your Apps" boxed. */
export function ManageAppsScreenshot() {
  const { t } = useTranslation();
  return (
    <figure className="grid gap-2">
      <div className="relative overflow-hidden rounded-lg border">
        <img src={manageAppsShot.src} alt={t('checkout.manageAppsAlt')} className="block w-full" loading="lazy" />
        {/* Box sits over "Manage Your Apps" in the cropped screenshot. */}
        <span
          aria-hidden="true"
          className="absolute rounded-md ring-2 ring-red-500 ring-offset-1"
          style={{ left: '49.7%', top: '80.3%', width: '11.25%', height: '8.8%' }}
        />
      </div>
      <figcaption className="text-muted-foreground text-xs">{t('checkout.manageAppsCaption')}</figcaption>
    </figure>
  );
}
