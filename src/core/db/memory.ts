// Test double behind the same Db interface, and the store of the dev memory
// runtime. Rows are stored in their column shape (snake_case, as PostgREST
// returns them) and go through the production mapping. RLS is emulated from permissionMatrix() plus the register_table
// policies parsed from supabase/migrations, so a module's new table is covered
// as soon as its migration exists. Two memoryDb calls on the same seed object
// share one database, so a test can act as two users.
// Known gaps against Postgres: CHECK constraints, FK cascades and triggers
// other than the managed columns are not emulated.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newId } from '@/core/brand';
import type { Actor } from '@/core/auth';
import { aalOk, grantOf, permissionMatrix, type Permission } from '@/core/permissions';
import { DbError } from './errors';
import { draftMatches, filtersOf, fromColumns, toColumns, columnOf, type Filter } from './mapping';
import { parseCatalog, type CatalogTable } from './sql-catalog';
import type { BaseRow, Db, DraftOf, RpcMap, Table, TableDef, Where, WriteGuard } from './index';

type Row = Record<string, unknown>;
type Seed = Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>;

interface Store {
  tables: Map<string, Row[]>;
  seq: number;
}

// On globalThis so the dev memory runtime (src/core/dev) keeps its data across a hot reload of this module.
const STORES = Symbol.for('sce.memoryDb.stores');
const stores: WeakMap<object, Store> = ((globalThis as { [STORES]?: WeakMap<object, Store> })[STORES] ??= new WeakMap());
let catalog: ReadonlyMap<string, CatalogTable> | null = null;

function loadCatalog(): ReadonlyMap<string, CatalogTable> {
  if (!catalog) {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const files = readdirSync(dir)
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
    catalog = parseCatalog(files);
  }
  return catalog;
}

function storeFor(seed: Seed): Store {
  let store = stores.get(seed);
  if (!store) {
    store = { tables: new Map(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => structuredClone(r))])), seq: 0 };
    stores.set(seed, store);
  }
  return store;
}

/** Test-only: the raw rows of a table, e.g. to assert the audit log. */
export function inspectMemoryDb(seed: Seed, table: string): ReadonlyArray<Row> {
  return structuredClone(storeFor(seed).tables.get(table) ?? []);
}

function rowsOf(store: Store, table: string): Row[] {
  let rows = store.tables.get(table);
  if (!rows) {
    rows = [];
    store.tables.set(table, rows);
  }
  return rows;
}

function matches(row: Row, filters: ReadonlyArray<Filter>): boolean {
  return filters.every((f) => {
    const v = row[f.column];
    if (f.op === 'is_null') return v === null || v === undefined;
    if (f.op === 'in') return f.values.some((x) => x === v);
    return v === f.value;
  });
}

const randomCode = (length: number) =>
  Array.from({ length }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]).join('');

class Rls {
  constructor(
    private readonly store: Store,
    private readonly actor: Actor,
  ) {}

  private get active(): boolean {
    return this.actor.profile.status === 'active';
  }
  private grant(perm: string) {
    const def = permissionMatrix().get(perm as Permission);
    return def && this.active ? grantOf(this.actor, def) : 'none';
  }
  hasPerm(perm: string): boolean {
    return this.active && aalOk(this.actor) && this.grant(perm) === 'all';
  }
  canOnDepartments(perm: string, lead: unknown, supporting: unknown): boolean {
    if (!this.active || !aalOk(this.actor)) return false;
    const g = this.grant(perm);
    if (g === 'all') return true;
    if (g !== 'department') return false;
    const dept = this.actor.profile.department;
    return dept !== null && (dept === lead || (Array.isArray(supporting) && supporting.includes(dept)));
  }
  hasEventPerm(perm: string, eventId: unknown): boolean {
    const ev = rowsOf(this.store, 'sce_tcsk_events').find((e) => e.id === eventId);
    if (!ev) return false;
    if (ev.deleted_at && this.actor.profile.role !== 'admin') return false;
    return this.canOnDepartments(perm, ev.department, ev.supporting_departments);
  }

