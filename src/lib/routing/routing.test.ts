import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assessAddress, normalizeAddress } from './address';
import { RoutingError } from './errors';
import { createRoutingProvider } from './index';
import { GeoapifyRoutingProvider } from './providers/geoapify';
import { GoogleRoutingProvider } from './providers/google';
import { withRetry, type Deadline } from './resilience';
import { __resetInFlight, resolveRoutes, routeCacheKey, type CachedRoutes, type RouteCacheStore } from './service';
import type { RoutingProvider } from './types';

const dest = normalizeAddress({ addressLine1: '500 Congress Ave', city: 'Austin', subdivision: 'tx', postalCode: '78701', country: 'us' });
const origins = [{ id: 'loc-1', lat: 30.2672, lng: -97.7431 }];
const profile = { avoidTolls: false, avoidHighways: false };
const signal = new AbortController().signal;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function deadline(ms = 4000): Deadline {
  const start = Date.now();
  return { at: start + ms, now: () => Date.now() };
}

class MemoryCache implements RouteCacheStore {
  store = new Map<string, CachedRoutes>();
  sets: Array<{ key: string; value: CachedRoutes; ttlMs: number }> = [];
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: CachedRoutes, ttlMs: number) {
    this.sets.push({ key, value, ttlMs });
    this.store.set(key, value);
  }
}

describe('address assessment', () => {
  it('requires country, street and locality before routing', () => {
    expect(assessAddress(dest)).toBe('routable');
    expect(assessAddress(normalizeAddress({ country: 'US' }))).toBe('missing_street');
    expect(assessAddress(normalizeAddress({ addressLine1: '1 Main', country: 'US' }))).toBe('missing_locality');
    expect(assessAddress(normalizeAddress({ addressLine1: '1 Main', city: 'X' }))).toBe('missing_country');
  });
});

