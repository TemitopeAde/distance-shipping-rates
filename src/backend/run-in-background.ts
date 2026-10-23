const LOG_PREFIX = '[Distance Shipping Rates]';

const workers = import('cloudflare:workers').catch(() => null);

export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const settled = Promise.resolve()
    .then(task)
    .catch((error) => console.error(`${LOG_PREFIX} ${label} failed`, error instanceof Error ? error.message : 'Unknown error'));
  void workers.then((module) => module?.waitUntil(settled));
}
