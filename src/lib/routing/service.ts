/**
 * Resolves road distances from candidate origins to a shopper destination,
 * with privacy-preserving caching, in-flight de-duplication and a strict
 * time budget. Never substitutes straight-line distance.
 */
import type { GeocodeQuality } from '../validation/schemas';
import { canonicalAddressKey } from './address';
import { RoutingError, type RoutingErrorKind } from './errors';
import { withRetry, type Deadline, type RetryPolicy } from './resilience';
import type { LatLng, MatrixCell, NormalizedAddress, RouteProfile, RoutingProvider } from './types';

export interface OriginPoint extends LatLng {
  id: string;
}

export interface RouteCell extends MatrixCell {
  locationId: string;
}

/**
 * What the cache stores: hashed key → distances per origin. No coordinates or
 * address text of the shopper are persisted.
 */
export type CachedRoutes =
  | { status: 'ok'; quality: GeocodeQuality; cells: Record<string, MatrixCell | null> }
  | { status: 'error'; kind: Extract<RoutingErrorKind, 'BAD_ADDRESS' | 'LOW_CONFIDENCE' | 'NO_ROUTE'> };

export interface RouteCacheStore {
  get(key: string): Promise<CachedRoutes | null>;
  set(key: string, value: CachedRoutes, ttlMs: number): Promise<void>;
}

export interface ResolveParams {
  provider: RoutingProvider;
  destination: NormalizedAddress;
  origins: OriginPoint[];
  profile: RouteProfile;
  strictness: 'strict' | 'standard';
  settingsVersion: number;
  cacheTtlMs: number;
  deadline: Deadline;
  cache: RouteCacheStore;
  /** False when the monthly lookup allowance is spent: cache hits still work, misses fail with QUOTA_EXCEEDED. */
  allowProviderCalls?: boolean;
  policy?: Partial<RetryPolicy>;
  /** When provided, each provider attempt is recorded (used by the simulator for diagnostics). */
  trace?: RouteTraceEntry[];
}

export interface RouteTraceEntry {
  step: 'geocode' | 'matrix';
  attempt: number;
  ms: number;
  error: RoutingErrorKind | null;
  /** Provider HTTP status, when the failure came from an HTTP response. */
  httpStatus: number | null;
  /** RoutingError message; these never contain API keys or full addresses. */
  message: string | null;
  /** Provider match summary on a successful geocode, e.g. "building conf=0.25 street=1 building=1 → low". */
  match?: string | null;
}

export type RouteResolution =
  | { ok: true; cells: (RouteCell | null)[]; quality: GeocodeQuality; cacheHit: boolean; providerCalls: number }
  | { ok: false; error: RoutingError; cacheHit: boolean; providerCalls: number };

/** Negative results (bad address) are cached briefly to stop repeated paid lookups. */
export const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

export const DEFAULT_POLICY: RetryPolicy = { attemptTimeoutMs: 1500, maxAttempts: 2, baseDelayMs: 150 };

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function routeCacheKey(p: Pick<ResolveParams, 'provider' | 'destination' | 'origins' | 'profile' | 'strictness' | 'settingsVersion'>): Promise<string> {
  const origins = [...p.origins]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((o) => [o.id, o.lat.toFixed(6), o.lng.toFixed(6)]);
  return sha256Hex(
    JSON.stringify([
      'routes',
      p.provider.id,
      p.provider.version,
      p.strictness,
      p.profile.avoidTolls,
      p.profile.avoidHighways,
      p.settingsVersion,
      canonicalAddressKey(p.destination),
      origins,
    ]),
  );
}

function acceptable(quality: GeocodeQuality, strictness: 'strict' | 'standard'): boolean {
  return strictness === 'strict' ? quality === 'high' : quality !== 'low';
}

function fromCache(cached: CachedRoutes, origins: OriginPoint[]): RouteResolution {
  if (cached.status === 'error') {
    return { ok: false, error: new RoutingError(cached.kind, `Cached ${cached.kind}`), cacheHit: true, providerCalls: 0 };
  }
  const cells = origins.map((o) => {
    const c = cached.cells[o.id];
    return c ? { locationId: o.id, ...c } : null;
  });
  return { ok: true, cells, quality: cached.quality, cacheHit: true, providerCalls: 0 };
}

