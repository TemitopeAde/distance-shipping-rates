import type { GeocodeQuality } from '../validation/schemas';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Address normalized for geocoding. Country is ISO 3166-1 alpha-2. */
export interface NormalizedAddress {
  addressLine1: string;
  addressLine2: string;
  city: string;
  subdivision: string;
  postalCode: string;
  country: string;
}

export interface GeocodeResult {
  location: LatLng;
  quality: GeocodeQuality;
  formatted: string;
  /** PII-free summary of how the provider matched (result type and scores), for logs. */
  match?: string;
}

export interface RouteProfile {
  avoidTolls: boolean;
  avoidHighways: boolean;
}

/** One cell per origin; null when no drivable route exists. */
export interface MatrixCell {
  distanceMeters: number;
  durationSeconds: number | null;
}

export interface CallOptions {
  signal: AbortSignal;
}

export interface RoutingProvider {
  readonly id: 'google' | 'geoapify';
  /** Bumped when parsing/semantics change so cached results from older versions are ignored. */
  readonly version: string;
  geocode(address: NormalizedAddress, opts: CallOptions): Promise<GeocodeResult>;
  /** Driving distances from each origin to one destination. */
  matrix(origins: LatLng[], destination: LatLng, profile: RouteProfile, opts: CallOptions): Promise<(MatrixCell | null)[]>;
}
