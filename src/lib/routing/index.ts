import { RoutingError } from './errors';
import { globalFetch } from './fetch';
import { GeoapifyRoutingProvider } from './providers/geoapify';
import { GoogleRoutingProvider } from './providers/google';
import type { RoutingProvider } from './types';

export type ProviderId = 'google' | 'geoapify';

export function createRoutingProvider(id: string, apiKey: string | undefined, fetchImpl: typeof fetch = globalFetch): RoutingProvider {
  if (!apiKey) throw new RoutingError('NOT_CONFIGURED', 'Routing API key is not configured');
  if (id === 'geoapify') return new GeoapifyRoutingProvider(apiKey, fetchImpl);
  if (id === 'google') return new GoogleRoutingProvider(apiKey, fetchImpl);
  throw new RoutingError('NOT_CONFIGURED', `Unknown routing provider "${id}"`);
}

export * from './types';
export * from './errors';
export * from './service';
export * from './address';
