import { serviceDeps } from '../../../lib/api/deps';
import { json, rateLimit, readBody, route } from '../../../lib/api/http';
import { checkoutUrl } from '../../../lib/api/services';
import { checkoutUrlInputSchema } from '../../../lib/validation/schemas';

export const POST = route(async ({ ctx, repos, caller }) => {
  const { plan, billingCycle } = await readBody(ctx.request, checkoutUrlInputSchema);
  rateLimit(`checkout-url:${caller.instanceId}`, 10, 5);
  return json(await checkoutUrl(serviceDeps(repos), plan, billingCycle));
});
