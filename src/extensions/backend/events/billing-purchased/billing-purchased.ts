import { appInstances } from '@wix/app-management';
import { handleLifecycleEvent } from '../../../../lib/billing/lifecycle';
import { refreshBilling } from '../../../../lib/billing/sync';
import { wixGateway } from '../../../../lib/data/wix-gateway';
import { isFreeTrialInProgress, notifyLifecycleEvent } from '../../../../backend/notify-lifecycle-event';
import { recordLifecycleEvent } from '../../../../backend/record-lifecycle-event';
import { runInBackground } from '../../../../backend/run-in-background';

// Notifications are scheduled first so a slow billing sync can't delay or skip them.
export default appInstances.onAppInstancePaidPlanPurchased(async (event) => {
  runInBackground('PaidPlanPurchased email', async () => notifyLifecycleEvent({
    eventType: (await isFreeTrialInProgress()) ? 'FREE_TRIAL' : 'PAID_PLAN_PURCHASED',
    vendorProductId: event.data.vendorProductId, cycle: event.data.cycle, invoiceId: event.data.invoiceId,
    occurredAt: event.data.operationTimeStamp, instanceIdHint: event.metadata?.instanceId,
  }));
  runInBackground('PaidPlanPurchased Sheets record', () => recordLifecycleEvent('PaidPlanPurchased', event));
  await handleLifecycleEvent('PaidPlanPurchased', event.metadata.instanceId, event.data, {
    gateway: wixGateway,
    refreshBilling: (repos, evt) => refreshBilling(repos, evt),
  });
});