describe('Google provider', () => {
  it('parses a rooftop geocode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ status: 'OK', results: [{ formatted_address: 'x', types: ['street_address'], geometry: { location: { lat: 1, lng: 2 }, location_type: 'ROOFTOP' } }] }),
    );
    const p = new GoogleRoutingProvider('KEY', fetchMock);
    await expect(p.geocode(dest, { signal })).resolves.toEqual({ location: { lat: 1, lng: 2 }, quality: 'high', formatted: 'x', match: 'ROOFTOP' });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('components=country%3AUS');
  });

  it('downgrades postal-code centroids and partial matches', async () => {
    const coarse = vi.fn().mockResolvedValue(
      json({ status: 'OK', results: [{ types: ['postal_code'], geometry: { location: { lat: 1, lng: 2 }, location_type: 'APPROXIMATE' } }] }),
    );
    expect((await new GoogleRoutingProvider('K', coarse).geocode(dest, { signal })).quality).toBe('low');
    const partial = vi.fn().mockResolvedValue(
      json({ status: 'OK', results: [{ partial_match: true, types: ['street_address'], geometry: { location: { lat: 1, lng: 2 }, location_type: 'ROOFTOP' } }] }),
    );
    expect((await new GoogleRoutingProvider('K', partial).geocode(dest, { signal })).quality).toBe('medium');
  });

  it.each([
    ['ZERO_RESULTS', 'BAD_ADDRESS'],
    ['OVER_QUERY_LIMIT', 'RATE_LIMITED'],
    ['OVER_DAILY_LIMIT', 'QUOTA_EXCEEDED'],
    ['REQUEST_DENIED', 'AUTH'],
    ['UNKNOWN_ERROR', 'UPSTREAM_5XX'],
  ])('maps geocode status %s to %s', async (status, kind) => {
    const p = new GoogleRoutingProvider('K', vi.fn().mockResolvedValue(json({ status })));
    await expect(p.geocode(dest, { signal })).rejects.toMatchObject({ kind });
  });

  it('parses route matrix elements and treats missing routes as null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json([
        { originIndex: 1, destinationIndex: 0, status: {}, condition: 'ROUTE_NOT_FOUND' },
        { originIndex: 0, destinationIndex: 0, status: {}, condition: 'ROUTE_EXISTS', distanceMeters: 16093, duration: '900s' },
      ]),
    );
    const p = new GoogleRoutingProvider('K', fetchMock);
    const cells = await p.matrix([origins[0], { lat: 0, lng: 0 }], { lat: 1, lng: 1 }, profile, { signal });
    expect(cells).toEqual([{ distanceMeters: 16093, durationSeconds: 900 }, null]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('distanceMeters');
  });

  it('classifies matrix HTTP failures', async () => {
    const quota = new GoogleRoutingProvider('K', vi.fn().mockResolvedValue(new Response('{"error":{"message":"Quota exceeded"}}', { status: 429 })));
    await expect(quota.matrix(origins, { lat: 1, lng: 1 }, profile, { signal })).rejects.toMatchObject({ kind: 'QUOTA_EXCEEDED' });
    const rate = new GoogleRoutingProvider('K', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    await expect(rate.matrix(origins, { lat: 1, lng: 1 }, profile, { signal })).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
    const down = new GoogleRoutingProvider('K', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(down.matrix(origins, { lat: 1, lng: 1 }, profile, { signal })).rejects.toMatchObject({ kind: 'UPSTREAM_5XX' });
  });

  it('never leaks the API key in error messages', async () => {
    const p = new GoogleRoutingProvider('SECRET-KEY', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    const err = await p.geocode(dest, { signal }).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain('SECRET-KEY');
  });
});

describe('Geoapify provider', () => {
  it('maps confidence and result type to quality', async () => {
    const p = new GeoapifyRoutingProvider(
      'K',
      vi.fn().mockResolvedValue(json({ results: [{ lat: 1, lon: 2, result_type: 'building', rank: { confidence: 0.97 }, formatted: 'f' }] })),
    );
    await expect(p.geocode(dest, { signal })).resolves.toMatchObject({ location: { lat: 1, lng: 2 }, quality: 'high', formatted: 'f' });
  });

  it('trusts building/street-level confidence when only the postcode disagrees', async () => {
    const rank = (r: Record<string, number>, type = 'building') =>
      new GeoapifyRoutingProvider('K', vi.fn().mockResolvedValue(json({ results: [{ lat: 1, lon: 2, result_type: type, rank: r }] }))).geocode(dest, { signal });
    await expect(rank({ confidence: 0.25, confidence_street_level: 1, confidence_building_level: 1 })).resolves.toMatchObject({ quality: 'high' });
    await expect(rank({ confidence: 0.5, confidence_street_level: 1, confidence_building_level: 0 })).resolves.toMatchObject({ quality: 'medium' });
    await expect(rank({ confidence: 0.25 }, 'postcode')).resolves.toMatchObject({ quality: 'low' });
  });

  it('leaves subdivision codes out of the geocoding text but keeps names', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) => json({ results: [{ lat: 1, lon: 2, result_type: 'building', rank: { confidence: 1 } }] }));
    const p = new GeoapifyRoutingProvider('K', fetchMock);
    const lagos = { addressLine1: '25 Allen Avenue', city: 'Ikeja', postalCode: '100271', country: 'NG' };
    await p.geocode(normalizeAddress({ ...lagos, subdivision: 'NG-LA' }), { signal });
    await p.geocode(normalizeAddress({ ...lagos, subdivision: 'Lagos' }), { signal });
    const texts = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('text'));
    expect(texts).toEqual(['25 Allen Avenue, Ikeja, 100271, NG', '25 Allen Avenue, Ikeja, LAGOS 100271, NG']);
  });

  it('treats empty results as a bad address', async () => {
    const p = new GeoapifyRoutingProvider('K', vi.fn().mockResolvedValue(json({ results: [] })));
    await expect(p.geocode(dest, { signal })).rejects.toMatchObject({ kind: 'BAD_ADDRESS' });
  });

  it('parses sources_to_targets with null routes', async () => {
    const p = new GeoapifyRoutingProvider(
      'K',
      vi.fn().mockResolvedValue(json({ sources_to_targets: [[{ distance: 1000, time: 60 }], [{ distance: null, time: null }]] })),
    );
    await expect(p.matrix([origins[0], origins[0]], { lat: 1, lng: 1 }, profile, { signal })).resolves.toEqual([
      { distanceMeters: 1000, durationSeconds: 60 },
      null,
    ]);
  });
});

