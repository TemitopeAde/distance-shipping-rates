/**
 * Keeps the stored billing snapshot in sync with Wix (source of truth:
 * `appInstances.getAppInstance()`), and tracks monthly provider usage.
 */
import { appInstances } from '@wix/app-management';
import { auth } from '@wix/essentials';
import type { BillingRow, Repositories } from '../data/repositories';
import { within } from '../routing/resilience';
import { isWixStaffOwner, type BillingSnapshot } from './entitlements';

const elevatedGetAppInstance = auth.elevate(appInstances.getAppInstance);

/** Snapshots younger than this are used without calling Wix. */
export const SNAPSHOT_FRESH_MS = 60 * 60 * 1000;

export async function fetchBillingSnapshot(now = new Date()): Promise<BillingSnapshot> {
  const res = await elevatedGetAppInstance();
  const instance = res.instance;
  const billing = instance?.billing;
  const trial = billing?.freeTrialInfo?.status;
  return {
    isFree: instance?.isFree !== false,
    packageName: billing?.packageName ?? null,
    billingCycle: (billing?.billingCycle as string | undefined) ?? null,
    autoRenewing: billing?.autoRenewing ?? null,
    expirationDate: billing?.expirationDate ?? null,
    freeTrialStatus: trial === 'IN_PROGRESS' || trial === 'ENDED' || trial === 'NOT_AVAILABLE' ? trial : null,
    freeTrialAvailable: instance?.freeTrialAvailable === true,
    ownerIsWixStaff: isWixStaffOwner(res.site?.ownerInfo as { email?: string; emailStatus?: string } | undefined),
    fetchedAt: now.toISOString(),
  };
}

function emptyRow(): BillingRow {
  return { snapshot: null, usageMonth: '', usageCount: 0, lastEventType: null, lastEventAt: null };
}

/** Forces a refresh (used by lifecycle events and the Billing page). */
export async function refreshBilling(repos: Repositories, event?: { type: string; at: string }): Promise<BillingRow> {
  const current = (await repos.billing.get()) ?? emptyRow();
  const snapshot = await fetchBillingSnapshot();
  const next: BillingRow = {
    ...current,
    snapshot,
    ...(event ? { lastEventType: event.type, lastEventAt: event.at } : {}),
  };
  await repos.billing.save(next);
  return next;
}

/**
 * Returns the stored row, refreshing it from Wix when stale. A failed or slow
 * refresh falls back to the stored snapshot (entitlement then judges its age).
 */
export async function loadBilling(repos: Repositories, opts: { timeoutMs: number; now?: Date }): Promise<BillingRow> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const stored = (await repos.billing.get()) ?? emptyRow();
  const age = stored.snapshot ? now.getTime() - Date.parse(stored.snapshot.fetchedAt) : Number.POSITIVE_INFINITY;
  // Snapshots written before `ownerIsWixStaff` existed are refreshed so the staff check can apply.
  if (age < SNAPSHOT_FRESH_MS && stored.snapshot?.ownerIsWixStaff !== undefined) return stored;
  try {
    // The refresh shares the caller's time budget with the read above.
    const remaining = Math.max(200, opts.timeoutMs - (Date.now() - started) - 50);
    const snapshot = await within(fetchBillingSnapshot(now), remaining, 'getAppInstance');
    const next = { ...stored, snapshot };
    // Persisting the refreshed snapshot must not delay the caller.
    void repos.billing.save(next).catch(() => undefined);
    return next;
  } catch {
    return stored;
  }
}