const inFlight = new Map<string, Promise<RouteResolution>>();

export async function resolveRoutes(params: ResolveParams): Promise<RouteResolution> {
  if (params.origins.length === 0) {
    return { ok: false, error: new RoutingError('NOT_CONFIGURED', 'No routable origins'), cacheHit: false, providerCalls: 0 };
  }
  const key = await routeCacheKey(params);

  // Register synchronously after the key is known so parallel identical calls share one lookup.
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = cachedOrLookup(params, key).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function cachedOrLookup(params: ResolveParams, key: string): Promise<RouteResolution> {
  const cached = await params.cache.get(key).catch(() => null);
  if (cached) return fromCache(cached, params.origins);
  if (params.allowProviderCalls === false) {
    return { ok: false, error: new RoutingError('QUOTA_EXCEEDED', 'Monthly lookup allowance used'), cacheHit: false, providerCalls: 0 };
  }
  return lookup(params, key);
}

async function lookup(params: ResolveParams, key: string): Promise<RouteResolution> {
  const policy: RetryPolicy = { ...DEFAULT_POLICY, ...params.policy };
  let providerCalls = 0;
  const counter = (step: RouteTraceEntry['step']) => {
    let last = Date.now();
    return (attempt: number, error?: RoutingError) => {
      providerCalls++;
      const now = Date.now();
      params.trace?.push({
        step,
        attempt,
        ms: now - last,
        error: error?.kind ?? null,
        httpStatus: error?.status ?? null,
        message: error?.message ?? null,
      });
      last = now;
    };
  };

  const cacheNegative = (kind: 'BAD_ADDRESS' | 'LOW_CONFIDENCE' | 'NO_ROUTE') =>
    params.cache.set(key, { status: 'error', kind }, NEGATIVE_CACHE_TTL_MS).catch(() => undefined);

  try {
    const geo = await withRetry((signal) => params.provider.geocode(params.destination, { signal }), policy, params.deadline, counter('geocode'));
    const geocodeEntry = params.trace?.[params.trace.length - 1];
    if (geocodeEntry) geocodeEntry.match = `${geo.match ?? 'match'} → ${geo.quality}`;
    if (!acceptable(geo.quality, params.strictness)) {
      await cacheNegative('LOW_CONFIDENCE');
      return { ok: false, error: new RoutingError('LOW_CONFIDENCE', `Geocode quality ${geo.quality}`), cacheHit: false, providerCalls };
    }
    const matrix = await withRetry(
      (signal) => params.provider.matrix(params.origins, geo.location, params.profile, { signal }),
      policy,
      params.deadline,
      counter('matrix'),
    );
    const cells: (RouteCell | null)[] = params.origins.map((o, i) => (matrix[i] ? { locationId: o.id, ...matrix[i] } : null));
    if (cells.every((c) => c === null)) {
      await cacheNegative('NO_ROUTE');
      return { ok: false, error: new RoutingError('NO_ROUTE', 'No drivable route from any origin'), cacheHit: false, providerCalls };
    }
    if (params.cacheTtlMs > 0) {
      const stored: Record<string, MatrixCell | null> = {};
      params.origins.forEach((o, i) => {
        stored[o.id] = matrix[i] ?? null;
      });
      await params.cache.set(key, { status: 'ok', quality: geo.quality, cells: stored }, params.cacheTtlMs).catch(() => undefined);
    }
    return { ok: true, cells, quality: geo.quality, cacheHit: false, providerCalls };
  } catch (err) {
    const error = err instanceof RoutingError ? err : new RoutingError('NETWORK', 'Routing failed');
    if (error.kind === 'BAD_ADDRESS') await cacheNegative('BAD_ADDRESS');
    return { ok: false, error, cacheHit: false, providerCalls };
  }
}

/** Test hook. */
export function __resetInFlight(): void {
  inFlight.clear();
}
