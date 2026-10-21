import { serviceDeps } from '../../lib/api/deps';
import { json, readBody, route } from '../../lib/api/http';
import { onboardingAction } from '../../lib/api/services';
import { onboardingActionSchema } from '../../lib/validation/schemas';

export const POST = route(async ({ ctx, repos }) => {
  const { action } = await readBody(ctx.request, onboardingActionSchema);
  return json(await onboardingAction(serviceDeps(repos), action));
});
