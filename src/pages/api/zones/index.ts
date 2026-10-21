import { serviceDeps } from '../../../lib/api/deps';
import { json, readBody, route } from '../../../lib/api/http';
import { saveZone } from '../../../lib/api/services';
import { zoneInputSchema } from '../../../lib/validation/schemas';

export const GET = route(async ({ repos }) => json({ zones: await repos.zones.list() }));

export const POST = route(async ({ ctx, repos }) => {
  const input = await readBody(ctx.request, zoneInputSchema);
  return json(await saveZone(serviceDeps(repos), input), 201);
});
