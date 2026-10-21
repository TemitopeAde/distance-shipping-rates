import { serviceDeps } from '../../../lib/api/deps';
import { idParam, json, rateLimit, readBody, route } from '../../../lib/api/http';
import { deleteLocation, saveLocation } from '../../../lib/api/services';
import { locationInputSchema } from '../../../lib/validation/schemas';

export const PUT = route(async ({ ctx, repos, caller }) => {
  const id = idParam.parse(ctx.params.id);
  const input = await readBody(ctx.request, locationInputSchema);
  rateLimit(`geocode:${caller.instanceId}`, 20, 10);
  return json(await saveLocation(serviceDeps(repos), input, id));
});

export const DELETE = route(async ({ ctx, repos }) => {
  await deleteLocation(serviceDeps(repos), idParam.parse(ctx.params.id));
  return json({ ok: true });
});
