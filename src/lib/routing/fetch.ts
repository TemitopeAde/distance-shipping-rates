/**
 * `fetch` wrapped so it is always invoked with the global receiver.
 *
 * Wix hosting runs on Cloudflare Workers, where calling a stored reference as a
 * method (`this.fetchImpl(...)`) throws "TypeError: Illegal invocation" before
 * any request is sent. Node tolerates it, so the bug only shows in production.
 */
export const globalFetch: typeof fetch = (input, init) => fetch(input, init);
