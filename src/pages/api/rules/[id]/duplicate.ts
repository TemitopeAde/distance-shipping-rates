import { serviceDeps } from '../../../../lib/api/deps';
import { idParam, json, route } from '../../../../lib/api/http';
import { duplicateRule } from '../../../../lib/api/services';

export const POST = route(async ({ ctx, repos }) => json(await duplicateRule(serviceDeps(repos), idParam.parse(ctx.params.id)), 201));
