import { appInstances } from '@wix/app-management';
import { handleLifecycleEvent } from '../../../../lib/billing/lifecycle';
import { refreshBilling } from '../../../../lib/billing/sync';
import { wixGateway } from '../../../../lib/data/wix-gateway';
import { notifyLifecycleEvent } from '../../../../backend/notify-lifecycle-event';
import { recordLifecycleEvent } from '../../../../backend/record-lifecycle-event';
import { runInBackground } from '../../../../backend/run-in-background';

export default appInstances.onAppInstanceInstalled(async (event) => {
  await handleLifecycleEvent('AppInstalled', event.metadata.instanceId, event.data, {
    gateway: wixGateway,
    refreshBilling: (repos, evt) => refreshBilling(repos, evt),
  });
  runInBackground('AppInstalled email', () => notifyLifecycleEvent({ eventType: 'APP_INSTALLED', instanceIdHint: event.metadata?.instanceId }));
  runInBackground('AppInstalled Sheets record', () => recordLifecycleEvent('AppInstalled', event));
});
