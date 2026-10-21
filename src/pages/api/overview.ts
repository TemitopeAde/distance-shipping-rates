import { serviceDeps } from '../../lib/api/deps';
import { json, route } from '../../lib/api/http';
import { getOverview, onboardingAction } from '../../lib/api/services';

/** Dashboard home: checklist, health, usage, recent calculations. Seeds the demo rule once. */
export const GET = route(async ({ repos }) => {
  const deps = serviceDeps(repos);
  await onboardingAction(deps, 'seed').catch(() => undefined);
  return json(await getOverview(deps));
});
