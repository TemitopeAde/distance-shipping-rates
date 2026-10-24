import { describe, expect, it, vi } from 'vitest';
import { buildLifecycleSheetRecord } from './lifecycle-sheet-record';
import { deliverLifecycleSheetRecord, getLifecycleSheetsConfig } from './lifecycle-sheet-delivery';

const ENDPOINT = 'https://script.google.com/macros/s/abc123/exec';

describe('getLifecycleSheetsConfig', () => {
  it('accepts a deployed Apps Script /exec URL', async () => {
    const config = await getLifecycleSheetsConfig(async () => ({
      LIFECYCLE_SHEETS_WEBHOOK_URL: ` ${ENDPOINT} `, LIFECYCLE_SHEETS_WEBHOOK_SECRET: 's3cret',
    }));
    expect(config).toEqual({ endpoint: ENDPOINT, secret: 's3cret' });
  });

  it('rejects missing secrets and non-Apps Script URLs', async () => {
    await expect(getLifecycleSheetsConfig(async () => ({}))).rejects.toThrow(/LIFECYCLE_SHEETS_WEBHOOK_URL/);
    await expect(getLifecycleSheetsConfig(async () => ({
      LIFECYCLE_SHEETS_WEBHOOK_URL: 'https://example.com/macros/s/abc/exec', LIFECYCLE_SHEETS_WEBHOOK_SECRET: 's',
    }))).rejects.toThrow(/Apps Script/);
  });
});

describe('buildLifecycleSheetRecord', () => {
  const purchase = {
    data: { vendorProductId: 'pro', cycle: 'MONTHLY', operationTimeStamp: '2026-10-24T10:00:00.000Z' },
    metadata: { instanceId: 'inst-1', accountInfo: { siteId: 'site-1' } },
  };

  it('maps event and snapshot fields', async () => {
    const record = await buildLifecycleSheetRecord('PaidPlanPurchased', purchase, {
      instance: { billing: { packageName: 'pro', freeTrialInfo: { status: 'IN_PROGRESS' } } },
      site: { siteDisplayName: 'Shop', ownerInfo: { email: 'owner@example.com' } },
    });
    expect(record).toMatchObject({
      eventType: 'PaidPlanPurchased', appName: 'Distance Shipping Rates', instanceId: 'inst-1', siteId: 'site-1',
      siteName: 'Shop', ownerEmail: 'owner@example.com', planId: 'pro', currentPlanId: 'pro',
      billingCycle: 'MONTHLY', freeTrialStatus: 'IN_PROGRESS', snapshotStatus: 'available',
    });
    expect(record.eventId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('gives timestamped events a stable ID regardless of enrichment', async () => {
    const a = await buildLifecycleSheetRecord('PaidPlanPurchased', purchase, null);
    const b = await buildLifecycleSheetRecord('PaidPlanPurchased', purchase, { instance: {} });
    expect(a.eventId).toBe(b.eventId);
    expect(a.snapshotStatus).toBe('unavailable');
  });

  it('gives untimestamped install events distinct IDs', async () => {
    const install = { data: {}, metadata: { instanceId: 'inst-1' } };
    const a = await buildLifecycleSheetRecord('AppInstalled', install, null);
    const b = await buildLifecycleSheetRecord('AppInstalled', install, null);
    expect(a.eventId).not.toBe(b.eventId);
  });
});

describe('deliverLifecycleSheetRecord', () => {
  const config = { endpoint: ENDPOINT, secret: 's3cret' };
  const record = { eventId: 'e'.repeat(64), eventType: 'AppInstalled' };

  it('posts the secret and record, and returns the acknowledgement', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const send = vi.fn(async () => Response.json({ ok: true, duplicate: false }));
    await expect(deliverLifecycleSheetRecord(config, record, send)).resolves.toEqual({ ok: true, duplicate: false });
    expect(send).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ method: 'POST' }));
    const [, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ secret: 's3cret', record });
  });

  it('throws when the script does not acknowledge', async () => {
    await expect(deliverLifecycleSheetRecord(config, record, async () => Response.json({ ok: false })))
      .rejects.toThrow(/did not acknowledge/);
    await expect(deliverLifecycleSheetRecord(config, record, async () => new Response('', { status: 500 })))
      .rejects.toThrow(/HTTP 500/);
  });
});
