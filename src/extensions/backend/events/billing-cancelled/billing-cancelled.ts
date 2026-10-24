import { appInstances } from '@wix/app-management';
import { handleLifecycleEvent } from '../../../../lib/billing/lifecycle';
import { refreshBilling } from '../../../../lib/billing/sync';
import { wixGateway } from '../../../../lib/data/wix-gateway';
import { recordLifecycleEvent } from '../../../../backend/record-lifecycle-event';
import { runInBackground } from '../../../../backend/run-in-background';

// Notifications are scheduled first so a slow billing sync can't delay or skip them.
export default appInstances.onAppInstancePaidPlanAutoRenewalCancelled(async (event) => {
  runInBackground('PaidPlanAutoRenewalCancelled Sheets record', () => recordLifecycleEvent('PaidPlanAutoRenewalCancelled', event));
  await handleLifecycleEvent('PaidPlanAutoRenewalCancelled', event.metadata.instanceId, event.data, {
    gateway: wixGateway,
    refreshBilling: (repos, evt) => refreshBilling(repos, evt),
  });
});
