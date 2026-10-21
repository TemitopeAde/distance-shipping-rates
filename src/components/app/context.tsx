import { createContext, useContext } from 'react';
import type { SupportedLocale } from '../../lib/validation/schemas';

export const PAGES = ['overview', 'locations', 'rules', 'zones', 'simulator', 'checkout', 'logs', 'billing', 'settings', 'help'] as const;
export type PageId = (typeof PAGES)[number];

export interface AppContextValue {
  page: PageId;
  navigate: (page: PageId) => void;
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  unit: 'mi' | 'km';
  /** Called after settings change so shell-level state (unit, live badge) refreshes. */
  refreshShell: () => void;
  pluginEnabled: boolean;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppContext');
  return ctx;
}
