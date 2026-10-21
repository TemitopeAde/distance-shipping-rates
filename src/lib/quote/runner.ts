/**
 * Orchestrates one quote with an explicit time budget:
 *
 *   ┌ budget (CHECKOUT_BUDGET_MS, default 4000 ms) ─────────────────────────────┐
 *   │ config + billing reads (parallel) ≤ 1200 ms                               │
 *   │ geocode  ≤ 1500 ms/attempt ┐ retries only if they fit before the deadline │
 *   │ matrix   ≤ 1500 ms/attempt ┘                                              │
 *   │ log + usage writes (parallel, best effort) ≤ 600 ms                       │
 *   └───────────────────────────────────────────────────────────────────────────┘
 *
 * Wix's own execution limits for CLI backend extensions are 1000 CPU-ms and
 * 20 sub-requests per request; this flow uses at most ~11 sub-requests.
 */
import { resolveEntitlement, type EntitlementConfig } from '../billing/entitlements';
import { recordUsage, usageThisMonth } from '../billing/usage';
import type { BillingRow, CalculationLogDetails, CalculationLogEntry, Repositories } from '../data/repositories';
import type { MerchantSettings } from '../validation/schemas';
import { minorToDecimalString } from '../shipping/money';
import { OperationTimeoutError, settleWithin, within } from '../routing/resilience';
import { DEFAULT_POLICY, sha256Hex } from '../routing/service';
import type { RetryPolicy } from '../routing/resilience';
import type { RouteTraceEntry } from '../routing/service';
import type { RoutingProvider } from '../routing/types';
import { computeQuote, distanceInUnit, type QuoteOutcome, type QuoteRequest } from './pipeline';

export interface RunOptions {
  repos: Repositories;
  provider: RoutingProvider | null;
  entitlementConfig: EntitlementConfig;
  budgetMs: number;
  /** Time allowed for loading settings/rules/billing. Default: min(2000 ms, 40% of budget). */
  readTimeoutMs?: number;
  retryPolicy?: Partial<RetryPolicy>;
  /** Record each provider attempt (simulator diagnostics). */
  collectTrace?: boolean;
  rolloutAllowed: boolean;
  requestId?: string | null;
  /** Loads the billing row (refreshing from Wix when stale); see billing/sync.ts. */
  loadBilling: (repos: Repositories, opts: { timeoutMs: number }) => Promise<BillingRow>;
  now?: () => number;
}

export interface RunResult {
  outcome: QuoteOutcome;
  latencyMs: number;
  log: CalculationLogEntry;
  trace: RouteTraceEntry[];
}

const NO_TELEMETRY = { providerCalls: 0, cacheHit: false, routingErrorKind: null } as const;

/** What runQuote learned along the way, for the log's `details`. */
interface RunDiagnostics {
  configMs: number | null;
  quoteMs: number | null;
  configError: string | null;
  settings: MerchantSettings | null;
  entitlement: CalculationLogDetails['entitlement'];
}

export async function runQuote(req: QuoteRequest, opts: RunOptions): Promise<RunResult> {
  const now = opts.now ?? Date.now;
  const started = now();
  const deadline = { at: started + opts.budgetMs, now };
  const readTimeout = opts.readTimeoutMs ?? Math.min(2000, Math.floor(opts.budgetMs * 0.4));

  let outcome: QuoteOutcome;
  let billingRow: BillingRow | null = null;
  let unit = 'mi';
  // Always traced: the calculation log stores every provider attempt.
  const trace: RouteTraceEntry[] = [];
  const diag: RunDiagnostics = { configMs: null, quoteMs: null, configError: null, settings: null, entitlement: null };

  if (req.source === 'checkout' && !opts.rolloutAllowed) {
    outcome = { kind: 'no_rate', reason: 'rollout_disabled', ...NO_TELEMETRY };
  } else {
    try {
      const [settings, locations, rules, zones, billing] = await within(
        Promise.all([
          opts.repos.settings.get(),
          opts.repos.locations.list(),
          opts.repos.rules.list(),
          opts.repos.zones.list(),
          opts.loadBilling(opts.repos, { timeoutMs: readTimeout }),
        ]),
        readTimeout + 100,
        'config load',
      );
      diag.configMs = now() - started;
      billingRow = billing;
      unit = settings.unit;
      const entitlement = resolveEntitlement(opts.repos.instanceId, billing.snapshot, opts.entitlementConfig);
      const usedLookupsThisMonth = usageThisMonth(billing);
      diag.settings = settings;
      diag.entitlement = {
        plan: entitlement.plan,
        status: entitlement.status,
        usedLookupsThisMonth,
        monthlyLookups: entitlement.limits.monthlyLookups,
      };
      const quoteStarted = now();
      outcome = await computeQuote(req, {
        config: { settings, locations, rules, zones },
        entitlement,
        provider: opts.provider,
        cache: opts.repos.routeCache,
        usedLookupsThisMonth,
        deadline,
        retryPolicy: opts.retryPolicy,
        trace,
      });
      diag.quoteMs = now() - quoteStarted;
    } catch (err) {
      // Transient Wix Data failure: offer nothing rather than block checkout with an error.
      const kind = configFailureKind(err);
      diag.configError = kind;
      console.error(JSON.stringify({ evt: 'config_load_failed', kind, name: err instanceof Error ? err.name : 'unknown', readTimeoutMs: readTimeout }));
      outcome = { kind: 'no_rate', reason: 'config_unavailable', ...NO_TELEMETRY, routingErrorKind: kind };
    }
  }

  const latencyMs = now() - started;
  const writeBudget = Math.max(150, Math.min(600, deadline.at - now()));
  const details = buildDetails(req, outcome, opts, readTimeout, writeBudget, trace, diag);
  const log = await buildLog(req, outcome, latencyMs, unit, opts.requestId, details);

  const writes: Promise<unknown>[] = [opts.repos.logs.insert(log)];
  if (billingRow && outcome.providerCalls > 0) writes.push(recordUsage(opts.repos, billingRow, outcome.providerCalls));
  await settleWithin(Promise.allSettled(writes), writeBudget, []);

  return { outcome, latencyMs, log, trace: opts.collectTrace ? trace : [] };
}

