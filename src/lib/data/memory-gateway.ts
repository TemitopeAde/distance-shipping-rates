/** In-memory DataGateway for tests and local reasoning. Not used in production. */
import type { DataGateway, Doc, FindQuery, FindResult } from './gateway';

export class MemoryGateway implements DataGateway {
  readonly tables = new Map<string, Map<string, Doc>>();
  calls = 0;

  private table(name: string): Map<string, Doc> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  async get(collection: string, id: string): Promise<Doc | null> {
    this.calls++;
    const doc = this.table(collection).get(id);
    return doc ? structuredClone(doc) : null;
  }

  async find(collection: string, q: FindQuery): Promise<FindResult> {
    this.calls++;
    let rows = [...this.table(collection).values()];
    for (const [k, v] of Object.entries(q.eq ?? {})) rows = rows.filter((r) => r[k] === v);
    if (q.lt) {
      const { field, value } = q.lt;
      rows = rows.filter((r) => r[field] instanceof Date && (r[field] as Date).getTime() < value.getTime());
    }
    if (q.sort) {
      const { field, dir } = q.sort;
      rows.sort((a, b) => {
        const av = a[field] instanceof Date ? (a[field] as Date).getTime() : (a[field] as number);
        const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : (b[field] as number);
        return dir === 'asc' ? av - bv : bv - av;
      });
    }
    const total = rows.length;
    rows = rows.slice(q.skip ?? 0, (q.skip ?? 0) + (q.limit ?? 50));
    return { items: rows.map((r) => structuredClone(r)), total: q.withTotal ? total : null };
  }

  async save(collection: string, doc: Doc): Promise<Doc> {
    this.calls++;
    this.table(collection).set(doc._id, structuredClone(doc));
    return doc;
  }

  async remove(collection: string, id: string): Promise<void> {
    this.calls++;
    this.table(collection).delete(id);
  }

  async bulkRemove(collection: string, ids: string[]): Promise<void> {
    this.calls++;
    for (const id of ids) this.table(collection).delete(id);
  }
}
