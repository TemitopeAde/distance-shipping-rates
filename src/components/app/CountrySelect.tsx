import { useTranslation } from 'react-i18next';
import { NativeSelect } from '../ui/primitives';
import { useCountryOptions } from './useLocationOptions';

interface Props {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Countries from CountriesNow (built-in ISO list as fallback); the value is the ISO-2 code. */
export function CountrySelect({ id, value, onChange, ...aria }: Props) {
  const { t } = useTranslation();
  const options = useCountryOptions();
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="country" {...aria}>
      <option value="">{t('address.selectCountry')}</option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.name}
        </option>
      ))}
    </NativeSelect>
  );
}
