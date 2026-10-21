import { useEffect, useMemo, useState } from 'react';
import {
  fallbackCountries,
  findState,
  loadCities,
  loadCountries,
  loadStates,
  type CountryOption,
  type StateOption,
} from '../../lib/location/countries-now';
import { useApp } from './context';

interface Remote<T> {
  data: T;
  loading: boolean;
  failed: boolean;
}

/** Loads `load()` whenever `key` changes; ignores responses that arrive after the key moved on. */
function useRemote<T>(key: string | null, empty: T, load: () => Promise<T>): Remote<T> {
  // Result of the last finished lookup; while it belongs to another key, this key is still loading.
  const [result, setResult] = useState<{ key: string; data: T; failed: boolean } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let active = true;
    load().then(
      (data) => active && setResult({ key, data, failed: false }),
      (error) => {
        console.error('Location lookup failed', error);
        if (active) setResult({ key, data: empty, failed: true });
      },
    );
    return () => {
      active = false;
    };
    // `load` and `empty` are derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === null) return { data: empty, loading: false, failed: false };
  if (result?.key !== key) return { data: empty, loading: true, failed: false };
  return { data: result.data, loading: false, failed: result.failed };
}

/** CountriesNow country list (built-in ISO list until it arrives or if it fails). */
export function useCountries(): CountryOption[] {
  const [countries, setCountries] = useState<CountryOption[]>(fallbackCountries);
  useEffect(() => {
    let active = true;
    void loadCountries().then((list) => active && setCountries(list));
    return () => {
      active = false;
    };
  }, []);
  return countries;
}

/** Countries with names in the dashboard language, sorted for display. */
export function useCountryOptions(): Array<{ code: string; name: string }> {
  const { locale } = useApp();
  const countries = useCountries();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
    } catch {
      names = null;
    }
    const collator = new Intl.Collator(locale);
    return countries
      .map((c) => {
        let name = c.name;
        try {
          name = names?.of(c.code) ?? c.name;
        } catch {
          // Code Intl doesn't know: keep the CountriesNow name.
        }
        return { code: c.code, name };
      })
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [countries, locale]);
}

const NO_STATES: StateOption[] = [];
const NO_CITIES: string[] = [];

/** States of `countryCode`, and the state matching `subdivision` (by code or name). */
export function useStates(countryCode: string, subdivision: string) {
  const countries = useCountries();
  const country = countries.find((c) => c.code === countryCode);
  const states = useRemote(country ? `${country.code}|${country.name}` : null, NO_STATES, () => loadStates(country!));
  return { country, ...states, selected: findState(states.data, subdivision) };
}

/** Cities of the given state; nothing until both country and state are known. */
export function useCities(country: CountryOption | undefined, state: StateOption | undefined) {
  return useRemote(country && state ? `${country.code}|${country.name}|${state.code}|${state.name}` : null, NO_CITIES, () =>
    loadCities(country!, state!),
  );
}
