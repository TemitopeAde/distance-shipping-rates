import { describe, expect, it } from 'vitest';
import { MemoryGateway } from '../data/memory-gateway';
import { createRepositories, type BillingRow } from '../data/repositories';
import { PLAN_LIMITS } from './plans';
import { recordUsage, usageThisMonth } from './usage';

const now = new Date('2026-10-15T00:00:00Z');
const empty: BillingRow = { snapshot: null, usageMonth: '', usageCount: 0, lastEventType: null, lastEventAt: null };
const read = async (repos: ReturnType<typeof createRepositories>) => (await repos.billing.get()) ?? empty;

describe('recordUsage', () => {
  it('counts one lookup per new address, however many provider calls it took', async () => {
    const repos = createRepositories(new MemoryGateway(), 'inst');
    // Geocode + matrix, with one retry.
    await recordUsage(repos, empty, 3, now);
    expect(usageThisMonth(await read(repos), now)).toBe(1);
  });

  it('does not count cache hits', async () => {
    const repos = createRepositories(new MemoryGateway(), 'inst');
    await recordUsage(repos, empty, 0, now);
    expect(usageThisMonth(await read(repos), now)).toBe(0);
  });

  it('resets each calendar month', async () => {
    const repos = createRepositories(new MemoryGateway(), 'inst');
    await recordUsage(repos, { ...empty, usageMonth: '2026-09', usageCount: 9 }, 2, now);
    expect(usageThisMonth(await read(repos), now)).toBe(1);
  });

  it('reaches the Basic allowance after 10 new addresses', async () => {
    const repos = createRepositories(new MemoryGateway(), 'inst');
    for (let i = 0; i < 10; i++) await recordUsage(repos, await read(repos), 2, now);
    expect(usageThisMonth(await read(repos), now)).toBe(PLAN_LIMITS.basic.monthlyLookups);
  });
});
