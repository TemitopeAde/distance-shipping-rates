type Environment = Record<string, unknown>;

export async function getLifecycleSheetsConfig(loadEnvironment: () => Promise<Environment | undefined>) {
  let environment: Environment;
  try {
    environment = (await loadEnvironment()) ?? {};
  } catch {
    const runtime = globalThis as typeof globalThis & { process?: { env?: Environment } };
    environment = runtime.process?.env ?? {};
  }
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const endpoint = text(environment.LIFECYCLE_SHEETS_WEBHOOK_URL);
  const secret = text(environment.LIFECYCLE_SHEETS_WEBHOOK_SECRET);
  if (!endpoint || !secret) throw new Error('Lifecycle Sheets delivery requires its webhook URL and secret.');
  const url = new URL(endpoint);
  if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) {
    throw new Error('Lifecycle Sheets webhook must be a deployed Google Apps Script /exec URL.');
  }
  return { endpoint, secret };
}

export async function deliverLifecycleSheetRecord(
  config: { endpoint: string; secret: string },
  record: { eventId: string; eventType: string },
  send: typeof fetch = fetch,
) {
  const response = await send(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.secret, record }),
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Lifecycle Sheets webhook returned HTTP ${response.status}.`);
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
    throw new Error('Lifecycle Sheets webhook did not acknowledge the event.');
  }
  return result;
}
