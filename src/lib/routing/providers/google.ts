/**
 * Google Maps Platform adapter.
 *  - Geocoding API: https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 *  - Routes API computeRouteMatrix: https://developers.google.com/maps/documentation/routes/compute_route_matrix
 */
import type { GeocodeQuality } from '../../validation/schemas';
import { classifyHttpStatus, RoutingError } from '../errors';
import { globalFetch } from '../fetch';
import { toSingleLine } from '../address';
import type { CallOptions, GeocodeResult, LatLng, MatrixCell, NormalizedAddress, RouteProfile, RoutingProvider } from '../types';

type FetchLike = typeof fetch;

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    formatted_address?: string;
    partial_match?: boolean;
    types?: string[];
    geometry?: { location?: { lat: number; lng: number }; location_type?: string };
  }>;
}

interface GoogleMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: { code?: number; message?: string };
  condition?: string;
  distanceMeters?: number;
  duration?: string;
}

const COARSE_TYPES = new Set(['country', 'administrative_area_level_1', 'administrative_area_level_2', 'locality', 'postal_code', 'colloquial_area']);

function qualityOf(result: NonNullable<GoogleGeocodeResponse['results']>[number]): GeocodeQuality {
  const type = result.geometry?.location_type;
  let quality: GeocodeQuality =
    type === 'ROOFTOP' || type === 'RANGE_INTERPOLATED' ? 'high' : type === 'GEOMETRIC_CENTER' ? 'medium' : 'low';
  const types = result.types ?? [];
  if (types.length > 0 && types.every((t) => COARSE_TYPES.has(t) || t === 'political')) quality = 'low';
  if (result.partial_match && quality === 'high') quality = 'medium';
  else if (result.partial_match) quality = 'low';
  return quality;
}

export class GoogleRoutingProvider implements RoutingProvider {
  readonly id = 'google' as const;
  readonly version = 'g2';

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = globalFetch,
  ) {}

  async geocode(address: NormalizedAddress, { signal }: CallOptions): Promise<GeocodeResult> {
    const params = new URLSearchParams({
      address: toSingleLine(address),
      components: `country:${address.country}`,
      key: this.apiKey,
    });
    const res = await this.fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { signal });
    if (!res.ok) throw new RoutingError(classifyHttpStatus(res.status), `Geocoding HTTP ${res.status}`, res.status);
    const body = (await res.json()) as GoogleGeocodeResponse;
    switch (body.status) {
      case 'OK':
        break;
      case 'ZERO_RESULTS':
      case 'INVALID_REQUEST':
        throw new RoutingError('BAD_ADDRESS', `Geocoding ${body.status}`);
      case 'OVER_QUERY_LIMIT':
        throw new RoutingError('RATE_LIMITED', 'Geocoding OVER_QUERY_LIMIT');
      case 'OVER_DAILY_LIMIT':
        throw new RoutingError('QUOTA_EXCEEDED', 'Geocoding OVER_DAILY_LIMIT');
      case 'REQUEST_DENIED':
        throw new RoutingError('AUTH', 'Geocoding REQUEST_DENIED');
      default:
        throw new RoutingError('UPSTREAM_5XX', `Geocoding ${body.status}`);
    }
    const first = body.results?.[0];
    const loc = first?.geometry?.location;
    if (!first || !loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      throw new RoutingError('BAD_RESPONSE', 'Geocoding returned no coordinates');
    }
    return {
      location: { lat: loc.lat, lng: loc.lng },
      quality: qualityOf(first),
      formatted: first.formatted_address ?? '',
      match: `${first.geometry?.location_type ?? 'unknown'}${first.partial_match ? ' partial' : ''}`,
    };
  }

  async matrix(origins: LatLng[], destination: LatLng, profile: RouteProfile, { signal }: CallOptions): Promise<(MatrixCell | null)[]> {
    const latLng = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const body = {
      origins: origins.map((o) => ({
        waypoint: latLng(o),
        routeModifiers: { avoidTolls: profile.avoidTolls, avoidHighways: profile.avoidHighways },
      })),
      destinations: [{ waypoint: latLng(destination) }],
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    };
    const res = await this.fetchImpl('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const kind = res.status === 429 && /quota/i.test(text) ? 'QUOTA_EXCEEDED' : classifyHttpStatus(res.status);
      throw new RoutingError(kind === 'BAD_ADDRESS' ? 'BAD_RESPONSE' : kind, `Route matrix HTTP ${res.status}`, res.status);
    }
    const elements = parseElements(text);
    const cells: (MatrixCell | null)[] = origins.map(() => null);
    for (const el of elements) {
      const i = el.originIndex ?? 0;
      if (i < 0 || i >= cells.length) continue;
      if (el.status?.code) continue;
      if (el.condition !== 'ROUTE_EXISTS') continue;
      if (typeof el.distanceMeters !== 'number' || !Number.isFinite(el.distanceMeters) || el.distanceMeters < 0) continue;
      const seconds = el.duration ? Number.parseFloat(el.duration) : Number.NaN;
      cells[i] = { distanceMeters: el.distanceMeters, durationSeconds: Number.isFinite(seconds) ? seconds : null };
    }
    return cells;
  }
}

/** REST responses are a JSON array; tolerate newline-delimited elements as well. */
function parseElements(text: string): GoogleMatrixElement[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as GoogleMatrixElement[]) : [parsed as GoogleMatrixElement];
  } catch {
    return trimmed
      .split('\n')
      .map((line) => line.trim().replace(/^[[,]|[\],]$/g, ''))
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as GoogleMatrixElement;
        } catch {
          throw new RoutingError('BAD_RESPONSE', 'Unparseable route matrix response');
        }
      });
  }
}
