export type RoutingErrorKind =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'AUTH'
  | 'BAD_ADDRESS'
  | 'LOW_CONFIDENCE'
  | 'NO_ROUTE'
  | 'UPSTREAM_5XX'
  | 'BAD_RESPONSE'
  | 'NETWORK'
  | 'NOT_CONFIGURED';

const RETRYABLE: ReadonlySet<RoutingErrorKind> = new Set(['TIMEOUT', 'RATE_LIMITED', 'UPSTREAM_5XX', 'NETWORK']);

/** Errors caused by the shopper's address rather than an outage. Never trigger fail-open fallback. */
const ADDRESS_KINDS: ReadonlySet<RoutingErrorKind> = new Set(['BAD_ADDRESS', 'LOW_CONFIDENCE', 'NO_ROUTE']);

export class RoutingError extends Error {
  readonly kind: RoutingErrorKind;
  readonly status: number | undefined;

  constructor(kind: RoutingErrorKind, message: string, status?: number) {
    // Messages must never include API keys or full addresses.
    super(message);
    this.name = 'RoutingError';
    this.kind = kind;
    this.status = status;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }

  get isAddressProblem(): boolean {
    return ADDRESS_KINDS.has(this.kind);
  }
}

export function classifyHttpStatus(status: number): RoutingErrorKind {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_5XX';
  if (status === 400 || status === 404 || status === 422) return 'BAD_ADDRESS';
  return 'BAD_RESPONSE';
}

export function toRoutingError(err: unknown): RoutingError {
  if (err instanceof RoutingError) return err;
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return new RoutingError('TIMEOUT', 'Routing provider timed out');
  }
  // Only the error's name: native messages can echo the request URL, which may carry the API key.
  const name = err instanceof Error ? err.name : typeof err;
  return new RoutingError('NETWORK', `Routing provider request failed (${name})`);
}