/** Replaces bigints (micro-unit amounts) with strings so Wix Data can store the value. */
function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

function buildDetails(
  req: QuoteRequest,
  outcome: QuoteOutcome,
  opts: RunOptions,
  readTimeoutMs: number,
  writeBudgetMs: number,
  trace: RouteTraceEntry[],
  diag: RunDiagnostics,
): CalculationLogDetails {
  const options = outcome.kind === 'rates' ? outcome.options : outcome.kind === 'fallback' ? [outcome.option] : [];
  const s = diag.settings;
  return {
    routingProvider: opts.provider?.id ?? null,
    budgetMs: opts.budgetMs,
    readTimeoutMs,
    attemptTimeoutMs: opts.retryPolicy?.attemptTimeoutMs ?? DEFAULT_POLICY.attemptTimeoutMs,
    timings: { configMs: diag.configMs, quoteMs: diag.quoteMs, writeBudgetMs },
    configError: diag.configError,
    entitlement: diag.entitlement,
    settings: s
      ? {
          settingsVersion: s.settingsVersion,
          failureMode: s.failureMode,
          accessEndBehavior: s.accessEndBehavior,
          originStrategy: s.originStrategy,
          unit: s.unit,
        }
      : null,
    trace: trace.map((t) => ({ ...t })),
    cart: {
      lines: req.lines.length,
      shippableLines: req.lines.filter((l) => l.shippable && l.quantity > 0).length,
      subtotalMicros: req.lines.reduce((sum, l) => sum + l.totalMicros, 0n).toString(),
      weightUnit: req.weightUnit,
    },
    // Region-level only: no street lines, city or full postal code.
    destination: {
      country: req.destination.country,
      subdivision: req.destination.subdivision,
      postalPrefix: req.destination.postalCode.slice(0, 3),
    },
    geocodeQuality: outcome.kind === 'rates' ? outcome.geocodeQuality : null,
    options: options.map((o) => ({
      code: o.code,
      title: o.title,
      ruleId: o.ruleId,
      price: minorToDecimalString(o.priceMinor, o.currency),
      handling: minorToDecimalString(o.handlingMinor, o.currency),
      freeDelivery: o.freeDelivery,
      billedUnits: o.billedUnits,
      breakdown: jsonSafe(o.breakdown) as Record<string, unknown>[],
    })),
    ruleDiagnostics: outcome.kind === 'no_rate' ? (outcome.ruleDiagnostics ?? []) : [],
  };
}

function statusOf(outcome: QuoteOutcome): CalculationLogEntry['status'] {
  switch (outcome.kind) {
    case 'rates':
      return 'priced';
    case 'fallback':
      return 'fallback';
    case 'address_error':
      return 'error';
    default:
      return 'no_rate';
  }
}

async function buildLog(
  req: QuoteRequest,
  outcome: QuoteOutcome,
  latencyMs: number,
  unit: string,
  requestId: string | null | undefined,
  details: CalculationLogDetails,
): Promise<CalculationLogEntry> {
  const reason =
    outcome.kind === 'no_rate' ? outcome.reason : outcome.kind === 'fallback' ? outcome.reason : outcome.kind === 'address_error' ? outcome.error : '';
  const options = outcome.kind === 'rates' ? outcome.options : outcome.kind === 'fallback' ? [outcome.option] : [];
  const first = options[0];
  const distanceMeters = outcome.kind === 'rates' ? outcome.distanceMeters : outcome.kind === 'no_rate' ? outcome.distanceMeters : undefined;
  return {
    source: req.source,
    status: statusOf(outcome),
    reason,
    providerError: outcome.routingErrorKind ?? '',
    cacheHit: outcome.cacheHit,
    providerCalls: outcome.providerCalls,
    latencyMs,
    distance: distanceMeters === undefined ? null : distanceInUnit(distanceMeters, unit === 'km' ? 'km' : 'mi'),
    unit,
    originLocationId: (outcome.kind === 'rates' ? outcome.originLocationId : outcome.kind === 'no_rate' ? outcome.originLocationId : '') ?? '',
    optionCodes: options.map((o) => o.code).join(','),
    price: first ? minorToDecimalString(first.priceMinor + first.handlingMinor, first.currency) : '',
    currency: req.currency,
    destCountry: req.destination.country,
    destPostalPrefix: req.destination.postalCode.slice(0, 3),
    requestRef: requestId ? (await sha256Hex(requestId)).slice(0, 16) : '',
    createdAt: new Date().toISOString(),
    details,
  };
}

/** Classifies why settings could not be loaded, for logs and the simulator. */
export function configFailureKind(err: unknown): 'TIMEOUT' | 'AUTH' | 'NETWORK' {
  if (err instanceof OperationTimeoutError) return 'TIMEOUT';
  const code = (err as { details?: { applicationError?: { code?: unknown } } } | null)?.details?.applicationError?.code;
  if (code === 401 || code === 403) return 'AUTH';
  return 'NETWORK';
}
