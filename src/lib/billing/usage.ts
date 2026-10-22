import type { BillingRow, Repositories } from '../data/repositories';
import { currentUsageMonth } from './entitlements';

export function usageThisMonth(row: BillingRow, now = new Date()): number {
  return row.usageMonth === currentUsageMonth(now) ? row.usageCount : 0;
}

/**
 * Counts one lookup for a destination that needed the routing provider (cache
 * hits make no provider calls and are free). Retries and the geocode + matrix
 * pair count once, so the plan allowance means new customer addresses.
 * Read-modify-write: concurrent checkouts can undercount slightly; the cap is a
 * cost guard, not billing.
 */
export async function recordUsage(repos: Repositories, row: BillingRow, providerCalls: number, now = new Date()): Promise<void> {
  if (providerCalls <= 0) return;
  const month = currentUsageMonth(now);
  const base = row.usageMonth === month ? row.usageCount : 0;
  await repos.billing.save({ ...row, usageMonth: month, usageCount: base + 1 });
}
