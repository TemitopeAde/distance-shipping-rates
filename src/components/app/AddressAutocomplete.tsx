import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin } from 'lucide-react';
import type { AddressSuggestion } from '../../lib/routing/autocomplete';
import { Input } from '../ui/primitives';
import { cn } from '../ui/utils';
import { api } from './api-client';
import { useApp } from './context';

export type { AddressSuggestion };

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called when the merchant picks a suggestion; fill the other address fields from it. */
  onSelect: (suggestion: AddressSuggestion) => void;
  /** ISO country code. Search is disabled until it is set, and results are restricted to it. */
  country: string;
  autoComplete?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/**
 * Street-address input with Geoapify suggestions (proxied through /api/address-suggest).
 * ARIA combobox pattern: arrow keys move, Enter selects, Escape closes.
 * Suggestions are a convenience only; the field stays free text and is validated on save.
 */
export function AddressAutocomplete({ id, value, onChange, onSelect, country, autoComplete, ...aria }: Props) {
  const { t } = useTranslation();
  const { locale } = useApp();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const seq = useRef(0);
  const hasCountry = /^[A-Z]{2}$/.test(country);

  // A new country invalidates any pending search and suggestions from the previous one.
  const [lastCountry, setLastCountry] = useState(country);
  if (lastCountry !== country) {
    setLastCountry(country);
    setSuggestions([]);
    setOpen(false);
    setQuery(null);
    setSearching(false);
  }

  useEffect(() => {
    if (query === null || !hasCountry) return;
    const text = query.trim();
    const id = ++seq.current;
    if (text.length < MIN_CHARS) return;
    const timer = setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ text, country, lang: locale.slice(0, 2) });
      api<{ suggestions: AddressSuggestion[] }>(`address-suggest?${params}`)
        .then((res) => {
          if (id !== seq.current) return;
          setSuggestions(Array.isArray(res?.suggestions) ? res.suggestions : []);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          // Autocomplete is optional: on failure the merchant just keeps typing.
          if (id === seq.current) setSuggestions([]);
        })
        .finally(() => {
          if (id === seq.current) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, country, hasCountry, locale]);

  const choose = (s: AddressSuggestion) => {
    seq.current++;
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
    setQuery(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && query !== null && query.trim().length >= MIN_CHARS;

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete={autoComplete ?? 'off'}
        disabled={!hasCountry}
        placeholder={hasCountry ? t('address.searchPlaceholder') : t('address.selectCountryFirst')}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          if (e.target.value.trim().length < MIN_CHARS) {
            setSuggestions([]);
            setOpen(false);
            // A request still in flight is now stale and won't clear the spinner itself.
            setSearching(false);
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        {...aria}
      />
      {searching && (
        <Loader2 className="text-muted-foreground absolute end-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin" aria-label={t('address.searching')} />
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('address.suggestions')}
          className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border p-1 shadow-md"
        >
          {suggestions.length === 0 && !searching && <li className="text-muted-foreground px-3 py-2 text-sm">{t('address.noSuggestions')}</li>}
          {suggestions.map((s, i) => (
            <li
              key={s.formatted}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the input's blur doesn't close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-start gap-2 rounded-sm px-3 py-2 text-sm', i === active && 'bg-accent text-accent-foreground')}
            >
              <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{s.formatted}</span>
            </li>
          ))}
          {/* Required by Geoapify's terms on the free plan; suggestions always come from Geoapify. */}
          <li role="presentation" className="text-muted-foreground border-t px-3 pt-1.5 pb-0.5 text-end text-[11px]">
            {t('address.attribution')}
          </li>
        </ul>
      )}
    </div>
  );
}
