import { serviceDeps } from '../../../lib/api/deps';
import { idParam, json, readBody, route } from '../../../lib/api/http';
import { deleteZone, saveZone } from '../../../lib/api/services';
import { zoneInputSchema } from '../../../lib/validation/schemas';

export const PUT = route(async ({ ctx, repos }) => {
  const id = idParam.parse(ctx.params.id);
  const input = await readBody(ctx.request, zoneInputSchema);
  return json(await saveZone(serviceDeps(repos), input, id));
});

export const DELETE = route(async ({ ctx, repos }) => {
  await deleteZone(serviceDeps(repos), idParam.parse(ctx.params.id));
  return json({ ok: true });
});
