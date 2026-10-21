import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, NativeSelect } from '../ui/primitives';
import { useCities, useStates } from './useLocationOptions';

interface AriaProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

interface SubdivisionProps extends AriaProps {
  /** ISO country code of the address. */
  country: string;
  value: string;
  /** `fromList` is true when the merchant picked a state from the list (the city should then be cleared). */
  onChange: (value: string, fromList: boolean) => void;
}

/**
 * State / region picker fed by CountriesNow. Stores the subdivision code (e.g. "TX"), which is what
 * zones match on. Falls back to free text when the country has no states or the lookup fails.
 */
export function SubdivisionSelect({ country, value, onChange, ...aria }: SubdivisionProps) {
  const { t } = useTranslation();
  const { data: states, loading, selected } = useStates(country, value);

  if (loading) {
    return (
      <NativeSelect disabled value="" {...aria}>
        <option value="">{t('address.loadingStates')}</option>
      </NativeSelect>
    );
  }
  if (states.length === 0) {
    return <Input value={value} onChange={(e) => onChange(e.target.value, false)} autoComplete="address-level1" {...aria} />;
  }
  const current = selected?.code ?? value;
  return (
    <NativeSelect value={current} onChange={(e) => onChange(e.target.value, true)} autoComplete="address-level1" {...aria}>
      <option value="">{t('address.selectSubdivision')}</option>
      {/* Keep a value that isn't in the list (autocomplete or older data) instead of silently dropping it. */}
      {!selected && value && <option value={value}>{value}</option>}
      {states.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name}
        </option>
      ))}
    </NativeSelect>
  );
}

interface CityProps extends AriaProps {
  country: string;
  subdivision: string;
  value: string;
  onChange: (value: string) => void;
}

const MANUAL = '__manual__';

/**
 * City picker for the chosen state, fed by CountriesNow. Free text when there is no state, no city
 * list, or the merchant chooses to type it.
 */
export function CitySelect({ country, subdivision, value, onChange, ...aria }: CityProps) {
  const { t } = useTranslation();
  const { country: countryOption, selected: state } = useStates(country, subdivision);
  const { data: cities, loading } = useCities(countryOption, state);
  // Manual entry is per state: choosing another state offers its list again.
  const [manualFor, setManualFor] = useState<string | null>(null);
  const stateKey = state ? `${country}|${state.code}` : null;

  if (loading) {
    return (
      <NativeSelect disabled value="" {...aria}>
        <option value="">{t('address.loadingCities')}</option>
      </NativeSelect>
    );
  }
  if (!state || cities.length === 0 || manualFor === stateKey) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="address-level2"
        placeholder={state && cities.length > 0 ? t('address.cityManualHint') : undefined}
        {...aria}
      />
    );
  }
  const inList = cities.includes(value);
  return (
    <NativeSelect
      value={value}
      onChange={(e) => {
        if (e.target.value === MANUAL) setManualFor(stateKey);
        else onChange(e.target.value);
      }}
      autoComplete="address-level2"
      {...aria}
    >
      <option value="">{t('address.selectCity')}</option>
      {!inList && value && <option value={value}>{value}</option>}
      {cities.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={MANUAL}>{t('address.cityOther')}</option>
    </NativeSelect>
  );
}
