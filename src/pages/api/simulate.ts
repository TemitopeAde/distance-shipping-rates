import { serviceDeps } from '../../lib/api/deps';
import { json, rateLimit, readBody, route } from '../../lib/api/http';
import { simulate } from '../../lib/api/services';
import { simulateInputSchema } from '../../lib/validation/schemas';

/** Preview only: uses the same pipeline as checkout but is not a guaranteed checkout quote. */
export const POST = route(async ({ ctx, repos, caller }) => {
  const input = await readBody(ctx.request, simulateInputSchema);
  rateLimit(`simulate:${caller.instanceId}`, 30, 15);
  return json(await simulate(serviceDeps(repos), input));
});
