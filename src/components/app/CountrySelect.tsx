import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Badge, NativeSelect } from '../ui/primitives';
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

interface MultiProps {
  id?: string;
  value: string[];
  onChange: (codes: string[]) => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Several countries: pick from the dropdown to add one, remove with its chip. Values are ISO-2 codes. */
export function CountryMultiSelect({ id, value, onChange, ...aria }: MultiProps) {
  const { t } = useTranslation();
  const options = useCountryOptions();
  const nameOf = (code: string) => options.find((o) => o.code === code)?.name ?? code;
  return (
    <div className="grid gap-2">
      <NativeSelect id={id} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} {...aria}>
        <option value="">{t('zones.addCountry')}</option>
        {options
          .filter((o) => !value.includes(o.code))
          .map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
      </NativeSelect>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <li key={code}>
              <Badge variant="secondary" className="gap-1 pe-1">
                {nameOf(code)}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((c) => c !== code))}
                  aria-label={t('zones.removeCountry', { country: nameOf(code) })}
                  className="hover:bg-muted-foreground/20 inline-flex size-4 items-center justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