  /** Mirrors the policies of 0001/0002/0006: events have their own, every registered table one shape. */
  allows(table: CatalogTable | undefined, op: 'read' | 'insert' | 'update_using' | 'update_check' | 'delete', row: Row): boolean {
    if (!table) return false;
    if (table.name === 'sce_tcsk_events') {
      switch (op) {
        case 'read':
          return row.deleted_at
            ? this.canOnDepartments('progress.delete', row.department, [])
            : this.canOnDepartments('progress.read', row.department, row.supporting_departments);
        case 'insert':
          return !row.deleted_at && this.canOnDepartments('progress.create', row.department, []);
        case 'update_using':
          return this.canOnDepartments('progress.write', row.department, []);
        case 'update_check':
          return this.canOnDepartments('progress.write', row.department, []) && (!row.deleted_at || this.canOnDepartments('progress.delete', row.department, []));
        case 'delete':
          return this.actor.profile.role === 'admin' && aalOk(this.actor);
      }
    }
    const policy = table.policy;
    if (!policy) return false;
    if (policy.immutable && (op === 'update_using' || op === 'update_check' || op === 'delete')) return false;
    const perm = op === 'read' ? policy.read : policy.write;
    return policy.scope === 'event' ? this.hasEventPerm(perm, row.event_id) : this.hasPerm(perm);
  }
}

