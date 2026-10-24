import { appInstances } from '@wix/app-management';
import { handleLifecycleEvent } from '../../../../lib/billing/lifecycle';
import { refreshBilling } from '../../../../lib/billing/sync';
import { wixGateway } from '../../../../lib/data/wix-gateway';
import { notifyLifecycleEvent } from '../../../../backend/notify-lifecycle-event';
import { recordLifecycleEvent } from '../../../../backend/record-lifecycle-event';
import { runInBackground } from '../../../../backend/run-in-background';

// Notifications are scheduled first so a slow billing sync can't delay or skip them.
export default appInstances.onAppInstancePaidPlanChanged(async (event) => {
  runInBackground('PaidPlanChanged email', () => notifyLifecycleEvent({
    eventType: 'PAID_PLAN_CHANGED', vendorProductId: event.data.vendorProductId,
    previousVendorProductId: event.data.previousVendorProductId, cycle: event.data.cycle,
    invoiceId: event.data.invoiceId, occurredAt: event.data.operationTimeStamp, instanceIdHint: event.metadata?.instanceId,
  }));
  runInBackground('PaidPlanChanged Sheets record', () => recordLifecycleEvent('PaidPlanChanged', event));
  await handleLifecycleEvent('PaidPlanChanged', event.metadata.instanceId, event.data, {
    gateway: wixGateway,
    refreshBilling: (repos, evt) => refreshBilling(repos, evt),
  });
});
