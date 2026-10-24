import { appInstances } from '@wix/app-management';
import { auth } from '@wix/essentials';
import { buildLifecycleSheetRecord, type AppLifecycleEvent } from './lifecycle-sheet-record';
import { deliverLifecycleSheetRecord, getLifecycleSheetsConfig } from './lifecycle-sheet-delivery';
import { readLifecycleSheetsEnv } from './lifecycle-env-bridge';

// Enrichment is optional; it must never use up the background time the Sheets write needs.
const SNAPSHOT_TIMEOUT_MS = 5_000;

async function loadInstanceSnapshot(event: AppLifecycleEvent): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Instance lookup timed out.')), SNAPSHOT_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([auth.elevate(appInstances.getAppInstance)(), timeout]);
    if (event.metadata?.instanceId && response.instance?.instanceId !== event.metadata.instanceId) {
      throw new Error('Event instance does not match the current app instance.');
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function recordLifecycleEvent(eventType: string, event: AppLifecycleEvent) {
  const config = await getLifecycleSheetsConfig(async () => readLifecycleSheetsEnv());
  let snapshot: unknown = null;
  // After removal the app's access to the site is revoked, so the lookup cannot succeed.
  if (eventType !== 'AppRemoved') {
    try { snapshot = await loadInstanceSnapshot(event); }
    catch (error) { console.log('Lifecycle event instance details are unavailable.', error instanceof Error ? error.message : 'Unknown error'); }
  }
  const record = await buildLifecycleSheetRecord(eventType, event, snapshot);
  await deliverLifecycleSheetRecord(config, record);
}
