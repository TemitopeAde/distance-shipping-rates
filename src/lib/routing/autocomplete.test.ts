import { describe, expect, it, vi } from 'vitest';
import { suggestAddresses } from './autocomplete';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('suggestAddresses', () => {
  it('maps Geoapify results to form fields and de-duplicates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        results: [
          { formatted: '500 Congress Avenue, Austin, TX 78701, United States of America', address_line1: '500 Congress Avenue', housenumber: '500', street: 'Congress Avenue', city: 'Austin', state_code: 'tx', postcode: '78701', country_code: 'us', result_type: 'building' },
          { formatted: '500 Congress Avenue, Austin, TX 78701, United States of America', result_type: 'building' },
          { formatted: 'Smallville, KS, USA', town: 'Smallville', state_code: 'KS', country_code: 'us', result_type: 'city' },
        ],
      }),
    );
    const out = await suggestAddresses('500 Congress', 'KEY', { country: 'US', lang: 'en' }, fetchMock);
    expect(out).toEqual([
      { formatted: '500 Congress Avenue, Austin, TX 78701, United States of America', addressLine1: '500 Congress Avenue', city: 'Austin', subdivision: 'TX', postalCode: '78701', country: 'US', resultType: 'building' },
      { formatted: 'Smallville, KS, USA', addressLine1: '', city: 'Smallville', subdivision: 'KS', postalCode: '', country: 'US', resultType: 'city' },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/v1/geocode/autocomplete');
    expect(url.searchParams.get('filter')).toBe('countrycode:us');
    expect(url.searchParams.get('lang')).toBe('en');
  });

  it('ignores invalid bias parameters and classifies HTTP errors without leaking the key', async () => {
    const ok = vi.fn().mockResolvedValue(json({ results: [] }));
    await suggestAddresses('abc', 'KEY', { country: 'USA', lang: 'english' }, ok);
    const url = new URL(String(ok.mock.calls[0][0]));
    expect(url.searchParams.has('filter')).toBe(false);
    expect(url.searchParams.has('lang')).toBe(false);

    const limited = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    const err = await suggestAddresses('abc', 'SECRET', {}, limited).catch((e: Error) => e);
    expect(err).toMatchObject({ kind: 'RATE_LIMITED' });
    expect((err as Error).message).not.toContain('SECRET');
  });
});
