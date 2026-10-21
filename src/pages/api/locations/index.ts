import { serviceDeps } from '../../../lib/api/deps';
import { json, rateLimit, readBody, route } from '../../../lib/api/http';
import { saveLocation } from '../../../lib/api/services';
import { locationInputSchema } from '../../../lib/validation/schemas';

export const GET = route(async ({ repos }) => json({ locations: await repos.locations.list() }));

export const POST = route(async ({ ctx, repos, caller }) => {
  const input = await readBody(ctx.request, locationInputSchema);
  rateLimit(`geocode:${caller.instanceId}`, 20, 10);
  return json(await saveLocation(serviceDeps(repos), input), 201);
});
