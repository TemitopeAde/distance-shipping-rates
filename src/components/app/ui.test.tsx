// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@wix/essentials', () => ({ httpClient: { fetchWithAuth: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, Toaster: () => null }));

const { createI18n } = await import('../../lib/i18n');
const { COUNTRY_CODES } = await import('../../lib/location/countries-now');
const { __setFetcher } = await import('./api-client');
const { __setLocationFetcher } = await import('../../lib/location/countries-now');
const { AppContext } = await import('./context');
const { OfflineNotice, Field, LookupsRemaining } = await import('./common');
const { TooltipProvider, Input } = await import('../ui/primitives');
const { Button } = await import('../ui/button');
const { LocationsPage } = await import('./pages/LocationsPage');
const { AppShell } = await import('./AppShell');
const { CountryMultiSelect } = await import('./CountrySelect');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function withProviders(node: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  const i18n = createI18n(locale);
  return (
    <I18nextProvider i18n={i18n}>
      <AppContext.Provider
        value={{ page: 'locations', navigate: vi.fn(), locale, setLocale: vi.fn(), unit: 'mi', refreshShell: vi.fn(), pluginEnabled: false }}
      >
        <TooltipProvider>{node}</TooltipProvider>
      </AppContext.Provider>
    </I18nextProvider>
  );
}

