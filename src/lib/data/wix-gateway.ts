/**
 * Wix Data implementation of the storage port. Runs only in backend code
 * (service plugin, events, API routes), elevated so app-private collections
 * with PRIVILEGED permissions are reachable. Callers must authorize first.
 */
import { items } from '@wix/data';
import { auth } from '@wix/essentials';
import type { DataGateway, Doc, FindQuery, FindResult } from './gateway';

const elevatedGet = auth.elevate(items.get);
const elevatedQuery = auth.elevate(items.query);
const elevatedSave = auth.elevate(items.save);
const elevatedRemove = auth.elevate(items.remove);
const elevatedBulkRemove = auth.elevate(items.bulkRemove);

export const wixGateway: DataGateway = {
  async get(collection, id) {
    const doc = await elevatedGet(collection, id);
    return (doc as Doc | null) ?? null;
  },

  async find(collection, q: FindQuery): Promise<FindResult> {
    let query = elevatedQuery(collection);
    for (const [field, value] of Object.entries(q.eq ?? {})) query = query.eq(field, value);
    if (q.lt) query = query.lt(q.lt.field, q.lt.value);
    if (q.sort) query = q.sort.dir === 'asc' ? query.ascending(q.sort.field) : query.descending(q.sort.field);
    if (q.limit) query = query.limit(q.limit);
    if (q.skip) query = query.skip(q.skip);
    const result = await query.find({ returnTotalCount: q.withTotal === true });
    return { items: result.items as Doc[], total: q.withTotal ? (result.totalCount ?? null) : null };
  },

  async save(collection, doc) {
    return (await elevatedSave(collection, doc)) as Doc;
  },

  async remove(collection, id) {
    await elevatedRemove(collection, id);
  },

  async bulkRemove(collection, ids) {
    if (ids.length === 0) return;
    await elevatedBulkRemove(collection, ids);
  },
};
