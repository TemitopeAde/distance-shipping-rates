import { appInstances } from '@wix/app-management';
import { auth } from '@wix/essentials';
import { buildLifecycleSheetRecord, type AppLifecycleEvent } from './lifecycle-sheet-record';
import { deliverLifecycleSheetRecord, getLifecycleSheetsConfig } from './lifecycle-sheet-delivery';
import { readLifecycleSheetsEnv } from './lifecycle-env-bridge';

async function loadInstanceSnapshot(event: AppLifecycleEvent): Promise<unknown> {
  const response = await auth.elevate(appInstances.getAppInstance)();
  if (event.metadata?.instanceId && response.instance?.instanceId !== event.metadata.instanceId) {
    throw new Error('Event instance does not match the current app instance.');
  }
  return response;
}

export async function recordLifecycleEvent(eventType: string, event: AppLifecycleEvent) {
  const config = await getLifecycleSheetsConfig(async () => readLifecycleSheetsEnv());
  let snapshot: unknown = null;
  if (eventType !== 'AppRemoved') {
    try { snapshot = await loadInstanceSnapshot(event); }
    catch (error) { console.warn('Lifecycle event instance details are unavailable.', error instanceof Error ? error.message : 'Unknown error'); }
  }
  const record = await buildLifecycleSheetRecord(eventType, event, snapshot);
  await deliverLifecycleSheetRecord(config, record);
}
