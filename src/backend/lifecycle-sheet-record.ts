export type AppLifecycleEvent = {
  data?: unknown;
  metadata?: {
    instanceId?: string | null;
    eventType?: string;
    accountInfo?: { accountId?: string | null; siteId?: string | null };
  };
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

const canonicalJson = (value: unknown): string => {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const dateText = (value: unknown): string => value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : '';

export async function buildLifecycleSheetRecord(eventType: string, event: AppLifecycleEvent, snapshot: unknown) {
  const data = object(event.data);
  const details = object(snapshot);
  const instance = object(details.instance);
  const site = object(details.site);
  const billing = object(instance.billing);
  const trial = object(billing.freeTrialInfo);
  const deliveryId = data.operationTimeStamp ? undefined : crypto.randomUUID();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson({ eventType, event, deliveryId })));
  const eventId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    eventId, eventType, receivedAt: new Date().toISOString(), occurredAt: dateText(data.operationTimeStamp),
    appName: instance.appName ?? 'Distance Shipping Rates', appId: data.appId ?? '', appVersion: instance.appVersion ?? '',
    instanceId: event.metadata?.instanceId ?? instance.instanceId ?? '',
    accountId: event.metadata?.accountInfo?.accountId ?? '', siteId: event.metadata?.accountInfo?.siteId ?? site.siteId ?? '',
    siteName: site.siteDisplayName ?? '', siteUrl: site.url ?? '', ownerEmail: object(site.ownerInfo).email ?? '',
    planId: data.vendorProductId ?? '', currentPlanId: billing.packageName ?? '', previousPlanId: data.previousVendorProductId ?? '',
    billingCycle: data.cycle ?? '', previousBillingCycle: data.previousCycle ?? '', invoiceId: data.invoiceId ?? '',
    expiresOn: dateText(data.expiresOn), couponName: data.couponName ?? '', isFree: instance.isFree ?? '',
    autoRenewing: billing.autoRenewing ?? '', freeTrialStatus: trial.status ?? '', freeTrialEndDate: dateText(trial.endDate),
    cancelReason: data.cancelReason ?? '', userReason: data.userReason ?? '', cancellationType: data.subscriptionCancellationType ?? '',
    cancelledDuringFreeTrial: data.cancelledDuringFreeTrial ?? '', reactivationReason: data.reason ?? '',
    originInstanceId: data.originInstanceId ?? instance.originInstanceId ?? '', snapshotStatus: snapshot ? 'available' : 'unavailable',
    payloadJson: JSON.stringify(event), snapshotJson: snapshot ? JSON.stringify(snapshot) : '',
  };
}
