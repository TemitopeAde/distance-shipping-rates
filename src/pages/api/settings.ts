import { serviceDeps } from '../../lib/api/deps';
import { json, readBody, route } from '../../lib/api/http';
import { getSettings, updateSettings } from '../../lib/api/services';
import { settingsInputSchema } from '../../lib/validation/schemas';

export const GET = route(async ({ repos }) => json(await getSettings(serviceDeps(repos))));

export const PUT = route(async ({ ctx, repos }) => {
  const input = await readBody(ctx.request, settingsInputSchema);
  return json(await updateSettings(serviceDeps(repos), input));
});
