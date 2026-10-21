import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { supportedLocales } from '../validation/schemas';
import { PLAN_LIMITS } from '../billing/plans';
import { createI18n, directionOf, matchLocale } from './index';
import en from './locales/en';
import { partialLocales } from './locales/partial';

function has(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string';
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [p] : [];
  });
}

const sources = files(join(__dirname, '../../components')).map((f) => readFileSync(f, 'utf8'));

describe('English resources cover the UI', () => {
  it('every static t() key exists', () => {
    const missing = new Set<string>();
    for (const src of sources) {
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!has(en, m[1])) missing.add(m[1]);
    }
    expect([...missing]).toEqual([]);
  });

  it('every templated key family resolves for its known values', () => {
    const families: Record<string, string[]> = {
      nav: ['overview', 'locations', 'rules', 'zones', 'simulator', 'checkout', 'logs', 'billing', 'settings', 'help'],
      reasons: [
        'plugin_disabled', 'rollout_disabled', 'not_entitled', 'invalid_currency', 'no_shippable_items', 'address_incomplete',
        'excluded_zone', 'outside_service_zones', 'no_locations', 'locations_unverified', 'location_country_mismatch', 'bad_address', 'low_confidence', 'no_route',
        'beyond_max_distance', 'no_matching_rule', 'routing_unavailable', 'quota_exceeded', 'config_unavailable',
        'missing_postal_code', 'partial_address',
      ],
      errors: [
        'network', 'unauthenticated', 'forbidden', 'no_instance', 'validation_failed', 'payload_too_large', 'invalid_json',
        'rate_limited', 'not_found', 'internal', 'plan_limit_locations', 'plan_limit_rules', 'plan_limit_advanced_rules',
        'plan_limit_zones', 'reorder_mismatch', 'golive_no_location', 'golive_no_rule', 'golive_no_plan', 'checkout_url_unavailable', 'wix_permission_missing', 'autocomplete_unavailable',
      ],
      'billing.status': ['active', 'trial', 'cancelling', 'expired', 'free', 'override', 'unknown'],
      'billing.features': Object.keys(PLAN_LIMITS.pro),
      'common.planNames': ['none', 'basic', 'pro'],
      'overview.health': ['healthy', 'degraded', 'down', 'not_configured', 'idle', 'healthyDesc', 'degradedDesc', 'downDesc', 'not_configuredDesc', 'idleDesc'],
      'logs.statuses': ['all', 'priced', 'no_rate', 'fallback', 'error'],
      'logs.sources': ['all', 'checkout', 'simulator'],
      'rules.warnings': ['same_code_same_priority', 'shadowed_rule', 'no_active_rules'],
      'locations.warnings': ['geocode_unavailable', 'geocode_low_confidence', 'geocode_failed'],
      'simulator.outcome': ['rates', 'no_rate', 'fallback', 'address_error'],
      'simulator.qualities': ['high', 'medium', 'low'],
      'simulator.ruleReasons': [
        'inactive', 'demo', 'plan_rule_limit', 'plan_advanced', 'code_taken', 'exceeds_rule_max_distance', 'below_min_subtotal',
        'above_max_subtotal', 'above_max_weight', 'weight_unknown_for_limit', 'zone_condition_not_met', 'location_condition_not_met',
      ],
      'simulator.breakdown': ['base', 'distance', 'tier', 'included_distance', 'surcharge', 'surcharge_skipped_missing_weight', 'min_fee_applied', 'max_fee_applied', 'free_delivery', 'handling'],
      validation: ['required', 'tooLong', 'number', 'positive', 'nonNegative', 'decimal', 'country', 'currency', 'code', 'tiersRequired', 'openTierLast', 'tiersAscending', 'minAboveMax', 'postalPattern', 'zoneEmpty', 'fallbackRequired', 'fallbackPositive', 'ackRequired', 'format', 'invalid'],
    };
    for (const step of ['location', 'units', 'rules', 'routing', 'fallback', 'carrier', 'simulate', 'test_checkout', 'go_live']) {
      families[`overview.steps.${step}`] = ['title', 'desc'];
    }
    const missing = Object.entries(families).flatMap(([prefix, keys]) => keys.map((k) => `${prefix}.${k}`).filter((k) => !has(en, k)));
    expect(missing).toEqual([]);
  });

  it('every validation message used by the schemas has a translation', () => {
    const schemaSrc = readFileSync(join(__dirname, '../validation/schemas.ts'), 'utf8');
    const keys = [...schemaSrc.matchAll(/'(validation\.[a-zA-Z]+)'/g)].map((m) => m[1]);
    expect(keys.filter((k) => !has(en, k))).toEqual([]);
  });
});

describe('locales', () => {
  it('ships a resource for every supported locale, flagged for review', () => {
    for (const l of supportedLocales.filter((x) => x !== 'en')) {
      expect(partialLocales[l], l).toBeDefined();
      expect(partialLocales[l].needsReview).toBe(true);
    }
  });

  it('translated keys are a subset of the English keys', () => {
    for (const [code, res] of Object.entries(partialLocales)) {
      for (const [ns, values] of Object.entries({ common: res.common, nav: res.nav })) {
        for (const [k, v] of Object.entries(values)) {
          if (typeof v === 'string') expect(has(en, `${ns}.${k}`), `${code}:${ns}.${k}`).toBe(true);
        }
      }
    }
  });

  it('falls back to English for untranslated keys and translates navigation', () => {
    const i18n = createI18n('de');
    expect(i18n.t('nav.settings')).toBe('Einstellungen');
    expect(i18n.t('billing.title')).toBe('Billing');
  });

  it('handles RTL and locale matching', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('he')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
    expect(matchLocale('pt-BR')).toBe('pt');
    expect(matchLocale('zh-HK')).toBe('zh-TW');
    expect(matchLocale('zh')).toBe('zh-CN');
    expect(matchLocale('xx')).toBe('en');
  });

  it('interpolates and pluralises via i18next', () => {
    const i18n = createI18n('en');
    expect(i18n.t('overview.completion', { percent: 40 })).toBe('40% complete');
  });
});
