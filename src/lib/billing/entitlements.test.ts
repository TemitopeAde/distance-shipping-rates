import { describe, expect, it } from 'vitest';
import { makeRule } from '../../../tests/fixtures';
import { PLAN_LIMITS, STAFF_LIMITS } from './plans';
import { isWixStaffOwner, parseList, planForPackage, resolveEntitlement, ruleExceedsPlan, type BillingSnapshot } from './entitlements';

const now = new Date('2026-10-15T00:00:00Z');
const cfg = { basicPackages: ['basic'], proPackages: ['pro', 'pro_yearly'], overrideInstanceIds: ['dev-instance'], now };
const snap = (o: Partial<BillingSnapshot> = {}): BillingSnapshot => ({
  isFree: false,
  packageName: 'pro',
  billingCycle: 'MONTHLY',
  autoRenewing: true,
  expirationDate: null,
  freeTrialStatus: 'NOT_AVAILABLE',
  freeTrialAvailable: false,
  fetchedAt: now.toISOString(),
  ...o,
});

describe('resolveEntitlement', () => {
  it('maps packages to plans case-insensitively', () => {
    expect(planForPackage('PRO', cfg)).toBe('pro');
    expect(planForPackage('basic', cfg)).toBe('basic');
    expect(planForPackage('enterprise', cfg)).toBe('none');
  });

  it('active, trial and free states', () => {
    expect(resolveEntitlement('i', snap(), cfg)).toMatchObject({ plan: 'pro', status: 'active' });
    expect(resolveEntitlement('i', snap({ freeTrialStatus: 'IN_PROGRESS' }), cfg)).toMatchObject({ plan: 'pro', status: 'trial' });
    expect(resolveEntitlement('i', snap({ isFree: true }), cfg)).toMatchObject({ plan: 'none', status: 'free' });
  });

  it('cancellation keeps access until the cycle ends', () => {
    const future = '2027-01-01T00:00:00Z';
    expect(resolveEntitlement('i', snap({ autoRenewing: false, expirationDate: future }), cfg)).toMatchObject({
      plan: 'pro',
      status: 'cancelling',
      accessUntil: future,
    });
  });

  it('expired yearly plan without renewal loses access', () => {
    expect(resolveEntitlement('i', snap({ autoRenewing: false, expirationDate: '2026-01-01T00:00:00Z' }), cfg)).toMatchObject({
      plan: 'none',
      status: 'expired',
    });
  });

  it('unknown or stale billing data never grants checkout', () => {
    expect(resolveEntitlement('i', null, cfg)).toMatchObject({ plan: 'none', status: 'unknown' });
    expect(resolveEntitlement('i', snap({ fetchedAt: '2026-01-01T00:00:00Z' }), cfg)).toMatchObject({ status: 'unknown' });
    expect(resolveEntitlement('i', snap({ packageName: 'mystery' }), cfg).limits.checkout).toBe(false);
  });

  it('Wix staff owners get full access without a plan', () => {
    expect(resolveEntitlement('i', snap({ isFree: true, packageName: null, ownerIsWixStaff: true }), cfg)).toMatchObject({
      plan: 'pro',
      status: 'override',
      limits: STAFF_LIMITS,
    });
    expect(resolveEntitlement('i', snap({ isFree: true, ownerIsWixStaff: false }), cfg)).toMatchObject({ plan: 'none', status: 'free' });
    // A stale snapshot is not trusted, staff flag included.
    expect(resolveEntitlement('i', snap({ ownerIsWixStaff: true, fetchedAt: '2026-01-01T00:00:00Z' }), cfg)).toMatchObject({ plan: 'none' });
  });

  it('override applies only to explicitly listed instance IDs', () => {
    expect(resolveEntitlement('dev-instance', null, cfg)).toMatchObject({ plan: 'pro', status: 'override' });
    expect(resolveEntitlement('other', null, cfg)).toMatchObject({ plan: 'none' });
    expect(resolveEntitlement('', null, { ...cfg, overrideInstanceIds: [''] })).toMatchObject({ plan: 'none' });
  });

  it('is a pure function of the snapshot, so event order cannot corrupt it', () => {
    const a = resolveEntitlement('i', snap({ packageName: 'basic' }), cfg);
    const b = resolveEntitlement('i', snap({ packageName: 'basic' }), cfg);
    expect(a).toEqual(b);
  });
});

describe('plan feature gates', () => {
  it('flags advanced rules on Basic', () => {
    expect(ruleExceedsPlan(makeRule(), PLAN_LIMITS.basic)).toBe(false);
    expect(ruleExceedsPlan(makeRule({ surcharges: [{ kind: 'weight_over', thresholdKg: 1, amount: '1' }] }), PLAN_LIMITS.basic)).toBe(true);
    expect(ruleExceedsPlan(makeRule({ mode: 'volume_tiers', tiers: [{ upTo: null, ratePerUnit: '1', flatFee: '0' }] }), PLAN_LIMITS.pro)).toBe(false);
  });

  it('parses comma lists', () => {
    expect(parseList(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseList(undefined)).toEqual([]);
  });
});

describe('isWixStaffOwner', () => {
  it('requires a verified @wix.com email', () => {
    expect(isWixStaffOwner({ email: 'Jane@Wix.com', emailStatus: 'VERIFIED_OPT_OUT' })).toBe(true);
    expect(isWixStaffOwner({ email: 'jane@wix.com', emailStatus: 'NOT_VERIFIED_OPT_IN' })).toBe(false);
    expect(isWixStaffOwner({ email: 'jane@notwix.com.evil.io', emailStatus: 'VERIFIED_OPT_IN' })).toBe(false);
    expect(isWixStaffOwner({ email: 'jane@evilwix.com', emailStatus: 'VERIFIED_OPT_IN' })).toBe(false);
    expect(isWixStaffOwner(undefined)).toBe(false);
  });
});
