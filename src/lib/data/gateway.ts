/**
 * Minimal storage port. Repositories depend on this interface so tenant
 * scoping can be unit-tested without Wix; the Wix implementation lives in
 * `wix-gateway.ts`.
 */
export interface Doc {
  _id: string;
  [key: string]: unknown;
}

export interface FindQuery {
  eq?: Record<string, string | number | boolean>;
  lt?: { field: string; value: Date };
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
  skip?: number;
  /** Ask the store for a total count of matching rows. */
  withTotal?: boolean;
}

export interface FindResult {
  items: Doc[];
  total: number | null;
}

export interface DataGateway {
  get(collection: string, id: string): Promise<Doc | null>;
  find(collection: string, query: FindQuery): Promise<FindResult>;
  /** Insert or replace by `_id`. */
  save(collection: string, doc: Doc): Promise<Doc>;
  remove(collection: string, id: string): Promise<void>;
  bulkRemove(collection: string, ids: string[]): Promise<void>;
}

export const APP_NAMESPACE = '@admin14744/distance-shipping-rates';

export const COLLECTIONS = {
  appInstances: `${APP_NAMESPACE}/app-instances`,
  settings: `${APP_NAMESPACE}/merchant-settings`,
  locations: `${APP_NAMESPACE}/fulfillment-locations`,
  rules: `${APP_NAMESPACE}/pricing-rules`,
  zones: `${APP_NAMESPACE}/delivery-zones`,
  routeCache: `${APP_NAMESPACE}/route-cache`,
  logs: `${APP_NAMESPACE}/calculation-logs`,
  billing: `${APP_NAMESPACE}/billing-state`,
  eventDedupe: `${APP_NAMESPACE}/event-dedupe`,
} as const;