function memoryTable<R extends BaseRow>(store: Store, actor: Actor, rls: Rls, def: TableDef<R>): Table<R> {
  const name = def.name;
  const meta = loadCatalog().get(name);
  const all = () => rowsOf(store, name);
  const visible = () => all().filter((r) => rls.allows(meta, 'read', r));
  const parse = (r: Row) => fromColumns(def, structuredClone(r));
  const now = () => new Date().toISOString();

  function withDefaults(values: Row): Row {
    const row: Row = { ...values };
    for (const col of meta?.columns ?? []) {
      if (row[col.name] !== undefined) continue;
      const d = col.default;
      row[col.name] =
        d === null ? null : d.kind === 'now' ? now() : d.kind === 'uuid' ? newId() : d.kind === 'random_code' ? randomCode(d.length) : structuredClone(d.value ?? null);
    }
    return row;
  }

  /** Postgres runs the RLS WITH CHECK before NOT NULL and unique checks; keep that order. */
  function assertNotNull(row: Row): void {
    const missing = meta?.columns.find((c) => c.notNull && (row[c.name] === null || row[c.name] === undefined));
    if (missing) throw new DbError('constraint', { table: name, constraint: `${name}_${missing.name}_not_null` });
  }

  function assertUnique(row: Row, except?: Row): void {
    for (const u of meta?.uniques ?? []) {
      if (u.columns.some((c) => row[c] === null || row[c] === undefined)) continue;
      const clash = all().find((r) => r !== except && u.columns.every((c) => r[c] === row[c]));
      if (clash) throw new DbError('constraint', { table: name, constraint: u.name });
    }
  }

  function insertRow(values: Row): Row {
    const row = withDefaults(values);
    row.version = 1;
    row.created_at = row.updated_at = now();
    row.created_by = row.updated_by = actor.profile.id;
    if (!rls.allows(meta, 'insert', row)) throw new DbError('forbidden', { table: name });
    assertNotNull(row);
    assertUnique(row);
    all().push(row);
    return row;
  }

  function writeRow(target: Row, values: Row): Row {
    if ('event_id' in values && values.event_id !== target.event_id) throw new DbError('constraint', { table: name, constraint: 'event_id is immutable' });
    const next: Row = { ...target, ...values, version: Number(target.version) + 1, updated_at: now(), updated_by: actor.profile.id };
    if (!rls.allows(meta, 'update_check', next)) throw new DbError('forbidden', { table: name });
    assertNotNull(next);
    assertUnique(next, target);
    Object.assign(target, next);
    return target;
  }

  const visibleById = (id: unknown) => visible().find((r) => r.id === id);

  function explainMiss(id: unknown, guard: WriteGuard | undefined): never {
    const existing = visibleById(id);
    if (!existing) throw new DbError('not_found', { table: name });
    if (guard && 'expectedVersion' in guard && existing.version !== guard.expectedVersion) throw new DbError('conflict', { table: name });
    throw new DbError('forbidden', { table: name });
  }

  return {
    async list(where?: Where<R>, opts?: { limit?: number }) {
      const filters = filtersOf(def, where);
      const rows = visible().filter((r) => matches(r, filters));
      const order = [...(def.orderBy ?? []).map((o) => ({ column: columnOf(def, o.column), ascending: o.ascending })), { column: 'id', ascending: true }];
      rows.sort((a, b) => {
        for (const o of order) {
          const [x, y] = [a[o.column], b[o.column]] as [string | number, string | number];
          if (x !== y) return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
        }
        return 0;
      });
      return rows.slice(0, opts?.limit ?? rows.length).map(parse);
    },
    async get(id) {
      const row = visibleById(id);
      return row ? parse(row) : null;
    },
    async insert(draft: DraftOf<R>) {
      const id = draft.id ?? newId();
      const existing = all().find((r) => r.id === id);
      if (existing) {
        const seen = visibleById(id);
        if (seen && draftMatches({ ...draft, id }, parse(seen))) return parse(seen);
        throw new DbError('conflict', { table: name, constraint: `${name}_pkey` });
      }
      return parse(insertRow({ ...toColumns(def, draft), id }));
    },
    async insertMany(drafts) {
      const out: R[] = [];
      for (const d of drafts) {
        const id = d.id ?? newId();
        const existing = visibleById(id);
        out.push(existing ? parse(existing) : parse(insertRow({ ...toColumns(def, d), id })));
      }
      return out;
    },
    async upsertOn(key, draft) {
      const values = toColumns(def, draft);
      const cols = key.map((k) => columnOf(def, k));
      if (!key.includes('id' as keyof R & string)) delete values.id;
      const target = all().find((r) => cols.every((c) => r[c] === values[c]));
      if (!target) return parse(insertRow({ ...values, id: values.id ?? newId() }));
      if (!rls.allows(meta, 'update_using', target)) throw new DbError('forbidden', { table: name });
      return parse(writeRow(target, values));
    },
    async update(id, patch, guard) {
      const values = toColumns(def, patch);
      delete values.id;
      const target = all().find((r) => r.id === id);
      const writable = target && rls.allows(meta, 'read', target) && rls.allows(meta, 'update_using', target);
      const versionOk = target && (!('expectedVersion' in guard) || target.version === guard.expectedVersion);
      if (!target || !writable || !versionOk) return explainMiss(id, guard);
      if (Object.keys(values).length === 0) return parse(target);
      return parse(writeRow(target, values));
    },
    async remove(id, guard) {
      const rows = all();
      const i = rows.findIndex((r) => r.id === id);
      const target = rows[i];
      const versionOk = target && (!guard || !('expectedVersion' in guard) || target.version === guard.expectedVersion);
      if (target && versionOk && rls.allows(meta, 'read', target) && rls.allows(meta, 'delete', target)) {
        rows.splice(i, 1);
        return;
      }
      if (!visibleById(id) && !(guard && 'expectedVersion' in guard)) return;
      explainMiss(id, guard);
    },
    async removeWhere(where) {
      const filters = filtersOf(def, where);
      if (filters.length === 0) throw new Error(`${name}: removeWhere needs at least one condition`);
      const rows = all();
      const doomed = rows.filter((r) => matches(r, filters) && rls.allows(meta, 'read', r) && rls.allows(meta, 'delete', r));
      store.tables.set(name, rows.filter((r) => !doomed.includes(r)));
      return doomed.length;
    },
  };
}

const PROFILE_TABLE = 'sce_tcsk_profiles';

