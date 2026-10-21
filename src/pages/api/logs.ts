import { serviceDeps } from '../../lib/api/deps';
import { json, readQuery, route } from '../../lib/api/http';
import { listLogs } from '../../lib/api/services';
import { logsQuerySchema } from '../../lib/validation/schemas';

export const GET = route(async ({ ctx, repos }) => {
  const q = readQuery(ctx.request, logsQuerySchema);
  return json(await listLogs(serviceDeps(repos), q));
});