describe('provider factory', () => {
  it('refuses to run without a key', () => {
    expect(() => createRoutingProvider('google', undefined)).toThrow(RoutingError);
    expect(() => createRoutingProvider('nope', 'k')).toThrow(/Unknown/);
  });
});

describe('withRetry', () => {
  const noSleep = { sleep: async () => undefined, random: () => 0.5 };

  it('retries retryable errors then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new RoutingError('UPSTREAM_5XX', 'x')).mockResolvedValueOnce('ok');
    await expect(withRetry(fn, { attemptTimeoutMs: 500, maxAttempts: 2, baseDelayMs: 10, ...noSleep }, deadline())).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new RoutingError('AUTH', 'x'));
    await expect(withRetry(fn, { attemptTimeoutMs: 500, maxAttempts: 3, baseDelayMs: 10, ...noSleep }, deadline())).rejects.toMatchObject({ kind: 'AUTH' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('times out slow attempts and stops at the deadline', async () => {
    const fn = vi.fn((s: AbortSignal) => new Promise((_, reject) => s.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const started = Date.now();
    await expect(withRetry(fn, { attemptTimeoutMs: 150, maxAttempts: 5, baseDelayMs: 1, ...noSleep }, deadline(400))).rejects.toMatchObject({ kind: 'TIMEOUT' });
    expect(Date.now() - started).toBeLessThan(800);
  });

  it('never starts an attempt when the budget is exhausted', async () => {
    const fn = vi.fn();
    await expect(withRetry(fn, { attemptTimeoutMs: 500, maxAttempts: 2, baseDelayMs: 1 }, deadline(50))).rejects.toMatchObject({ kind: 'TIMEOUT' });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('resolveRoutes', () => {
  beforeEach(() => __resetInFlight());

  function fakeProvider(overrides: Partial<RoutingProvider> = {}): RoutingProvider & { geocode: ReturnType<typeof vi.fn>; matrix: ReturnType<typeof vi.fn> } {
    return {
      id: 'google',
      version: 't1',
      geocode: vi.fn().mockResolvedValue({ location: { lat: 1, lng: 1 }, quality: 'high', formatted: '' }),
      matrix: vi.fn().mockResolvedValue([{ distanceMeters: 16093.44, durationSeconds: 600 }]),
      ...overrides,
    } as never;
  }

  const base = (provider: RoutingProvider, cache = new MemoryCache()) => ({
    provider,
    destination: dest,
    origins,
    profile,
    strictness: 'standard' as const,
    settingsVersion: 1,
    cacheTtlMs: 3_600_000,
    deadline: deadline(),
    cache,
    policy: { baseDelayMs: 1 },
  });

  it('calls the provider once and serves repeats from cache', async () => {
    const provider = fakeProvider();
    const cache = new MemoryCache();
    const first = await resolveRoutes(base(provider, cache));
    const second = await resolveRoutes(base(provider, cache));
    expect(first).toMatchObject({ ok: true, cacheHit: false, providerCalls: 2 });
    expect(second).toMatchObject({ ok: true, cacheHit: true, providerCalls: 0 });
    expect(provider.geocode).toHaveBeenCalledTimes(1);
  });

  it('stores no shopper address or coordinates in the cache', async () => {
    const cache = new MemoryCache();
    await resolveRoutes(base(fakeProvider(), cache));
    const serialized = JSON.stringify([...cache.store.entries()]);
    expect(serialized).not.toMatch(/Congress|78701/i);
    expect(cache.sets[0].key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('de-duplicates parallel identical lookups', async () => {
    const slowGeocode = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve({ location: { lat: 1, lng: 1 }, quality: 'high', formatted: '' }), 50)),
    );
    const provider = fakeProvider({ geocode: slowGeocode } as never);
    // Separate (empty) caches: only in-flight de-duplication can prevent extra provider calls.
    const results = await Promise.all([resolveRoutes(base(provider)), resolveRoutes(base(provider)), resolveRoutes(base(provider))]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(provider.geocode).toHaveBeenCalledTimes(1);
  });

  it('rejects low-confidence geocodes and negative-caches them', async () => {
    const provider = fakeProvider({ geocode: vi.fn().mockResolvedValue({ location: { lat: 1, lng: 1 }, quality: 'low', formatted: '' }) } as never);
    const cache = new MemoryCache();
    const res = await resolveRoutes(base(provider, cache));
    expect(res).toMatchObject({ ok: false });
    expect(!res.ok && res.error.kind).toBe('LOW_CONFIDENCE');
    expect(provider.matrix).not.toHaveBeenCalled();
    const again = await resolveRoutes(base(provider, cache));
    expect(again.cacheHit).toBe(true);
  });

  it('returns NO_ROUTE when no origin can reach the destination', async () => {
    const res = await resolveRoutes(base(fakeProvider({ matrix: vi.fn().mockResolvedValue([null]) } as never)));
    expect(!res.ok && res.error.kind).toBe('NO_ROUTE');
  });

  it('records each attempt with its error when tracing', async () => {
    const trace: import('./service').RouteTraceEntry[] = [];
    const provider = fakeProvider({
      geocode: vi.fn().mockRejectedValueOnce(new RoutingError('TIMEOUT', 't')).mockResolvedValue({ location: { lat: 1, lng: 1 }, quality: 'high', formatted: '' }),
    } as never);
    const res = await resolveRoutes({ ...base(provider), trace });
    expect(res.ok).toBe(true);
    expect(trace.map((x) => [x.step, x.attempt, x.error])).toEqual([
      ['geocode', 1, 'TIMEOUT'],
      ['geocode', 2, null],
      ['matrix', 1, null],
    ]);
  });

  it('does not cache outages', async () => {
    const cache = new MemoryCache();
    const provider = fakeProvider({ geocode: vi.fn().mockRejectedValue(new RoutingError('UPSTREAM_5XX', 'down')) } as never);
    const res = await resolveRoutes(base(provider, cache));
    expect(!res.ok && res.error.kind).toBe('UPSTREAM_5XX');
    expect(cache.sets).toHaveLength(0);
    expect(provider.geocode).toHaveBeenCalledTimes(2);
  });

  it('changes cache key when settings version or origins change', async () => {
    const provider = fakeProvider();
    const a = await routeCacheKey(base(provider));
    const b = await routeCacheKey({ ...base(provider), settingsVersion: 2 });
    const c = await routeCacheKey({ ...base(provider), origins: [{ id: 'loc-1', lat: 30.3, lng: -97.7 }] });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('respects a disabled cache (TTL 0)', async () => {
    const cache = new MemoryCache();
    await resolveRoutes({ ...base(fakeProvider(), cache), cacheTtlMs: 0 });
    expect(cache.sets).toHaveLength(0);
  });
});

describe('default fetch binding', () => {
  // Cloudflare Workers (Wix hosting) throws "Illegal invocation" when fetch is called with a foreign receiver.
  function workersLikeFetch(body: unknown) {
    return vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) return Promise.reject(new TypeError('Illegal invocation'));
      return Promise.resolve(json(body));
    });
  }

  it('calls the global fetch with a valid receiver from every provider', async () => {
    const geo = { results: [{ lat: 30.2, lon: -97.7, result_type: 'building', rank: { confidence: 1 } }] };
    vi.stubGlobal('fetch', workersLikeFetch(geo));
    try {
      await expect(createRoutingProvider('geoapify', 'k').geocode(dest, { signal })).resolves.toMatchObject({ quality: 'high' });
      vi.stubGlobal('fetch', workersLikeFetch({ status: 'OK', results: [{ geometry: { location: { lat: 1, lng: 1 }, location_type: 'ROOFTOP' }, types: ['street_address'], formatted_address: '' }] }));
      await expect(createRoutingProvider('google', 'k').geocode(dest, { signal })).resolves.toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