function rpcHandlers(store: Store, actor: Actor, rls: Rls): { readonly [K in keyof RpcMap]: (args: RpcMap[K]['args']) => RpcMap[K]['result'] } {
  const audit = (action: string, summary: string, eventId: string | null, entity: string | null, entityId: string | null) => {
    if (actor.profile.status !== 'active') throw new DbError('forbidden');
    store.seq += 1;
    rowsOf(store, 'sce_tcsk_audit_logs').push({
      id: store.seq, actor_id: actor.profile.id, actor_email: actor.profile.email, action, summary,
      event_id: eventId, entity, entity_id: entityId, created_at: new Date().toISOString(),
    });
  };
  const assertManage = () => {
    if (!rls.hasPerm('core.users.manage')) throw new DbError('forbidden');
  };
  const assertAdminRemains = () => {
    if (!rowsOf(store, PROFILE_TABLE).some((p) => p.role === 'admin' && p.status === 'active')) throw new DbError('constraint', { constraint: 'last_admin' });
  };
  const profile = (id: unknown) => {
    const p = rowsOf(store, PROFILE_TABLE).find((r) => r.id === id);
    if (!p) throw new DbError('not_found', { table: PROFILE_TABLE });
    return p;
  };
  /** Runs fn on a copy of profiles and keeps it only if the last-admin rule still holds. */
  const transact = <T>(fn: () => T): T => {
    const before = structuredClone(rowsOf(store, PROFILE_TABLE));
    try {
      const out = fn();
      assertAdminRemains();
      return out;
    } catch (e) {
      store.tables.set(PROFILE_TABLE, before);
      throw e;
    }
  };
  return {
    sce_tcsk_write_audit: (a) => audit(a.action, a.summary, a.eventId, a.entity, a.entityId),
    sce_tcsk_create_backup: (a) => {
      if (a.kind === 'manual' ? !rls.hasPerm('core.backups.create') : actor.profile.status !== 'active') throw new DbError('forbidden');
      store.seq += 1;
      const id = store.seq;
      const data = Object.fromEntries([...store.tables].filter(([t]) => loadCatalog().get(t)?.policy || t === 'sce_tcsk_events').map(([t, rows]) => [t, structuredClone(rows)]));
      rowsOf(store, 'sce_tcsk_backups').push({ id, data, note: a.note, kind: a.kind, format: 2, created_by: actor.profile.id, created_at: new Date().toISOString() });
      if (a.kind === 'manual') audit('TẠO BẢN SAO LƯU', a.note, null, 'backup', String(id));
      return { id };
    },
    sce_tcsk_restore_backup: (a) => {
      if (!rls.hasPerm('core.backups.restore')) throw new DbError('forbidden');
      const backup = rowsOf(store, 'sce_tcsk_backups').find((b) => b.id === a.id);
      if (!backup) throw new DbError('not_found');
      for (const [t, rows] of Object.entries(backup.data as Record<string, Row[]>)) store.tables.set(t, structuredClone(rows));
      audit('KHÔI PHỤC SAO LƯU', `Khôi phục từ bản #${a.id}`, null, 'backup', String(a.id));
    },
    sce_tcsk_set_profile_role: (a) => {
      assertManage();
      const old = transact(() => {
        const p = profile(a.id);
        const prev = p.role;
        p.role = a.role;
        return prev;
      });
      audit('PHÂN QUYỀN TÀI KHOẢN', `${String(old)} -> ${a.role}`, null, 'profile', a.id);
    },
    sce_tcsk_set_profile_department: (a) => {
      assertManage();
      profile(a.id).department = a.department;
      audit('CHUYỂN PHÒNG BAN', a.department, null, 'profile', a.id);
    },
    sce_tcsk_set_profile_status: (a) => {
      assertManage();
      if (a.status === 'locked' && a.ids.includes(actor.profile.id)) throw new DbError('constraint', { constraint: 'cannot_lock_self' });
      const n = transact(() => {
        const changed = rowsOf(store, PROFILE_TABLE).filter((p) => a.ids.includes(p.id as never) && p.status !== a.status);
        for (const p of changed) p.status = a.status;
        return changed.length;
      });
      audit(a.status === 'active' ? 'DUYỆT/MỞ KHÓA TÀI KHOẢN' : 'KHÓA TÀI KHOẢN', `${n} tài khoản`, null, 'profile', a.ids.join(','));
      return n;
    },
    sce_tcsk_ensure_profile: () => undefined,
  };
}

export function memoryDb(seed: Seed, actor: Actor): Db {
  const store = storeFor(seed);
  const rls = new Rls(store, actor);
  const handlers = rpcHandlers(store, actor, rls);
  return {
    table: (def) => memoryTable(store, actor, rls, def),
    async rpc<K extends keyof RpcMap>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']> {
      const handler = handlers[name] as ((a: RpcMap[K]['args']) => RpcMap[K]['result']) | undefined;
      if (!handler) throw new Error(`rpc ${String(name)} is not allowlisted`);
      return handler(args);
    },
  };
}
