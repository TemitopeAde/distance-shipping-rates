import { describe, expect, it, vi } from 'vitest';
import { MemoryGateway } from '../data/memory-gateway';
import { createRepositories } from '../data/repositories';
import { handleLifecycleEvent, seedOnboarding } from './lifecycle';

describe('lifecycle events', () => {
  it('refreshes billing once per distinct event and skips exact redeliveries', async () => {
    const gateway = new MemoryGateway();
    const refreshBilling = vi.fn().mockResolvedValue(undefined);
    const data = { vendorProductId: 'pro', cycle: 'MONTHLY', operationTimeStamp: '2026-10-01T00:00:00Z' };
    expect(await handleLifecycleEvent('PaidPlanPurchased', 'i', data, { gateway, refreshBilling })).toBe('processed');
    expect(await handleLifecycleEvent('PaidPlanPurchased', 'i', data, { gateway, refreshBilling })).toBe('duplicate');
    expect(refreshBilling).toHaveBeenCalledTimes(1);
  });

  it('handles out-of-order events by always re-reading the source of truth', async () => {
    const gateway = new MemoryGateway();
    const refreshBilling = vi.fn().mockResolvedValue(undefined);
    await handleLifecycleEvent('PaidPlanAutoRenewalCancelled', 'i', { operationTimeStamp: '2026-10-02' }, { gateway, refreshBilling });
    await handleLifecycleEvent('PaidPlanPurchased', 'i', { operationTimeStamp: '2026-10-01' }, { gateway, refreshBilling });
    expect(refreshBilling).toHaveBeenCalledTimes(2);
  });

  it('ignores events without an instance and reports failures without throwing', async () => {
    const gateway = new MemoryGateway();
    expect(await handleLifecycleEvent('PaidPlanChanged', null, {}, { gateway, refreshBilling: vi.fn() })).toBe('ignored');
    const failing = vi.fn().mockRejectedValue(new Error('wix down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await handleLifecycleEvent('PaidPlanChanged', 'i', { x: 1 }, { gateway, refreshBilling: failing })).toBe('failed');
  });

  it('install seeds exactly one inactive demo rule', async () => {
    const gateway = new MemoryGateway();
    const deps = { gateway, refreshBilling: vi.fn().mockResolvedValue(undefined) };
    await handleLifecycleEvent('AppInstalled', 'i', { appId: 'a' }, deps);
    const repos = createRepositories(gateway, 'i');
    expect(await seedOnboarding(repos)).toBe(false);
    const rules = await repos.rules.list();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ active: false, isDemo: true });
  });

  it('uninstall marks the instance removed', async () => {
    const gateway = new MemoryGateway();
    expect(await handleLifecycleEvent('AppRemoved', 'i', { appId: 'a' }, { gateway, refreshBilling: vi.fn() })).toBe('processed');
  });
});
