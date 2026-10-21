/**
 * i18n for the dashboard. English is the source and fallback.
 *
 * Locale selection (20): the largest Wix / e-commerce markets by merchant
 * population and language reach — English; Western Europe (es, pt, fr, de, it,
 * nl, sv); Central/Eastern Europe (pl, tr, ru, uk); Middle East with RTL
 * scripts (ar, he); East Asia (ja, ko, zh-CN, zh-TW); South/Southeast Asia
 * (hi, id). See docs/architecture.md#internationalization.
 */
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { supportedLocales, type SupportedLocale } from '../validation/schemas';
import en from './locales/en';
import { partialLocales } from './locales/partial';

export const RTL_LOCALES: ReadonlySet<string> = new Set(['ar', 'he']);

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  tr: 'Türkçe',
  ru: 'Русский',
  uk: 'Українська',
  ar: 'العربية',
  he: 'עברית',
  ja: '日本語',
  ko: '한국어',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  sv: 'Svenska',
};

export function directionOf(locale: string): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale.split('-')[0]) ? 'rtl' : 'ltr';
}

/** Maps a browser/Wix language tag to a supported locale. */
export function matchLocale(tag: string | null | undefined): SupportedLocale {
  if (!tag) return 'en';
  const normalized = tag.replace('_', '-');
  const exact = supportedLocales.find((l) => l.toLowerCase() === normalized.toLowerCase());
  if (exact) return exact;
  const lang = normalized.split('-')[0].toLowerCase();
  if (lang === 'zh') return /tw|hk|hant/i.test(normalized) ? 'zh-TW' : 'zh-CN';
  return supportedLocales.find((l) => l === lang) ?? 'en';
}

export function createI18n(locale: SupportedLocale): I18n {
  const instance = i18next.createInstance();
  const resources: Record<string, { translation: object }> = { en: { translation: en } };
  for (const [code, res] of Object.entries(partialLocales)) resources[code] = { translation: res };
  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });
  return instance;
}

export { en };
