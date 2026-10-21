import type { BillingRow, Repositories } from '../data/repositories';
import { currentUsageMonth } from './entitlements';

export function usageThisMonth(row: BillingRow, now = new Date()): number {
  return row.usageMonth === currentUsageMonth(now) ? row.usageCount : 0;
}

/**
 * Adds provider calls to the monthly counter. Read-modify-write: concurrent
 * checkouts can undercount slightly; the cap is a cost guard, not billing.
 */
export async function recordUsage(repos: Repositories, row: BillingRow, providerCalls: number, now = new Date()): Promise<void> {
  if (providerCalls <= 0) return;
  const month = currentUsageMonth(now);
  const base = row.usageMonth === month ? row.usageCount : 0;
  await repos.billing.save({ ...row, usageMonth: month, usageCount: base + providerCalls });
}
