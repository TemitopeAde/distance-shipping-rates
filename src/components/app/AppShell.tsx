import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import {
  Activity,
  CreditCard,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  ListOrdered,
  Mail,
  Map,
  MapPin,
  Menu,
  Plug,
  Settings,
  Sparkles,
  Truck,
} from 'lucide-react';
import { createI18n, directionOf, LOCALE_NAMES, matchLocale } from '../../lib/i18n';
import { SUPPORT_MAILTO } from './wix-pages';
import { supportedLocales, type MerchantSettings, type SupportedLocale } from '../../lib/validation/schemas';
import { Button } from '../ui/button';
import { Dialog, DialogTitle, SheetContent } from '../ui/dialog';
import { Badge, NativeSelect, TooltipProvider } from '../ui/primitives';
import { cn } from '../ui/utils';
import { LookupsRemaining, OfflineNotice } from './common';
import { AppContext, PAGES, type PageId } from './context';
import { useResource } from './hooks';
import type { BillingResponse } from './types';
import { OverviewPage } from './pages/OverviewPage';
import { LocationsPage } from './pages/LocationsPage';
import { RulesPage } from './pages/RulesPage';
import { ZonesPage } from './pages/ZonesPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { LogsPage } from './pages/LogsPage';
import { BillingPage } from './pages/BillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { HelpPage } from './pages/HelpPage';

const NAV: Array<{ id: PageId; icon: ComponentType<{ className?: string }> }> = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'locations', icon: MapPin },
  { id: 'rules', icon: ListOrdered },
  { id: 'zones', icon: Map },
  { id: 'simulator', icon: Gauge },
  { id: 'checkout', icon: Plug },
  { id: 'logs', icon: Activity },
  { id: 'billing', icon: CreditCard },
  { id: 'settings', icon: Settings },
  { id: 'help', icon: HelpCircle },
];

const PAGE_COMPONENTS: Record<PageId, ComponentType> = {
  overview: OverviewPage,
  locations: LocationsPage,
  rules: RulesPage,
  zones: ZonesPage,
  simulator: SimulatorPage,
  checkout: CheckoutPage,
  logs: LogsPage,
  billing: BillingPage,
  settings: SettingsPage,
  help: HelpPage,
};

function pageFromHash(): PageId {
  const id = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#\/?/, '');
  return (PAGES as readonly string[]).includes(id) ? (id as PageId) : 'overview';
}

const LOCALE_STORAGE_KEY = 'distance-shipping:locale';

function initialLocale(): SupportedLocale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) return matchLocale(stored);
  } catch {
    // Storage may be unavailable in sandboxed iframes.
  }
  return matchLocale(typeof navigator !== 'undefined' ? navigator.language : 'en');
}

function NavList({ page, onSelect }: { page: PageId; onSelect: (p: PageId) => void }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('common.appName')}>
      <ul className="grid gap-0.5">
        {NAV.map(({ id, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              aria-current={page === id ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm font-medium transition-colors',
                page === id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {t(`nav.${id}`)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Shell({ locale, setLocale }: { locale: SupportedLocale; setLocale: (l: SupportedLocale) => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [mobileOpen, setMobileOpen] = useState(false);
  const settings = useResource<MerchantSettings>('settings');
  const billing = useResource<BillingResponse>('billing');
  const plan = billing.data?.entitlement.plan;
  // Business (including overrides) has nothing above it; hidden until billing loads so it never flickers.
  const canUpgrade = plan !== undefined && plan !== 'business';

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((p: PageId) => {
    setPage(p);
    setMobileOpen(false);
    if (window.location.hash !== `#/${p}`) window.history.replaceState(null, '', `#/${p}`);
    document.getElementById('main-content')?.focus();
  }, []);

  const ctx = useMemo(
    () => ({
      page,
      navigate,
      locale,
      setLocale,
      unit: settings.data?.unit ?? 'mi',
      pluginEnabled: settings.data?.pluginEnabled ?? false,
      refreshShell: () => void settings.reload(),
    }),
    [page, navigate, locale, setLocale, settings],
  );

  const PageComponent = PAGE_COMPONENTS[page];
  const live = settings.data?.pluginEnabled ?? false;

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2 px-2">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
          <Truck className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 text-sm leading-tight font-semibold">{t('common.appName')}</div>
      </div>
      <Badge variant={live ? 'success' : 'secondary'} className="mx-2">
        {live ? t('nav.status.live') : t('nav.status.paused')}
      </Badge>
      <NavList page={page} onSelect={navigate} />
      <a
        href={SUPPORT_MAILTO}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sidebar-foreground hover:bg-muted flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
      >
        <Mail className="size-4 shrink-0" aria-hidden="true" />
        {t('help.contactDeveloper')}
      </a>
      {billing.data && plan && (
        <div className="bg-card mx-2 grid gap-2 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">{t('nav.currentPlan', { plan: t(`common.planNames.${plan}`) })}</p>
          <LookupsRemaining usage={billing.data.usage} locale={locale} className="text-xs" />
          {canUpgrade && (
            <Button size="sm" onClick={() => navigate('billing')}>
              <Sparkles aria-hidden="true" /> {t('nav.upgrade')}
            </Button>
          )}
        </div>
      )}
      <div className="mt-auto grid gap-1.5 px-2">
        <label htmlFor="locale-select" className="text-muted-foreground text-xs">
          {t('common.language')}
        </label>
        <NativeSelect id="locale-select" value={locale} onChange={(e) => setLocale(e.target.value as SupportedLocale)}>
          {supportedLocales.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );

  return (
    <AppContext.Provider value={ctx}>
      <TooltipProvider>
        {/* The shell owns scrolling: only the content column scrolls, so the sidebar stays fixed even when the dashboard iframe grows. */}
        <div className="bg-background flex h-screen overflow-hidden">
          <aside className="bg-sidebar border-sidebar-border hidden h-full w-64 shrink-0 overflow-y-auto border-e lg:block">{sidebar}</aside>
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
            <header className="bg-card flex items-center gap-2 border-b px-4 py-2 lg:hidden">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label={t('nav.menu')}>
                <Menu />
              </Button>
              <span className="truncate text-sm font-semibold">{t(`nav.${page}`)}</span>
              {canUpgrade && (
                <Button size="sm" className="ms-auto" onClick={() => navigate('billing')}>
                  <Sparkles aria-hidden="true" /> {t('nav.upgrade')}
                </Button>
              )}
            </header>
            <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 p-4 pb-16 outline-none sm:p-6 lg:p-8">
              <PageComponent />
            </main>
          </div>
        </div>
        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="start" closeLabel={t('common.close')} className="bg-sidebar p-0">
            <DialogTitle className="sr-only">{t('nav.menu')}</DialogTitle>
            {sidebar}
          </SheetContent>
        </Dialog>
        <OfflineNotice />
        <Toaster position="top-center" dir={directionOf(locale)} richColors closeButton />
      </TooltipProvider>
    </AppContext.Provider>
  );
}

export function AppShell() {
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
  const i18n = useMemo(() => createI18n(locale), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [i18n, locale]);

  const setLocale = useCallback((l: SupportedLocale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, l);
    } catch {
      // Non-critical convenience only.
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <Shell locale={locale} setLocale={setLocale} />
    </I18nextProvider>
  );
}
