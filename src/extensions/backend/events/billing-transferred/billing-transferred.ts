import { appInstances } from '@wix/app-management';
import { handleLifecycleEvent } from '../../../../lib/billing/lifecycle';
import { refreshBilling } from '../../../../lib/billing/sync';
import { wixGateway } from '../../../../lib/data/wix-gateway';

export default appInstances.onAppInstancePlanTransferred(async (event) => {
  await handleLifecycleEvent('PlanTransferred', event.metadata.instanceId, event.data, {
    gateway: wixGateway,
    refreshBilling: (repos, evt) => refreshBilling(repos, evt),
  });
});
