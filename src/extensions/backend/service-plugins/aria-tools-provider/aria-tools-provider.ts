import { toolsProvider } from '@wix/app-tools/service-plugins';
import { GEOCODING_TOOLS, runAssistantTool, SIMULATOR_TOOLS } from '../../../../lib/api/assistant-tools';
import { serviceDeps } from '../../../../lib/api/deps';
import { ApiError } from '../../../../lib/api/errors';
import { rateLimit } from '../../../../lib/api/http';
import { createRepositories } from '../../../../lib/data/repositories';
import { wixGateway } from '../../../../lib/data/wix-gateway';

toolsProvider.provideHandlers({
  runTool: async ({ request, metadata }) => {
    const instanceId = metadata.instanceId ?? '';
    // Aria acts for a Wix user (owner or collaborator), like the dashboard. Visitors and members get nothing.
    if (!instanceId || !metadata.identity?.wixUserId) throw new Error('This tool is only available to site collaborators.');

    const methodName = request.methodName ?? '';
    try {
      // Same budgets as the dashboard's geocoding and simulator routes.
      if (GEOCODING_TOOLS.has(methodName)) rateLimit(`geocode:${instanceId}`, 20, 10);
      if (SIMULATOR_TOOLS.has(methodName)) rateLimit(`simulate:${instanceId}`, 30, 15);
      const response = await runAssistantTool(
        serviceDeps(createRepositories(wixGateway, instanceId)),
        methodName,
        request.payload,
        metadata.currency ?? undefined,
      );
      console.log(JSON.stringify({ evt: 'aria_tool', methodName, ok: true }));
      return { response };
    } catch (err) {
      // Expected refusals (validation, plan limits, go-live checks) go back to Aria so it can explain them;
      // a thrown error would make Aria continue without the result.
      if (!(err instanceof ApiError)) throw err;
      console.log(JSON.stringify({ evt: 'aria_tool', methodName, ok: false, error: err.code }));
      return { response: { ok: false, error: err.code, message: err.message, details: err.details ?? null } };
    }
  },
});
