import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@wix/essentials', () => ({ auth: { elevate: (fn: unknown) => fn, getTokenInfo: vi.fn() } }));
vi.mock('@wix/data', () => ({ items: { get: vi.fn(), query: vi.fn(), save: vi.fn(), remove: vi.fn(), bulkRemove: vi.fn() } }));

const { __resetRateLimits, __setTokenInfoReader, authenticate, errorResponse, rateLimit, readBody, route, ApiError } = await import('./http');

const tokenFor = (overrides: Record<string, unknown> = {}) => async () =>
  ({ active: true, subjectType: 'USER', subjectId: 'user-1', instanceId: 'inst-1', ...overrides }) as never;

describe('authenticate', () => {
  it('accepts active Wix users and derives the tenant from the token', async () => {
    __setTokenInfoReader(tokenFor());
    await expect(authenticate()).resolves.toEqual({ instanceId: 'inst-1', userId: 'user-1' });
  });

  it.each([
    [{ active: false }, 401],
    [{ subjectType: 'VISITOR' }, 403],
    [{ subjectType: 'MEMBER' }, 403],
    [{ subjectType: 'APP' }, 403],
    [{ instanceId: undefined }, 403],
  ])('rejects %o with %i', async (override, status) => {
    __setTokenInfoReader(tokenFor(override));
    await expect(authenticate()).rejects.toMatchObject({ status });
  });

  it('rejects when the token cannot be read', async () => {
    __setTokenInfoReader(async () => {
      throw new Error('no token');
    });
    await expect(authenticate()).rejects.toMatchObject({ status: 401 });
  });
});

describe('route wrapper', () => {
  it('never runs the handler for unauthenticated callers', async () => {
    __setTokenInfoReader(tokenFor({ subjectType: 'VISITOR' }));
    const handler = vi.fn();
    const res = await route(handler)({ request: new Request('https://x/api') } as never);
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('scopes repositories to the token instance, ignoring instance IDs in the body', async () => {
    __setTokenInfoReader(tokenFor());
    const res = await route(async ({ repos }) => new Response(repos.instanceId))({
      request: new Request('https://x/api', { method: 'POST', body: JSON.stringify({ instanceId: 'attacker' }) }),
    } as never);
    expect(await res.text()).toBe('inst-1');
  });
});

describe('body parsing and errors', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('rejects oversized and malformed bodies', async () => {
    const big = new Request('https://x', { method: 'POST', body: 'x'.repeat(40_000) });
    await expect(readBody(big, schema)).rejects.toMatchObject({ status: 413 });
    const bad = new Request('https://x', { method: 'POST', body: '{nope' });
    await expect(readBody(bad, schema)).rejects.toMatchObject({ code: 'invalid_json' });
  });

  it('maps Zod errors to 400 with field paths and hides internal errors', async () => {
    const zodErr = (() => {
      try {
        schema.parse({ name: '' });
      } catch (e) {
        return e;
      }
    })();
    const res = errorResponse(zodErr);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { details: Array<{ path: string }> } }).error.details[0].path).toBe('name');

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const internal = errorResponse(new Error('secret stack detail'));
    expect(internal.status).toBe(500);
    expect(await internal.text()).not.toContain('secret');
    expect(errorResponse(new ApiError(409, 'conflict')).status).toBe(409);
  });

  it('maps a Wix SDK 403 to an actionable permission error', async () => {
    const wixErr = Object.assign(new Error('Forbidden'), { details: { applicationError: { code: 403, description: 'Forbidden' } } });
    const res = errorResponse(wixErr);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('wix_permission_missing');
  });
});

describe('rate limiting', () => {
  beforeEach(() => __resetRateLimits());

  it('allows bursts up to capacity then refills over time', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit('k', 3, 60, t0);
    expect(() => rateLimit('k', 3, 60, t0)).toThrow(ApiError);
    expect(() => rateLimit('k', 3, 60, t0 + 1_000)).not.toThrow();
  });
});
