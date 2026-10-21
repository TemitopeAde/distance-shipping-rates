import { RoutingError, toRoutingError } from './errors';

export interface Deadline {
  /** Epoch ms when the whole operation must be finished. */
  at: number;
  now: () => number;
}

export function remaining(deadline: Deadline): number {
  return deadline.at - deadline.now();
}

export interface RetryPolicy {
  /** Per-attempt timeout (ms). */
  attemptTimeoutMs: number;
  /** Total attempts including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  /** 0..1 random source for jitter; injectable for tests. */
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` with a per-attempt timeout and bounded, jittered retries for
 * retryable errors. Never starts an attempt that cannot finish before the
 * deadline, so the overall checkout budget is respected.
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  policy: RetryPolicy,
  deadline: Deadline,
  onAttempt?: (attempt: number, error?: RoutingError) => void,
): Promise<T> {
  const random = policy.random ?? Math.random;
  const sleep = policy.sleep ?? defaultSleep;
  let lastError: RoutingError | undefined;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    const budget = Math.min(policy.attemptTimeoutMs, remaining(deadline));
    if (budget < 100) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    try {
      const result = await fn(controller.signal);
      onAttempt?.(attempt);
      return result;
    } catch (err) {
      lastError = controller.signal.aborted ? new RoutingError('TIMEOUT', 'Routing provider timed out') : toRoutingError(err);
      onAttempt?.(attempt, lastError);
      if (!lastError.retryable || attempt === policy.maxAttempts) break;
      // Full jitter: delay in [0, base * 2^(attempt-1)].
      const delay = Math.round(random() * policy.baseDelayMs * 2 ** (attempt - 1));
      if (remaining(deadline) - delay < policy.attemptTimeoutMs / 2) break;
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new RoutingError('TIMEOUT', 'No time left in checkout budget');
}

/** Resolves with `fallback` if `promise` does not settle in `ms`. Used for best-effort Wix Data writes. */
export async function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Rejects with OperationTimeoutError if `promise` takes longer than `ms`. */
export async function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new OperationTimeoutError(label)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class OperationTimeoutError extends Error {
  constructor(label: string) {
    super(`${label} timed out`);
    this.name = 'OperationTimeoutError';
  }
}
