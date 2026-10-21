/**
 * Shared plumbing for dashboard API routes:
 *  - authenticates the caller from the Wix access token (`auth.getTokenInfo()`),
 *    accepting only active Wix *users* with an app instance in context
 *  - derives the tenant from the token, never from the request
 *  - validates bodies/queries with Zod, enforces a body size limit
 *  - returns consistent JSON errors without stack traces
 */
import type { APIContext, APIRoute } from 'astro';
import { auth } from '@wix/essentials';
import { z, ZodError, type ZodType } from 'zod';
import { createRepositories, TenantError, type Repositories } from '../data/repositories';
import { wixGateway } from '../data/wix-gateway';
import { ApiError } from './errors';

export { ApiError };

export const MAX_BODY_BYTES = 32 * 1024;

export interface Caller {
  instanceId: string;
  userId: string;
}

export interface ApiContext {
  ctx: APIContext;
  caller: Caller;
  repos: Repositories;
}

export type TokenInfoReader = () => Promise<{
  active: boolean;
  subjectType: string;
  subjectId: string;
  instanceId?: string;
}>;

let readTokenInfo: TokenInfoReader = () => auth.getTokenInfo();

/** Test hook. */
export function __setTokenInfoReader(reader: TokenInfoReader): void {
  readTokenInfo = reader;
}

export async function authenticate(): Promise<Caller> {
  let info: Awaited<ReturnType<TokenInfoReader>>;
  try {
    info = await readTokenInfo();
  } catch {
    throw new ApiError(401, 'unauthenticated');
  }
  if (!info?.active) throw new ApiError(401, 'unauthenticated');
  // Dashboard pages run as the Wix user (site owner or collaborator). Visitors, members and apps are rejected.
  if (info.subjectType !== 'USER') throw new ApiError(403, 'forbidden');
  if (!info.instanceId) throw new ApiError(403, 'no_instance');
  return { instanceId: info.instanceId, userId: info.subjectId };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large');
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
  return schema.parse(raw);
}

export function readQuery<T>(request: Request, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(request.url).searchParams));
}

export const idParam = z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);

/** Wix SDK errors carry the platform status under details.applicationError.code. */
export function wixStatusOf(err: unknown): number | null {
  const code = (err as { details?: { applicationError?: { code?: unknown } } } | null)?.details?.applicationError?.code;
  return typeof code === 'number' ? code : null;
}

export function errorResponse(err: unknown): Response {
  // A Wix API refused the app: a permission scope is missing or the site hasn't approved the latest scopes.
  if (wixStatusOf(err) === 403) return json({ error: { code: 'wix_permission_missing', details: null } }, 403);
  if (err instanceof ApiError) return json({ error: { code: err.code, details: err.details ?? null } }, err.status);
  if (err instanceof ZodError) {
    return json(
      {
        error: {
          code: 'validation_failed',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      400,
    );
  }
  if (err instanceof TenantError) return json({ error: { code: 'not_found', details: null } }, 404);
  console.error(JSON.stringify({ evt: 'api_error', name: err instanceof Error ? err.name : 'unknown' }));
  return json({ error: { code: 'internal', details: null } }, 500);
}

/** Wraps a route: authenticate → scope repositories to the caller's instance → run → map errors. */
export function route(fn: (c: ApiContext) => Promise<Response>): APIRoute {
  return async (ctx) => {
    try {
      const caller = await authenticate();
      return await fn({ ctx, caller, repos: createRepositories(wixGateway, caller.instanceId) });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Best-effort per-instance rate limiting for endpoints that cost provider calls.
// In-memory per isolate: it slows abuse; the monthly usage cap is the hard limit.
// ---------------------------------------------------------------------------
const buckets = new Map<string, { tokens: number; updated: number }>();

export function rateLimit(key: string, capacity: number, refillPerMinute: number, now = Date.now()): void {
  const bucket = buckets.get(key) ?? { tokens: capacity, updated: now };
  const refill = ((now - bucket.updated) / 60_000) * refillPerMinute;
  bucket.tokens = Math.min(capacity, bucket.tokens + refill);
  bucket.updated = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    throw new ApiError(429, 'rate_limited');
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
}

export function __resetRateLimits(): void {
  buckets.clear();
}
