import { serviceDeps } from '../../../lib/api/deps';
import { json, readBody, route } from '../../../lib/api/http';
import { reorderRules } from '../../../lib/api/services';
import { reorderInputSchema } from '../../../lib/validation/schemas';

export const POST = route(async ({ ctx, repos }) => {
  const { ids } = await readBody(ctx.request, reorderInputSchema);
  await reorderRules(serviceDeps(repos), ids);
  return json({ ok: true });
});
