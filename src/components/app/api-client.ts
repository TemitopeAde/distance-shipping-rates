/**
 * Browser → backend calls. `fetchWithAuth` attaches the Wix user's access
 * token; the backend derives the tenant from it.
 */
import { httpClient } from '@wix/essentials';

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: unknown = null,
  ) {
    super(code);
    this.name = 'ClientApiError';
  }
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

let fetcher: Fetcher = (url, init) => httpClient.fetchWithAuth(url, init);

/** Test hook. */
export function __setFetcher(f: Fetcher): void {
  fetcher = f;
}

// Resolve against the extension module origin, not the hosting page (see Wix BACKEND_API guidance).
// Keep the base in a variable: Vite rewrites `new URL(<template literal>, import.meta.url)` as a bundled
// asset lookup, which turns every API call into `/_astro/undefined` in production builds.
const MODULE_URL = import.meta.url;

export function endpoint(path: string): string {
  return new URL(`/api/${path}`, MODULE_URL).href;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetcher(endpoint(path), {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ClientApiError(0, 'network');
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const err = (payload as { error?: { code?: string; details?: unknown } } | null)?.error;
    throw new ClientApiError(res.status, err?.code ?? 'internal', err?.details ?? null);
  }
  return payload as T;
}
