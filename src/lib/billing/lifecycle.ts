/**
 * App-instance lifecycle handling. Every billing event simply re-fetches the
 * authoritative snapshot from Wix, so duplicates and out-of-order delivery are
 * harmless; exact redeliveries are additionally skipped via EventDedupe.
 */
import type { DataGateway } from '../data/gateway';
import { createRepositories, type Repositories } from '../data/repositories';
import { sha256Hex } from '../routing/service';
import { demoRuleInput } from '../validation/defaults';

export type LifecycleEventType =
  | 'AppInstalled'
  | 'AppRemoved'
  | 'PaidPlanPurchased'
  | 'PaidPlanChanged'
  | 'PaidPlanAutoRenewalCancelled'
  | 'PlanConvertedToPaid'
  | 'PlanReactivated'
  | 'PlanTransferred';

export interface LifecycleDeps {
  gateway: DataGateway;
  refreshBilling: (repos: Repositories, event: { type: string; at: string }) => Promise<unknown>;
  now?: () => Date;
}

export type LifecycleResult = 'processed' | 'duplicate' | 'ignored' | 'failed';

export async function handleLifecycleEvent(
  type: LifecycleEventType,
  instanceId: string | null | undefined,
  data: unknown,
  deps: LifecycleDeps,
): Promise<LifecycleResult> {
  if (!instanceId) return 'ignored';
  const now = deps.now?.() ?? new Date();
  try {
    const repos = createRepositories(deps.gateway, instanceId);
    const key = await sha256Hex(JSON.stringify(['lifecycle', instanceId, type, data ?? null]));
    if (!(await repos.eventDedupe.claim(key, type))) return 'duplicate';

    if (type === 'AppRemoved') {
      // Collections may already be gone after uninstall; the write is best effort.
      await repos.appInstance.touch({ removedAt: now }).catch(() => undefined);
      return 'processed';
    }
    if (type === 'AppInstalled') {
      await repos.appInstance.touch({ installedAt: now, removedAt: null });
      await seedOnboarding(repos);
    }
    await deps.refreshBilling(repos, { type, at: now.toISOString() });
    return 'processed';
  } catch (err) {
    console.error(JSON.stringify({ evt: 'lifecycle_failed', type, message: err instanceof Error ? err.message : 'unknown' }));
    return 'failed';
  }
}

/**
 * Seeds the single inactive demo rule exactly once per instance. Safe to call
 * repeatedly (from install events and from the dashboard's first load).
 */
export async function seedOnboarding(repos: Repositories): Promise<boolean> {
  const settings = await repos.settings.get();
  if (settings.onboarding.demoRuleSeeded) return false;
  if (!(await repos.eventDedupe.claim(`seed-demo-rule:${repos.instanceId}`, 'seed'))) {
    return false;
  }
  const existing = await repos.rules.list();
  if (existing.length === 0) await repos.rules.upsert(demoRuleInput());
  await repos.settings.save({ ...settings, onboarding: { ...settings.onboarding, demoRuleSeeded: true } });
  return true;
}
