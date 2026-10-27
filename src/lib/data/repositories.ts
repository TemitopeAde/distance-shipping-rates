/**
 * Tenant-scoped repositories. Every read filters by the validated app
 * instance ID and every by-ID access verifies ownership, as defense in depth on
 * top of Wix's per-site collection isolation. Instance IDs must come from the
 * Wix auth context (service-plugin metadata, event metadata, or
 * `auth.getTokenInfo()`), never from request bodies.
 */
import type { BillingSnapshot } from '../billing/entitlements';
import type { CachedRoutes, RouteCacheStore } from '../routing/service';
import { defaultSettings } from '../validation/defaults';
import type {
  DeliveryZone,
  FulfillmentLocation,
  MerchantSettings,
  PricingRule,
} from '../validation/schemas';
import { COLLECTIONS, type DataGateway, type Doc } from './gateway';

export const SCHEMA_VERSION = 1;

export class TenantError extends Error {
  constructor(message = 'Instance context missing') {
    super(message);
    this.name = 'TenantError';
  }
}

function requireInstance(instanceId: string): string {
  if (!instanceId || typeof instanceId !== 'string') throw new TenantError();
  return instanceId;
}

function newId(): string {
  return crypto.randomUUID();
}

/** Upgrades stored payloads written by older schema versions. */
export function migratePayload<T>(payload: unknown, _fromVersion: number): T {
  // v1 is the first schema. Add stepwise migrations here when fields change.
  return payload as T;
}

interface PayloadRow extends Doc {
  instanceId: string;
  payload: Record<string, unknown>;
  schemaVersion?: number;
}

