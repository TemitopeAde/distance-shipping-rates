import { serviceDeps } from '../../../lib/api/deps';
import { json, route } from '../../../lib/api/http';
import { getBilling } from '../../../lib/api/services';

export const GET = route(async ({ ctx, repos }) => {
  const refresh = new URL(ctx.request.url).searchParams.get('refresh') === '1';
  return json(await getBilling(serviceDeps(repos), { refresh }));
});
