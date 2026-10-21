import { serviceDeps } from '../../../../lib/api/deps';
import { idParam, json, readBody, route } from '../../../../lib/api/http';
import { deleteRule, saveRule } from '../../../../lib/api/services';
import { pricingRuleInputSchema } from '../../../../lib/validation/schemas';

export const PUT = route(async ({ ctx, repos }) => {
  const id = idParam.parse(ctx.params.id);
  const input = await readBody(ctx.request, pricingRuleInputSchema);
  return json(await saveRule(serviceDeps(repos), input, id));
});

export const DELETE = route(async ({ ctx, repos }) => {
  await deleteRule(serviceDeps(repos), idParam.parse(ctx.params.id));
  return json({ ok: true });
});