export function createRepositories(gw: DataGateway, rawInstanceId: string) {
  const instanceId = requireInstance(rawInstanceId);

  async function owned(collection: string, id: string): Promise<PayloadRow | null> {
    const doc = (await gw.get(collection, id)) as PayloadRow | null;
    if (!doc || doc.instanceId !== instanceId) return null;
    return doc;
  }

  async function listPayloads<T extends { id: string }>(collection: string, limit = 200): Promise<T[]> {
    const { items } = await gw.find(collection, { eq: { instanceId }, limit });
    return (items as PayloadRow[])
      .filter((d) => d.instanceId === instanceId)
      .map((d) => ({ ...migratePayload<Omit<T, 'id'>>(d.payload, d.schemaVersion ?? 1), id: d._id }) as T);
  }

  // -------------------------------------------------------------------------
  const settings = {
    async get(): Promise<MerchantSettings> {
      const doc = (await gw.get(COLLECTIONS.settings, instanceId)) as PayloadRow | null;
      if (!doc || doc.instanceId !== instanceId) return defaultSettings();
      const stored = migratePayload<Partial<MerchantSettings>>(doc.payload, doc.schemaVersion ?? 1);
      // Defaults fill fields added after the row was written.
      const defaults = defaultSettings();
      return { ...defaults, ...stored, onboarding: { ...defaults.onboarding, ...(stored.onboarding ?? {}) } };
    },
    async save(next: MerchantSettings): Promise<MerchantSettings> {
      await gw.save(COLLECTIONS.settings, {
        _id: instanceId,
        instanceId,
        settingsVersion: next.settingsVersion,
        payload: next as unknown as Record<string, unknown>,
        schemaVersion: SCHEMA_VERSION,
      });
      return next;
    },
    /** Bumps the version so cached routes computed under old settings are ignored. */
    async bumpVersion(): Promise<MerchantSettings> {
      const current = await settings.get();
      return settings.save({ ...current, settingsVersion: current.settingsVersion + 1 });
    },
  };

  // -------------------------------------------------------------------------
  function entityRepo<T extends { id: string; name: string }>(collection: string, indexFields: (e: Omit<T, 'id'>) => Record<string, unknown>) {
    return {
      list: () => listPayloads<T>(collection),
      async get(id: string): Promise<T | null> {
        const doc = await owned(collection, id);
        return doc ? ({ ...migratePayload<Omit<T, 'id'>>(doc.payload, doc.schemaVersion ?? 1), id: doc._id } as T) : null;
      },
      async upsert(entity: Omit<T, 'id'>, id?: string): Promise<T> {
        if (id && !(await owned(collection, id))) throw new TenantError('Not found');
        const _id = id ?? newId();
        await gw.save(collection, {
          _id,
          instanceId,
          ...indexFields(entity),
          payload: entity as unknown as Record<string, unknown>,
          schemaVersion: SCHEMA_VERSION,
        });
        return { ...entity, id: _id } as T;
      },
      async remove(id: string): Promise<boolean> {
        if (!(await owned(collection, id))) return false;
        await gw.remove(collection, id);
        return true;
      },
    };
  }

  const locations = entityRepo<FulfillmentLocation>(COLLECTIONS.locations, (l) => ({ name: l.name, isPrimary: l.isPrimary, active: l.active }));
  const rules = entityRepo<PricingRule>(COLLECTIONS.rules, (r) => ({ title: r.title, code: r.code, priority: r.priority, active: r.active }));
  const zones = entityRepo<DeliveryZone>(COLLECTIONS.zones, (z) => ({ name: z.name, zoneType: z.type, active: z.active }));

  // -------------------------------------------------------------------------
  const routeCache: RouteCacheStore & { purgeExpired(now: Date, max?: number): Promise<number> } = {
    async get(key) {
      const doc = (await gw.get(COLLECTIONS.routeCache, key)) as (PayloadRow & { expiresAt?: Date | string }) | null;
      if (!doc || doc.instanceId !== instanceId) return null;
      const expires = doc.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
      if (expires <= Date.now()) return null;
      return doc.payload as unknown as CachedRoutes;
    },
    async set(key, value, ttlMs) {
      await gw.save(COLLECTIONS.routeCache, {
        _id: key,
        instanceId,
        payload: value as unknown as Record<string, unknown>,
        expiresAt: new Date(Date.now() + ttlMs),
      });
    },
    async purgeExpired(now, max = 100) {
      const { items } = await gw.find(COLLECTIONS.routeCache, { eq: { instanceId }, lt: { field: 'expiresAt', value: now }, limit: max });
      await gw.bulkRemove(COLLECTIONS.routeCache, items.map((d) => d._id));
      return items.length;
    },
  };

  // -------------------------------------------------------------------------
  const billing = {
    async get(): Promise<BillingRow | null> {
      const doc = (await gw.get(COLLECTIONS.billing, instanceId)) as (Doc & BillingRow & { instanceId: string }) | null;
      if (!doc || doc.instanceId !== instanceId) return null;
      return {
        snapshot: (doc.snapshot as BillingSnapshot | null) ?? null,
        usageMonth: (doc.usageMonth as string) ?? '',
        usageCount: Number(doc.usageCount ?? 0),
        lastEventType: (doc.lastEventType as string | null) ?? null,
        lastEventAt: doc.lastEventAt ? new Date(doc.lastEventAt as string).toISOString() : null,
      };
    },
    async save(row: BillingRow): Promise<void> {
      await gw.save(COLLECTIONS.billing, {
        _id: instanceId,
        instanceId,
        snapshot: row.snapshot as unknown as Record<string, unknown>,
        usageMonth: row.usageMonth,
        usageCount: row.usageCount,
        lastEventType: row.lastEventType,
        lastEventAt: row.lastEventAt ? new Date(row.lastEventAt) : null,
        refreshedAt: row.snapshot ? new Date(row.snapshot.fetchedAt) : null,
        schemaVersion: SCHEMA_VERSION,
      });
    },
  };

  // -------------------------------------------------------------------------
  const logs = {
    async insert(entry: CalculationLogEntry): Promise<void> {
      await gw.save(COLLECTIONS.logs, { _id: newId(), instanceId, ...entry, createdAt: new Date(entry.createdAt) });
    },
    async page(q: { status?: string; source?: string; page: number; pageSize: number }) {
      const eq: Record<string, string> = { instanceId };
      if (q.status) eq.status = q.status;
      if (q.source) eq.source = q.source;
      const res = await gw.find(COLLECTIONS.logs, {
        eq,
        sort: { field: 'createdAt', dir: 'desc' },
        limit: q.pageSize,
        skip: q.page * q.pageSize,
        withTotal: true,
      });
      const rows = res.items
        .filter((d) => d.instanceId === instanceId)
        .map((d) => toLogEntry(d));
      return { rows, total: res.total };
    },
    async purgeOlderThan(cutoff: Date, max = 200): Promise<number> {
      const { items } = await gw.find(COLLECTIONS.logs, { eq: { instanceId }, lt: { field: 'createdAt', value: cutoff }, limit: max });
      await gw.bulkRemove(COLLECTIONS.logs, items.map((d) => d._id));
      return items.length;
    },
  };

  // -------------------------------------------------------------------------
  const eventDedupe = {
    /** Returns true the first time a key is seen; false for duplicates. */
    async claim(key: string, kind: string): Promise<boolean> {
      const existing = await gw.get(COLLECTIONS.eventDedupe, key);
      if (existing) return false;
      await gw.save(COLLECTIONS.eventDedupe, { _id: key, instanceId, kind, processedAt: new Date() });
      return true;
    },
  };

  const appInstance = {
    async touch(fields: { installedAt?: Date; removedAt?: Date | null }): Promise<void> {
      const existing = (await gw.get(COLLECTIONS.appInstances, instanceId)) as Doc | null;
      await gw.save(COLLECTIONS.appInstances, {
        ...(existing ?? {}),
        _id: instanceId,
        instanceId,
        lastSeenAt: new Date(),
        ...fields,
        schemaVersion: SCHEMA_VERSION,
      });
    },
  };

  return { instanceId, settings, locations, rules, zones, routeCache, billing, logs, eventDedupe, appInstance };
}