beforeEach(() => {
  // CountriesNow is offline by default: the built-in country list and free-text state/city are used.
  __setLocationFetcher(vi.fn().mockRejectedValue(new Error('offline')));
  // Radix uses ResizeObserver / pointer capture, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});

afterEach(() => cleanup());

describe('Button', () => {
  it('keeps its label, shows a spinner and blocks clicks while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveProperty('disabled', true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.querySelector('svg.animate-spin')).not.toBeNull();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Dashboard tooltips', () => {
  it('shows icon action labels on keyboard focus without activating the action', async () => {
    const onClick = vi.fn();
    render(withProviders(<Button size="icon" aria-label="Edit warehouse" onClick={onClick}><span aria-hidden="true">✎</span></Button>));
    act(() => screen.getByRole('button', { name: 'Edit warehouse' }).focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe('Edit warehouse');
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('makes disabled icon action tooltips keyboard accessible and keeps the action disabled', async () => {
    const onClick = vi.fn();
    render(withProviders(<Button size="icon" aria-label="Move up" disabled onClick={onClick}>↑</Button>));
    const button = screen.getByRole('button', { name: 'Move up' });
    act(() => button.parentElement!.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe('Move up');
    fireEvent.click(button);
    expect(button).toHaveProperty('disabled', true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('offers field help without replacing its visible hint or label association', async () => {
    const hint = 'Distance covered by the base fee.';
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(withProviders(<form onSubmit={onSubmit}><Field id="included-distance" label="Included distance" hint={hint}><Input /></Field></form>));
    const input = screen.getByLabelText('Included distance');
    expect(input.getAttribute('aria-describedby')).toBe('included-distance-hint');
    expect(document.getElementById('included-distance-hint')?.textContent).toBe(hint);
    const help = screen.getByRole('button', { name: 'Included distance: Help' });
    act(() => help.focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe(hint);
    fireEvent.click(help);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('LookupsRemaining', () => {
  it('shows how many lookups are left and warns when none are', () => {
    const { rerender } = render(withProviders(<LookupsRemaining usage={{ used: 3, limit: 10 }} locale="en" />));
    expect(screen.getByText('7 lookups left this month')).toBeTruthy();
    rerender(withProviders(<LookupsRemaining usage={{ used: 12, limit: 10 }} locale="en" />));
    expect(screen.getByText(/No lookups left this month/).className).toContain('text-destructive');
  });
});

describe('CountryMultiSelect', () => {
  it('adds countries from the dropdown and removes them with their chip', () => {
    const onChange = vi.fn();
    const { rerender } = render(withProviders(<CountryMultiSelect id="c" value={['US']} onChange={onChange} />));
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    // Chosen countries leave the list, and the dropdown always resets to its prompt.
    expect([...select.options].some((o) => o.value === 'US')).toBe(false);
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: 'CA' } });
    expect(onChange).toHaveBeenLastCalledWith(['US', 'CA']);

    rerender(withProviders(<CountryMultiSelect id="c" value={['US', 'CA']} onChange={onChange} />));
    fireEvent.click(screen.getByRole('button', { name: /Remove United States/ }));
    expect(onChange).toHaveBeenLastCalledWith(['CA']);
  });
});

describe('OfflineNotice', () => {
  it('appears at the bottom while offline and hides when back online', () => {
    render(withProviders(<OfflineNotice />));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status').textContent).toMatch(/offline/i);
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Locations form', () => {
  it('validates with Zod (translated messages, no network call) then submits once', async () => {
    let resolveSave: (r: Response) => void = () => undefined;
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Promise<Response>((r) => (resolveSave = r));
      return Promise.resolve(json({ locations: [] }));
    });
    __setFetcher(fetcher);
    render(withProviders(<LocationsPage />));
    await screen.findByText('No locations yet');

    fireEvent.click(screen.getAllByRole('button', { name: /Add location/ })[0]);
    const form = (await screen.findByLabelText('Location name')).closest('form')!;
    expect(form.noValidate).toBe(true);

    fireEvent.submit(form);
    expect(await screen.findAllByText('This field is required.')).not.toHaveLength(0);
    expect(screen.getByText('Select a valid country (2-letter code, e.g. US).')).toBeTruthy();
    expect(fetcher.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Location name'), { target: { value: 'Store' } });
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'US' } });
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '1 Main St' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Austin' } });
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '78701' } });

    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(fetcher.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.getAttribute('aria-busy')).toBe('true');

    const body = JSON.parse(String(fetcher.mock.calls.find(([, i]) => i?.method === 'POST')![1]!.body));
    expect(body.address.country).toBe('US');

    await act(async () => resolveSave(json({ location: {}, warning: null }, 201)));
  });

  it('shows an error state with retry when loading fails', async () => {
    __setFetcher(vi.fn().mockResolvedValue(json({ error: { code: 'internal' } }, 500)));
    render(withProviders(<LocationsPage />));
    expect(await screen.findByText('Couldn’t load this page')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });
});

describe('Address autocomplete', () => {
  it('suggests addresses through the backend and fills the form on select', async () => {
    const fetcher = vi.fn((url: string) => {
      if (url.includes('/api/address-suggest')) {
        return Promise.resolve(
          json({
            suggestions: [
              { formatted: '500 Congress Avenue, Austin, TX 78701, USA', addressLine1: '500 Congress Avenue', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US', resultType: 'building' },
            ],
          }),
        );
      }
      return Promise.resolve(json({ locations: [] }));
    });
    __setFetcher(fetcher);
    render(withProviders(<LocationsPage />));
    await screen.findByText('No locations yet');
    fireEvent.click(screen.getAllByRole('button', { name: /Add location/ })[0]);

    const street = await screen.findByLabelText('Street address');
    expect((street as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'US' } });
    expect((street as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(street, { target: { value: '500 Cong' } });
    const option = await screen.findByRole('option', { name: /500 Congress Avenue, Austin/ });

    const url = new URL(String(fetcher.mock.calls.find(([u]) => String(u).includes('address-suggest'))![0]));
    expect(url.searchParams.get('text')).toBe('500 Cong');
    expect(url.searchParams.get('country')).toBe('US');
    // The browser never calls Geoapify directly, so no key can leak to the client.
    expect(fetcher.mock.calls.every(([u]) => !String(u).includes('geoapify'))).toBe(true);

    fireEvent.mouseDown(option);
    expect((screen.getByLabelText('City') as HTMLInputElement).value).toBe('Austin');
    expect((screen.getByLabelText('Postal code') as HTMLInputElement).value).toBe('78701');
    expect((screen.getByLabelText('Country') as HTMLSelectElement).value).toBe('US');
    expect((street as HTMLInputElement).value).toBe('500 Congress Avenue');
    expect(screen.queryByRole('listbox')).toBeNull();

    // Switching country clears the address and restricts later searches to the new country.
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'CA' } });
    expect((street as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('City') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Postal code') as HTMLInputElement).value).toBe('');
    fireEvent.change(street, { target: { value: '100 Queen' } });
    await waitFor(() => expect(fetcher.mock.calls.filter(([u]) => String(u).includes('address-suggest'))).toHaveLength(2));
    const second = new URL(String(fetcher.mock.calls.filter(([u]) => String(u).includes('address-suggest'))[1][0]));
    expect(second.searchParams.get('country')).toBe('CA');
  });

  it('lists the country first and does not search without one', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ locations: [] }));
    __setFetcher(fetcher);
    render(withProviders(<LocationsPage />));
    await screen.findByText('No locations yet');
    fireEvent.click(screen.getAllByRole('button', { name: /Add location/ })[0]);
    const country = await screen.findByLabelText('Country');
    const street = screen.getByLabelText('Street address');
    expect(country.compareDocumentPosition(street) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(country.tagName).toBe('SELECT');
    expect((country as HTMLSelectElement).options.length).toBeGreaterThan(200);
    expect((street as HTMLInputElement).placeholder).toBe('Select a country first');
  });

  it('does not search before 3 characters', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ locations: [] }));
    __setFetcher(fetcher);
    render(withProviders(<LocationsPage />));
    await screen.findByText('No locations yet');
    fireEvent.click(screen.getAllByRole('button', { name: /Add location/ })[0]);
    fireEvent.change(await screen.findByLabelText('Country'), { target: { value: 'US' } });
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '50' } });
    await new Promise((r) => setTimeout(r, 400));
    expect(fetcher.mock.calls.some(([u]) => String(u).includes('address-suggest'))).toBe(false);
  });
});

