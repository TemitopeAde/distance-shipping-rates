const KEY = Symbol.for('distance-shipping-lifecycle-env');

export type LifecycleSheetsEnv = {
  LIFECYCLE_SHEETS_WEBHOOK_URL?: string;
  LIFECYCLE_SHEETS_WEBHOOK_SECRET?: string;
};

type Holder = typeof globalThis & { [KEY]?: LifecycleSheetsEnv };

export function publishLifecycleSheetsEnv(env: LifecycleSheetsEnv): void {
  (globalThis as Holder)[KEY] = env;
}

export function readLifecycleSheetsEnv(): LifecycleSheetsEnv {
  return (globalThis as Holder)[KEY] ?? {};
}