export type Repositories = ReturnType<typeof createRepositories>;

export interface BillingRow {
  snapshot: BillingSnapshot | null;
  usageMonth: string;
  usageCount: number;
  lastEventType: string | null;
  lastEventAt: string | null;
}

/** Privacy-safe calculation log: no names, emails, street lines or coordinates. */
export interface CalculationLogEntry {
  source: 'checkout' | 'simulator';
  status: 'priced' | 'no_rate' | 'fallback' | 'error';
  reason: string;
  providerError: string;
  cacheHit: boolean;
  providerCalls: number;
  latencyMs: number;
  distance: number | null;
  unit: string;
  originLocationId: string;
  optionCodes: string;
  price: string;
  currency: string;
  destCountry: string;
  /** First 3 characters of the postal code at most. */
  destPostalPrefix: string;
  /** Hash of Wix's requestId; lets support correlate with Wix logs without storing raw IDs. */
  requestRef: string;
  createdAt: string;
  /** Full diagnostics for troubleshooting; null on rows written before it existed. */
  details: CalculationLogDetails | null;
}

/** Everything needed to explain one calculation. JSON-safe (money as decimal strings) and PII-free. */
export interface CalculationLogDetails {
  routingProvider: string | null;
  budgetMs: number;
  readTimeoutMs: number;
  attemptTimeoutMs: number;
  timings: { configMs: number | null; quoteMs: number | null; writeBudgetMs: number };
  /** Why settings/billing could not be read (TIMEOUT, AUTH, NETWORK), if they could not. */
  configError: string | null;
  entitlement: { plan: string; status: string; usedLookupsThisMonth: number; monthlyLookups: number } | null;
  settings: { settingsVersion: number; failureMode: string; accessEndBehavior: string; originStrategy: string; unit: string } | null;
  /** One entry per provider attempt, with timing and error. */
  trace: { step: string; attempt: number; ms: number; error: string | null; httpStatus: number | null; message: string | null; match?: string | null }[];
  /** Subtotal after discounts in micro-units (1/1,000,000 of the currency unit). */
  cart: { lines: number; shippableLines: number; subtotalMicros: string; weightUnit: string | null };
  destination: { country: string; subdivision: string; postalPrefix: string };
  geocodeQuality: string | null;
  options: {
    code: string;
    title: string;
    ruleId: string | null;
    price: string;
    handling: string;
    freeDelivery: boolean;
    billedUnits: number | null;
    /** Pricing steps; amounts are micro-unit strings. */
    breakdown: Record<string, unknown>[];
  }[];
  ruleDiagnostics: { ruleId: string; name: string; reason: string }[];
}

function toLogEntry(d: Doc): CalculationLogEntry & { id: string } {
  const created = d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt ?? '');
  return {
    id: d._id,
    source: d.source as CalculationLogEntry['source'],
    status: d.status as CalculationLogEntry['status'],
    reason: String(d.reason ?? ''),
    providerError: String(d.providerError ?? ''),
    cacheHit: Boolean(d.cacheHit),
    providerCalls: Number(d.providerCalls ?? 0),
    latencyMs: Number(d.latencyMs ?? 0),
    distance: d.distance == null ? null : Number(d.distance),
    unit: String(d.unit ?? ''),
    originLocationId: String(d.originLocationId ?? ''),
    optionCodes: String(d.optionCodes ?? ''),
    price: String(d.price ?? ''),
    currency: String(d.currency ?? ''),
    destCountry: String(d.destCountry ?? ''),
    destPostalPrefix: String(d.destPostalPrefix ?? ''),
    requestRef: String(d.requestRef ?? ''),
    createdAt: created,
    details: d.details && typeof d.details === 'object' ? (d.details as CalculationLogDetails) : null,
  };
}