describe('Country / state / city lists (CountriesNow)', () => {
  it('cascades country → state → city and stores the state code', async () => {
    const location = vi.fn((url: string) => {
      if (url.endsWith('/countries/iso')) return Promise.resolve(json({ error: false, data: [{ name: 'United States', Iso2: 'US' }, { name: 'Canada', Iso2: 'CA' }] }));
      if (url.includes('/countries/states/q')) return Promise.resolve(json({ error: false, data: { name: 'United States', states: [{ name: 'Texas', state_code: 'TX' }, { name: 'Ohio', state_code: 'OH' }] } }));
      if (url.includes('/countries/state/cities/q')) return Promise.resolve(json({ error: false, data: new URL(url).searchParams.get('state') === 'Texas' ? ['Austin', 'Dallas'] : ['Columbus'] }));
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    __setLocationFetcher(location as never);
    __setFetcher(vi.fn().mockResolvedValue(json({ locations: [] })));
    render(withProviders(<LocationsPage />));
    await screen.findByText('No locations yet');
    fireEvent.click(screen.getAllByRole('button', { name: /Add location/ })[0]);

    const country = (await screen.findByLabelText('Country')) as HTMLSelectElement;
    // Countries CountriesNow lacks are kept: placeholder + the full ISO list.
    await waitFor(() => expect(location.mock.calls.some(([u]) => String(u).endsWith('/countries/iso'))).toBe(true));
    await waitFor(() => expect(country.options.length).toBe(COUNTRY_CODES.length + 1));
    fireEvent.change(country, { target: { value: 'US' } });
    const state = (await waitFor(() => {
      const el = screen.getByLabelText(/^State \/ region/) as HTMLSelectElement;
      expect(el.tagName).toBe('SELECT');
      expect(el.disabled).toBe(false);
      return el;
    }));
    expect(location.mock.calls.some(([u]) => u.includes('country=United%20States'))).toBe(true);

    fireEvent.change(state, { target: { value: 'TX' } });
    const city = await waitFor(() => {
      const el = screen.getByLabelText('City') as HTMLSelectElement;
      expect(el.tagName).toBe('SELECT');
      expect(el.disabled).toBe(false);
      return el;
    });
    expect([...city.options].map((o) => o.value)).toEqual(['', 'Austin', 'Dallas', '__manual__']);
    fireEvent.change(city, { target: { value: 'Austin' } });
    expect(city.value).toBe('Austin');

    // Another state clears the city; "Other" switches to free text.
    fireEvent.change(state, { target: { value: 'OH' } });
    const ohioCity = await waitFor(() => {
      const el = screen.getByLabelText('City') as HTMLSelectElement;
      expect([...el.options].map((o) => o.value)).toContain('Columbus');
      return el;
    });
    expect(ohioCity.value).toBe('');
    fireEvent.change(ohioCity, { target: { value: '__manual__' } });
    expect(screen.getByLabelText('City').tagName).toBe('INPUT');
  });
});

describe('AppShell', () => {
  it('applies RTL direction and translated navigation for Arabic', async () => {
    window.localStorage.setItem('distance-shipping:locale', 'ar');
    __setFetcher(vi.fn().mockResolvedValue(json({ error: { code: 'internal' } }, 500)));
    render(<AppShell />);
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getAllByText('الإعدادات').length).toBeGreaterThan(0);
    window.localStorage.removeItem('distance-shipping:locale');
  });
});
