import { appInstances } from '@wix/app-management';
import { auth } from '@wix/essentials';

export type LifecycleEventType = 'APP_INSTALLED' | 'FREE_TRIAL' | 'PAID_PLAN_PURCHASED' | 'PAID_PLAN_CHANGED';
export type LifecycleEventInput = {
  eventType: LifecycleEventType;
  vendorProductId?: string | null;
  previousVendorProductId?: string | null;
  cycle?: string | null;
  invoiceId?: string | null;
  occurredAt?: Date | string | null;
  instanceIdHint?: string | null;
};

const NOTIFY_EMAIL = 'adesiyantope2014@gmail.com';
const SEND_EMAIL_ENDPOINT = 'https://pdfstore-mailer.vercel.app/api/send-email';
const APP_NAME = 'Distance Shipping Rates';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const toIsoDate = (value: Date | string | null | undefined) => {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};
const labels: Record<LifecycleEventType, string> = {
  APP_INSTALLED: 'App installed', FREE_TRIAL: 'Free trial started',
  PAID_PLAN_PURCHASED: 'Paid plan purchased', PAID_PLAN_CHANGED: 'Plan upgraded',
};

export async function isFreeTrialInProgress(): Promise<boolean> {
  try {
    const getAppInstance = auth.elevate(appInstances.getAppInstance);
    const { instance } = await getAppInstance();
    return instance?.billing?.freeTrialInfo?.status === 'IN_PROGRESS';
  } catch (error) {
    console.error('[Distance Shipping Rates] Failed to classify free trial', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

export async function notifyLifecycleEvent(input: LifecycleEventInput) {
  let instanceId = text(input.instanceIdHint);
  let siteUrl = ''; let siteName = ''; let ownerEmail = '';
  try {
    const getAppInstance = auth.elevate(appInstances.getAppInstance);
    const { instance, site } = await getAppInstance();
    instanceId = text(instance?.instanceId) || instanceId;
    siteUrl = text(site?.url); siteName = text(site?.siteDisplayName); ownerEmail = text(site?.ownerInfo?.email).toLowerCase();
  } catch (error) {
    console.error('[Distance Shipping Rates] Failed to load app instance', error instanceof Error ? error.message : 'Unknown error');
  }
  const rows: Array<[string, string]> = [
    ['Event', labels[input.eventType]], ['Site name', siteName], ['Site URL', siteUrl], ['Owner email', ownerEmail],
    ['Instance ID', instanceId], ['Plan', text(input.vendorProductId)], ['Previous plan', text(input.previousVendorProductId)],
    ['Billing cycle', text(input.cycle)], ['Invoice ID', text(input.invoiceId)], ['Occurred at', toIsoDate(input.occurredAt)],
  ];
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222"><h2>${escapeHtml(`[${APP_NAME}] ${labels[input.eventType]}`)}</h2><ul>${rows.filter(([, value]) => value).map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join('')}</ul></body></html>`;
  const response = await fetch(SEND_EMAIL_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: NOTIFY_EMAIL, appName: APP_NAME, subject: labels[input.eventType], html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email endpoint returned ${response.status}.`);
}
