import { appInstances } from '@wix/app-management';
import { handleLifecycleEvent } from '../../../../lib/billing/lifecycle';
import { refreshBilling } from '../../../../lib/billing/sync';
import { wixGateway } from '../../../../lib/data/wix-gateway';
import { recordLifecycleEvent } from '../../../../backend/record-lifecycle-event';
import { runInBackground } from '../../../../backend/run-in-background';

export default appInstances.onAppInstancePaidPlanAutoRenewalCancelled(async (event) => {
  await handleLifecycleEvent('PaidPlanAutoRenewalCancelled', event.metadata.instanceId, event.data, {
    gateway: wixGateway,
    refreshBilling: (repos, evt) => refreshBilling(repos, evt),
  });
  runInBackground('PaidPlanAutoRenewalCancelled Sheets record', () => recordLifecycleEvent('PaidPlanAutoRenewalCancelled', event));
});
