import { serviceDeps } from '../../../lib/api/deps';
import { json, readBody, route } from '../../../lib/api/http';
import { listRules, saveRule } from '../../../lib/api/services';
import { pricingRuleInputSchema } from '../../../lib/validation/schemas';

export const GET = route(async ({ repos }) => json(await listRules(serviceDeps(repos))));

export const POST = route(async ({ ctx, repos }) => {
  const input = await readBody(ctx.request, pricingRuleInputSchema);
  return json(await saveRule(serviceDeps(repos), input), 201);
});
