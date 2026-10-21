import { z } from 'zod';
import { ApiError, json, rateLimit, readQuery, route } from '../../lib/api/http';
import { suggestAddresses } from '../../lib/routing/autocomplete';
import { RoutingError } from '../../lib/routing/errors';
import { autocompleteApiKey } from '../../lib/wix/env';

const querySchema = z.object({
  text: z.string().trim().min(3).max(200),
  // Suggestions are always restricted to the country the merchant selected.
  country: z.string().trim().regex(/^[A-Za-z]{2}$/),
  lang: z.string().trim().regex(/^[a-z]{2}$/).optional(),
});

/** Address suggestions for dashboard forms. The query text is never logged or stored. */
export const GET = route(async ({ ctx, caller }) => {
  const q = readQuery(ctx.request, querySchema);
  const key = autocompleteApiKey();
  if (!key) throw new ApiError(503, 'autocomplete_unavailable');
  rateLimit(`autocomplete:${caller.instanceId}`, 60, 60);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const suggestions = await suggestAddresses(q.text, key, { country: q.country, lang: q.lang, signal: controller.signal });
    return json({ suggestions });
  } catch (err) {
    if (err instanceof RoutingError && err.kind === 'RATE_LIMITED') throw new ApiError(429, 'rate_limited');
    throw new ApiError(503, 'autocomplete_unavailable');
  } finally {
    clearTimeout(timer);
  }
});
