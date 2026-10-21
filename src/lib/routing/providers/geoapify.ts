/**
 * Geoapify adapter.
 *  - Forward geocoding: https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/
 *  - Route matrix: https://apidocs.geoapify.com/docs/route-matrix/
 */
import type { GeocodeQuality } from '../../validation/schemas';
import { classifyHttpStatus, RoutingError } from '../errors';
import { globalFetch } from '../fetch';
import { toSingleLine } from '../address';
import type { CallOptions, GeocodeResult, LatLng, MatrixCell, NormalizedAddress, RouteProfile, RoutingProvider } from '../types';

type FetchLike = typeof fetch;

interface GeoapifyGeocodeResponse {
  results?: Array<{
    lat?: number;
    lon?: number;
    formatted?: string;
    result_type?: string;
    state_code?: string;
    rank?: { confidence?: number; confidence_street_level?: number; confidence_building_level?: number };
  }>;
}

interface GeoapifyMatrixResponse {
  sources_to_targets?: Array<Array<{ distance?: number | null; time?: number | null; source_index?: number } | null>>;
}

type GeoapifyRank = NonNullable<NonNullable<GeoapifyGeocodeResponse['results']>[number]['rank']>;

/**
 * Overall `confidence` drops when any input part disagrees, e.g. a mistyped postcode on an exact
 * building match (common for Nigerian addresses). The building/street-level scores say whether the
 * part that matters for routing matched, so either one can vouch for the result.
 */
function qualityOf(resultType: string | undefined, rank: GeoapifyRank | undefined): GeocodeQuality {
  const overall = rank?.confidence ?? 0;
  const building = Math.max(overall, rank?.confidence_building_level ?? 0);
  const street = Math.max(overall, rank?.confidence_street_level ?? 0);
  if ((resultType === 'building' || resultType === 'amenity') && building >= 0.9) return 'high';
  if ((resultType === 'building' || resultType === 'amenity' || resultType === 'street') && street >= 0.7) return 'medium';
  return 'low';
}

export class GeoapifyRoutingProvider implements RoutingProvider {
  readonly id = 'geoapify' as const;
  readonly version = 'ga2';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = globalFetch,
  ) {}

  async geocode(address: NormalizedAddress, { signal }: CallOptions): Promise<GeocodeResult> {
    const params = new URLSearchParams({
      text: toSingleLine(address),
      filter: `countrycode:${address.country.toLowerCase()}`,
      format: 'json',
      limit: '1',
      apiKey: this.apiKey,
    });
    const res = await this.fetchImpl(`https://api.geoapify.com/v1/geocode/search?${params}`, { signal });
    if (!res.ok) throw new RoutingError(classifyHttpStatus(res.status), `Geocoding HTTP ${res.status}`, res.status);
    const body = (await res.json()) as GeoapifyGeocodeResponse;
    const first = body.results?.[0];
    if (!first) throw new RoutingError('BAD_ADDRESS', 'Geocoding returned no results');
    if (!Number.isFinite(first.lat) || !Number.isFinite(first.lon)) throw new RoutingError('BAD_RESPONSE', 'Geocoding returned no coordinates');
    return {
      location: { lat: first.lat as number, lng: first.lon as number },
      quality: qualityOf(first.result_type, first.rank),
      formatted: first.formatted ?? '',
      match: [
        first.result_type ?? 'unknown',
        `conf=${first.rank?.confidence ?? '-'}`,
        `street=${first.rank?.confidence_street_level ?? '-'}`,
        `building=${first.rank?.confidence_building_level ?? '-'}`,
        // Whether the result landed in the requested state/region (e.g. "LA" for NG-LA); no address text.
        `state=${first.state_code ?? '-'}`,
      ].join(' '),
    };
  }

  async matrix(origins: LatLng[], destination: LatLng, profile: RouteProfile, { signal }: CallOptions): Promise<(MatrixCell | null)[]> {
    const avoid = [
      ...(profile.avoidTolls ? [{ type: 'tolls' }] : []),
      ...(profile.avoidHighways ? [{ type: 'highways' }] : []),
    ];
    const res = await this.fetchImpl(`https://api.geoapify.com/v1/routematrix?apiKey=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'drive',
        sources: origins.map((o) => ({ location: [o.lng, o.lat] })),
        targets: [{ location: [destination.lng, destination.lat] }],
        ...(avoid.length > 0 ? { avoid } : {}),
      }),
    });
    if (!res.ok) {
      const kind = classifyHttpStatus(res.status);
      throw new RoutingError(kind === 'BAD_ADDRESS' ? 'BAD_RESPONSE' : kind, `Route matrix HTTP ${res.status}`, res.status);
    }
    const body = (await res.json()) as GeoapifyMatrixResponse;
    const rows = body.sources_to_targets;
    if (!Array.isArray(rows)) throw new RoutingError('BAD_RESPONSE', 'Route matrix missing sources_to_targets');
    return origins.map((_, i) => {
      const cell = rows[i]?.[0];
      const d = cell?.distance;
      if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) return null;
      const t = cell?.time;
      return { distanceMeters: d, durationSeconds: typeof t === 'number' && Number.isFinite(t) ? t : null };
    });
  }
}
