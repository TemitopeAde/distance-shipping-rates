import { describe, expect, it, vi } from 'vitest';
import { __setLocationFetcher, COUNTRY_CODES, findState, loadCities, loadCountries, loadStates } from './countries-now';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('CountriesNow client', () => {
  it('maps countries from /countries/iso and caches them', async () => {
    const f = vi.fn().mockResolvedValue(json({ error: false, data: [{ name: 'United States', Iso2: 'us' }, { name: 'Nowhere', Iso2: '' }] }));
    __setLocationFetcher(f);
    const list = await loadCountries();
    expect(list.find((c) => c.code === 'US')).toEqual({ code: 'US', name: 'United States' });
    expect(list.some((c) => c.name === 'Nowhere')).toBe(false);
    await loadCountries();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://countriesnow.space/api/v0.1/countries/iso');
  });

  it('falls back to the built-in country list when the API fails or reports an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    __setLocationFetcher(vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadCountries()).toHaveLength(COUNTRY_CODES.length);
    __setLocationFetcher(vi.fn().mockResolvedValue(json({ error: true, msg: 'nope' })));
    const list = await loadCountries();
    expect(list.find((c) => c.code === 'US')?.name).toBe('United States');
  });

  it('loads states with uppercase codes and cities by state name', async () => {
    const f = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('/states/q')
          ? json({ error: false, data: { name: 'United States', states: [{ name: 'Texas', state_code: 'tx' }, { name: 'Nameless Code', state_code: '' }] } })
          : json({ error: false, data: ['Austin', 'Austin', 'Dallas', ''] }),
      ),
    );
    __setLocationFetcher(f as never);
    const us = { code: 'US', name: 'United States' };
    const states = await loadStates(us);
    expect(states).toEqual([{ code: 'TX', name: 'Texas' }, { code: 'NAMELESS CODE', name: 'Nameless Code' }]);
    expect(f.mock.calls[0][0]).toContain('/countries/states/q?country=United%20States');
    expect(await loadCities(us, states[0])).toEqual(['Austin', 'Dallas']);
    expect(f.mock.calls[1][0]).toContain('/countries/state/cities/q?country=United%20States&state=Texas');
    expect(findState(states, 'texas')).toEqual(states[0]);
    expect(findState(states, 'tx')).toEqual(states[0]);
    expect(findState(states, '')).toBeUndefined();
  });

  it('keeps countries CountriesNow lacks (real gap: KR, TZ, BO, CD, CI…)', async () => {
    __setLocationFetcher(vi.fn().mockResolvedValue(json({ error: false, data: [{ name: 'Nigeria', Iso2: 'NG', Iso3: 'NGA' }] })));
    const list = await loadCountries();
    expect(list).toHaveLength(COUNTRY_CODES.length);
    for (const code of ['KR', 'TZ', 'BO', 'CD', 'CI', 'SS', 'PS']) expect(list.some((c) => c.code === code), code).toBe(true);
    expect(list.find((c) => c.code === 'NG')?.name).toBe('Nigeria');
  });

  it('normalizes mixed state-code formats to the short form used by autocomplete, Wix and zones', async () => {
    // Real response shapes (Oct 2026): Nigeria and the UK use ISO 3166-2 codes, the US short codes.
    const states = (byCountry: Record<string, Array<{ name: string; state_code: string }>>) =>
      vi.fn((url: string) => {
        const country = decodeURIComponent(new URL(url).searchParams.get('country') ?? '');
        return Promise.resolve(json({ error: false, data: { name: country, iso2: '', iso3: '', states: byCountry[country] ?? [] } }));
      });
    __setLocationFetcher(
      states({
        Nigeria: [
          { name: 'Osun State', state_code: 'NG-OS' },
          { name: 'Federal Capital Territory', state_code: 'NG-FC' },
        ],
        'United Kingdom': [{ name: 'England', state_code: 'GB-ENG' }],
        'United States': [{ name: 'Texas', state_code: 'TX' }],
      }) as never,
    );
    const ng = await loadStates({ code: 'NG', name: 'Nigeria' });
    expect(ng).toEqual([
      { code: 'OS', name: 'Osun State' },
      { code: 'FC', name: 'Federal Capital Territory' },
    ]);
    expect(await loadStates({ code: 'GB', name: 'United Kingdom' })).toEqual([{ code: 'ENG', name: 'England' }]);
    expect(await loadStates({ code: 'US', name: 'United States' })).toEqual([{ code: 'TX', name: 'Texas' }]);

    // Values filled by Geoapify autocomplete or typed by merchants all resolve to the same state.
    for (const v of ['OS', 'os', 'NG-OS', 'Osun', 'Osun State']) expect(findState(ng, v)?.code, v).toBe('OS');
    expect(findState(ng, 'Lagos')).toBeUndefined();
  });

  it('rejects state lookups on API errors and retries next time', async () => {
    const f = vi.fn().mockResolvedValueOnce(json({ error: true, msg: 'country not found' }, 404)).mockResolvedValueOnce(json({ error: false, data: { states: [] } }));
    __setLocationFetcher(f);
    const xx = { code: 'XX', name: 'Atlantis' };
    await expect(loadStates(xx)).rejects.toThrow('country not found');
    expect(await loadStates(xx)).toEqual([]);
  });

  it('uses bundled region and commune data for Chile without calling the API', async () => {
    const f = vi.fn();
    __setLocationFetcher(f);
    const cl = { code: 'CL', name: 'Chile' };
    const states = await loadStates(cl);
    const rm = states.find((s) => s.code === 'RM')!;
    expect(rm).toBeTruthy();
    expect((await loadCities(cl, rm)).length).toBeGreaterThan(10);
    expect(f).not.toHaveBeenCalled();
  });
});
