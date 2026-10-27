import { describe, expect, it } from 'vitest';
import { makeLocation, makeRule } from '../../../tests/fixtures';
import { COLLECTIONS } from './gateway';
import { MemoryGateway } from './memory-gateway';
import { createRepositories, TenantError } from './repositories';

const strip = <T extends { id: string }>(e: T): Omit<T, 'id'> => {
  const { id: _id, ...rest } = e;
  return rest;
};

describe('tenant isolation', () => {
  it('refuses to operate without an instance ID', () => {
    expect(() => createRepositories(new MemoryGateway(), '')).toThrow(TenantError);
  });

  it('never lists or reads another instance’s rows', async () => {
    const gw = new MemoryGateway();
    const a = createRepositories(gw, 'instance-a');
    const b = createRepositories(gw, 'instance-b');
    const ruleA = await a.rules.upsert(strip(makeRule()));
    await b.rules.upsert(strip(makeRule({ title: 'B rule' })));

    expect((await a.rules.list()).map((r) => r.title)).toEqual(['Local delivery']);
    expect(await b.rules.get(ruleA.id)).toBeNull();
  });

  it('cannot update or delete another instance’s rows by ID', async () => {
    const gw = new MemoryGateway();
    const a = createRepositories(gw, 'instance-a');
    const b = createRepositories(gw, 'instance-b');
    const loc = await a.locations.upsert(strip(makeLocation()));

    await expect(b.locations.upsert(strip(makeLocation({ name: 'hijack' })), loc.id)).rejects.toThrow(TenantError);
    expect(await b.locations.remove(loc.id)).toBe(false);
    expect((await a.locations.get(loc.id))?.name).toBe('Main store');
  });

  it('isolates settings, billing and cache rows', async () => {
    const gw = new MemoryGateway();
    const a = createRepositories(gw, 'instance-a');
    const b = createRepositories(gw, 'instance-b');
    await a.settings.save({ ...(await a.settings.get()), unit: 'km' });
    expect((await b.settings.get()).unit).toBe('mi');

    await a.routeCache.set('k', { status: 'error', kind: 'NO_ROUTE' }, 60_000);
    expect(await b.routeCache.get('k')).toBeNull();
    expect(await a.routeCache.get('k')).toEqual({ status: 'error', kind: 'NO_ROUTE' });
  });
});

describe('settings versioning', () => {
  it('bumps the settings version', async () => {
    const repos = createRepositories(new MemoryGateway(), 'i');
    const v1 = (await repos.settings.get()).settingsVersion;
    expect((await repos.settings.bumpVersion()).settingsVersion).toBe(v1 + 1);
  });

  it('fills defaults for fields missing from older rows', async () => {
    const gw = new MemoryGateway();
    await gw.save(COLLECTIONS.settings, { _id: 'i', instanceId: 'i', payload: { unit: 'km', settingsVersion: 4 }, schemaVersion: 1 });
    const s = await createRepositories(gw, 'i').settings.get();
    expect(s.unit).toBe('km');
    expect(s.settingsVersion).toBe(4);
    expect(s.failureMode).toBe('fail_closed');
  });
});

describe('route cache expiry', () => {
  it('ignores and purges expired entries', async () => {
    const gw = new MemoryGateway();
    const repos = createRepositories(gw, 'i');
    await repos.routeCache.set('old', { status: 'error', kind: 'NO_ROUTE' }, -1000);
    expect(await repos.routeCache.get('old')).toBeNull();
    expect(await repos.routeCache.purgeExpired(new Date())).toBe(1);
  });
});

describe('event de-duplication', () => {
  it('claims a key only once', async () => {
    const repos = createRepositories(new MemoryGateway(), 'i');
    expect(await repos.eventDedupe.claim('evt-1', 'PaidPlanPurchased')).toBe(true);
    expect(await repos.eventDedupe.claim('evt-1', 'PaidPlanPurchased')).toBe(false);
  });
});

describe('calculation logs', () => {
  it('pages newest first and purges by retention', async () => {
    const repos = createRepositories(new MemoryGateway(), 'i');
    const base = {
      source: 'checkout' as const,
      status: 'priced' as const,
      reason: '',
      providerError: '',
      cacheHit: false,
      providerCalls: 2,
      latencyMs: 300,
      distance: 10,
      unit: 'mi',
      originLocationId: 'loc',
      optionCodes: 'local',
      price: '25.00',
      currency: 'USD',
      destCountry: 'US',
      destPostalPrefix: '787',
      requestRef: 'r',
      details: null,
    };
    await repos.logs.insert({ ...base, createdAt: '2026-01-01T00:00:00Z' });
    await repos.logs.insert({ ...base, status: 'no_rate', createdAt: '2026-10-01T00:00:00Z' });
    const page = await repos.logs.page({ page: 0, pageSize: 10 });
    expect(page.rows.map((r) => r.status)).toEqual(['no_rate', 'priced']);
    expect(page.total).toBe(2);
    expect(await repos.logs.purgeOlderThan(new Date('2026-06-01T00:00:00Z'))).toBe(1);
  });
});
