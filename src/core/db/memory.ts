// Test double behind the same Db interface, and the store of the dev memory
// runtime. Rows are stored in their column shape (snake_case, as PostgREST
// returns them) and go through the production mapping. RLS is emulated from permissionMatrix() plus the register_table
// policies parsed from supabase/migrations, so a module's new table is covered
// as soon as its migration exists. Two memoryDb calls on the same seed object
// share one database, so a test can act as two users.
// A security_invoker view of one table and its left joins is read as Postgres
// reads it, each table under its own RLS (sce_tcsk_guest_roster); other views
// fail on read. Foreign keys between app tables act on delete as the migrations declare
// (cascade, set null, no action), past RLS as in Postgres. created_at is
// strictly increasing per store, and one insertMany shares one timestamp, as
// one statement does. Known gaps against Postgres: CHECK constraints, FK checks
// on insert and update, and triggers other than the managed columns. A test or
// dev seed can mirror one such rule with declareGuard.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newId, type Instant, type IsoDate } from '@/core/brand';
import type { Actor } from '@/core/auth';
import { parseHolidayRows, parseProfileRow } from '@/core/auth/profile';
import { formatVNDate, formatVNTime, todayVN } from '@/core/dates';
import { parseSettingsRow } from '@/core/settings';
import { aalOk, grantOf, permissionMatrix, type Permission } from '@/core/permissions';
import { ROLES, type Role } from '@/core/vocab';
import { DbError } from './errors';
import { draftMatches, filtersOf, fromColumns, toColumns, columnOf, type Filter } from './mapping';
import { parseAuditRow, parseBackupRow, settingsPatchColumns } from './rpc';
import { parseCatalog, parseViews, type CatalogTable, type CatalogView } from './sql-catalog';
import type { AnyTable, AnyTableDef, AuditWriter, BaseRow, CommandAuditRow, Db, DraftOf, RpcMap, TableDef, Where, WriteGuard } from './index';

type Row = Record<string, unknown>;
type Seed = Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>;

interface Store {
  tables: Map<string, Row[]>;
  seq: number;
  guards?: Map<string, MemoryGuard[]>;
  /** The last created_at or updated_at handed out, in ms. Absent on a store made before a hot reload added it. */
  lastStamp?: number;
}

/** Now, or 1 ms after the previous stamp, so rows written in the same millisecond keep their order. */
function stamp(store: Store): string {
  const at = Math.max(Date.now(), (store.lastStamp ?? 0) + 1);
  store.lastStamp = at;
  return new Date(at).toISOString();
}

const keyOf = (row: Row, columns: ReadonlyArray<string>) => JSON.stringify(columns.map((c) => row[c]));

/**
 * Deletes rows the way one DELETE statement does: every foreign key into them cascades, sets null or, for no action
 * and restrict, refuses the whole statement. These actions run past RLS, as Postgres runs them.
 */
function deleteRows(store: Store, table: string, doomed: ReadonlyArray<Row>): void {
  const deletes = new Map<string, Set<Row>>();
  const nulls: Array<{ row: Row; columns: ReadonlyArray<string> }> = [];
  const blocked: Array<{ refs: ReadonlyArray<Row>; table: string; constraint: string }> = [];
  const visit = (name: string, rows: ReadonlyArray<Row>) => {
    const set = deletes.get(name) ?? new Set<Row>();
    deletes.set(name, set);
    const fresh = rows.filter((r) => !set.has(r));
    for (const r of fresh) set.add(r);
    if (fresh.length === 0) return;
    for (const child of loadCatalog().values()) {
      for (const fk of child.foreignKeys) {
        if (fk.table !== name) continue;
        const keys = new Set(fresh.map((r) => keyOf(r, fk.refColumns)));
        const refs = rowsOf(store, child.name).filter((r) => fk.columns.every((c) => r[c] !== null && r[c] !== undefined) && keys.has(keyOf(r, fk.columns)));
        if (refs.length === 0) continue;
        if (fk.onDelete === 'cascade') visit(child.name, refs);
        else if (fk.onDelete === 'set null') nulls.push(...refs.map((row) => ({ row, columns: fk.columns })));
        else blocked.push({ refs, table: child.name, constraint: fk.name });
      }
    }
  };
  visit(table, doomed);
  const stillThere = blocked.find((b) => b.refs.some((r) => !deletes.get(b.table)?.has(r)));
  if (stillThere) throw new DbError('constraint', { table: stillThere.table, constraint: stillThere.constraint });
  for (const [name, set] of deletes) store.tables.set(name, rowsOf(store, name).filter((r) => !set.has(r)));
  for (const { row, columns } of nulls) for (const c of columns) row[c] = null;
}

// On globalThis so the dev memory runtime (src/core/dev) keeps its data across a hot reload of this module.
const STORES = Symbol.for('sce.memoryDb.stores');
const stores: WeakMap<object, Store> = ((globalThis as { [STORES]?: WeakMap<object, Store> })[STORES] ??= new WeakMap());
let catalog: { tables: ReadonlyMap<string, CatalogTable>; views: ReadonlyMap<string, CatalogView> } | null = null;

function loadSchema() {
  if (!catalog) {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const files = readdirSync(dir)
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
    catalog = { tables: parseCatalog(files), views: parseViews(files) };
  }
  return catalog;
}
const loadCatalog = () => loadSchema().tables;

function storeFor(seed: Seed): Store {
  let store = stores.get(seed);
  if (!store) {
    store = { tables: new Map(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => structuredClone(r))])), seq: 0 };
    stores.set(seed, store);
  }
  return store;
}

/**
 * A rule the SQL enforces that memoryDb cannot read from the migrations: a CHECK constraint, a restrictive policy, a
 * trigger that refuses a write. It sees the row in its column shape (snake_case) after RLS and NOT NULL, and refuses
 * by throwing, best a DbError with the constraint's name. `before` is the stored row (null on insert); on delete `row`
 * is the stored row too. A trigger that changes the row is not expressible here: write the column in the command.
 */
export type MemoryGuard = (write: { op: 'insert' | 'update' | 'delete'; row: Readonly<Row>; before: Readonly<Row> | null; actor: Actor }) => void;

/**
 * Test and dev-seed hook: runs `guard` on every insert, update and direct delete of `table` in the database behind
 * `seed`, and nowhere else. Cascaded deletes skip it, as they skip RLS. Mirror one SQL rule per guard and name it.
 */
export function declareGuard(seed: Seed, table: `sce_tcsk_${string}`, guard: MemoryGuard): void {
  const store = storeFor(seed);
  store.guards ??= new Map();
  store.guards.set(table, [...(store.guards.get(table) ?? []), guard]);
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
  /** The sce_read policy of sce_tcsk_profiles in 0001. */
  seesProfile(row: Row): boolean {
    if (row.id === this.actor.profile.id) return true;
    if (!this.active || !aalOk(this.actor)) return false;
    const g = this.grant('core.users.read');
    return g === 'all' || (g === 'department' && this.actor.profile.department !== null && row.department === this.actor.profile.department);
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

/**
 * A TableDef no other module can name. memoryAuditWriter() finds a memoryDb's store by asking its table() for it,
 * because every test wrapper of a Db forwards table().
 */
const STORE_PROBE = { name: 'sce_tcsk_audit_logs', owner: 'core', eventScoped: false, row: { parse: () => ({}) } } as unknown as TableDef<BaseRow>;
const probedStores = new WeakMap<object, Store>();

/** list(): the rows that match `where`, in the def's order and then by id, up to `limit`. */
function listed<R extends BaseRow>(def: AnyTableDef<R>, rows: ReadonlyArray<Row>, where?: Where<R>, opts?: { limit?: number }): Row[] {
  const filters = filtersOf(def, where);
  const hits = rows.filter((r) => matches(r, filters));
  const order = [...(def.orderBy ?? []).map((o) => ({ column: columnOf(def, o.column), ascending: o.ascending })), { column: 'id', ascending: true }];
  hits.sort((a, b) => {
    for (const o of order) {
      const [x, y] = [a[o.column], b[o.column]] as [string | number, string | number];
      if (x !== y) return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
    }
    return 0;
  });
  return hits.slice(0, opts?.limit ?? hits.length);
}

/**
 * A security_invoker view as parseViews reads it: the from table's visible rows, each left joined to the visible rows
 * of every joined table (one output row per match, nulls without one). Writes fail, as on a join view in Postgres.
 */
function memoryView<R extends BaseRow>(store: Store, rls: Rls, def: AnyTableDef<R>, view: CatalogView): AnyTable<R> {
  const rows = (): Row[] => {
    if ('unsupported' in view) throw new Error(`${view.name}: memoryDb emulates only a security_invoker view of one table and its left joins on equal columns`);
    const visibleIn = (table: string) => rowsOf(store, table).filter((r) => rls.allows(loadCatalog().get(table), 'read', r));
    return view.joins.reduce<Row[]>((acc, j) => {
      const byKey = new Map<string, Row[]>();
      for (const r of visibleIn(j.table)) {
        const k = keyOf(r, j.on.map(([col]) => col));
        const same = byKey.get(k);
        if (same) same.push(r);
        else byKey.set(k, [r]);
      }
      return acc.flatMap((row) => {
        const hits = byKey.get(keyOf(row, j.on.map(([, col]) => col))) ?? [null];
        return hits.map((hit) => ({ ...row, ...Object.fromEntries(j.columns.map(([col, as]) => [as, hit?.[col] ?? null])) }));
      });
    }, visibleIn(view.from));
  };
  const parse = (r: Row) => fromColumns(def, structuredClone(r));
  const readOnly = async (): Promise<never> => {
    throw new Error(`${def.name} is a view: memoryDb, like Postgres for a join view, does not write through it`);
  };
  return {
    list: async (where, opts) => listed(def, rows(), where, opts).map(parse),
    get: async (id) => {
      const row = rows().find((r) => r.id === id);
      return row ? parse(row) : null;
    },
    insert: readOnly, insertMany: readOnly, upsertOn: readOnly, update: readOnly, remove: readOnly, removeWhere: readOnly,
  };
}

function memoryTable<R extends BaseRow>(store: Store, actor: Actor, rls: Rls, def: AnyTableDef<R>): AnyTable<R> {
  if ((def as object) === STORE_PROBE) {
    const probe = {} as AnyTable<R>;
    probedStores.set(probe, store);
    return probe;
  }
  const view = loadSchema().views.get(def.name);
  if (view) return memoryView(store, rls, def, view);
  const name = def.name;
  const meta = loadCatalog().get(name);
  for (const field of def.defaulted ?? []) {
    const column = columnOf(def, field);
    if (meta?.columns.find((c) => c.name === column)?.default == null) throw new Error(`${name}: ${field} is listed as defaulted but ${column} has no default in the migrations`);
  }
  const all = () => rowsOf(store, name);
  const visible = () => all().filter((r) => rls.allows(meta, 'read', r));
  const parse = (r: Row) => fromColumns(def, structuredClone(r));
  const now = () => stamp(store);
  const runGuards = (op: 'insert' | 'update' | 'delete', row: Row, before: Row | null) => {
    for (const g of store.guards?.get(name) ?? []) g({ op, row, before, actor });
  };

  function withDefaults(values: Row, at: string): Row {
    const row: Row = { ...values };
    for (const col of meta?.columns ?? []) {
      if (row[col.name] !== undefined) continue;
      const d = col.default;
      row[col.name] =
        d === null ? null : d.kind === 'now' ? at : d.kind === 'uuid' ? newId() : d.kind === 'random_code' ? randomCode(d.length) : structuredClone(d.value ?? null);
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

  /** The unique keys of the stored rows, for checking a batch in one pass instead of one scan per row. */
  function uniqueIndex() {
    const uniqueKey = (row: Row, columns: ReadonlyArray<string>) =>
      columns.some((c) => row[c] === null || row[c] === undefined) ? null : keyOf(row, columns);
    const keys = (meta?.uniques ?? []).map((u) => ({ ...u, seen: new Set(all().flatMap((r) => uniqueKey(r, u.columns) ?? [])) }));
    return {
      assert(row: Row): void {
        const clash = keys.find((u) => {
          const key = uniqueKey(row, u.columns);
          return key !== null && u.seen.has(key);
        });
        if (clash) throw new DbError('constraint', { table: name, constraint: clash.name });
      },
      add(row: Row): void {
        for (const u of keys) {
          const key = uniqueKey(row, u.columns);
          if (key !== null) u.seen.add(key);
        }
      },
    };
  }

  /** A new row as Postgres would store it, checked but not yet stored. `at` is the statement's timestamp. */
  function newRow(values: Row, assertKeys: (row: Row) => void, at = now()): Row {
    const row = withDefaults(values, at);
    row.version = 1;
    row.created_at = row.updated_at = at;
    row.created_by = row.updated_by = actor.profile.id;
    if (!rls.allows(meta, 'insert', row)) throw new DbError('forbidden', { table: name });
    assertNotNull(row);
    runGuards('insert', row, null);
    assertKeys(row);
    return row;
  }

  function insertRow(values: Row): Row {
    const row = newRow(values, (r) => assertUnique(r));
    all().push(row);
    return row;
  }

  function writeRow(target: Row, values: Row): Row {
    if ('event_id' in values && values.event_id !== target.event_id) throw new DbError('constraint', { table: name, constraint: 'event_id is immutable' });
    const next: Row = { ...target, ...values, version: Number(target.version) + 1, updated_at: now(), updated_by: actor.profile.id };
    if (!rls.allows(meta, 'update_check', next)) throw new DbError('forbidden', { table: name });
    assertNotNull(next);
    runGuards('update', next, target);
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
    async list(where, opts) {
      return listed(def, visible(), where, opts).map(parse);
    },
    async get(id) {
      const row = visibleById(id);
      return row ? parse(row) : null;
    },
    async insert(draft: DraftOf<R, keyof R & string>) {
      const id = draft.id ?? newId();
      const existing = all().find((r) => r.id === id);
      if (existing) {
        const seen = visibleById(id);
        if (seen && draftMatches({ ...draft, id }, parse(seen))) return parse(seen);
        throw new DbError('conflict', { table: name, constraint: `${name}_pkey` });
      }
      return parse(insertRow({ ...toColumns(def, draft), id }));
    },
    /** One statement: every row is checked before any is stored, so a refused batch stores nothing. */
    async insertMany(drafts) {
      const stored = new Map(all().map((r) => [r.id, r]));
      const keys = uniqueIndex();
      const at = now();
      const added: Row[] = [];
      const out = drafts.map((d) => {
        const id = d.id ?? newId();
        const existing = stored.get(id);
        if (existing && rls.allows(meta, 'read', existing)) return existing;
        const row = newRow({ ...toColumns(def, d), id }, (r) => keys.assert(r), at);
        keys.add(row);
        stored.set(id, row);
        added.push(row);
        return row;
      });
      const rows = all();
      for (const row of added) rows.push(row);
      return out.map(parse);
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
        runGuards('delete', target, target);
        deleteRows(store, name, [target]);
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
      for (const r of doomed) runGuards('delete', r, r);
      deleteRows(store, name, doomed);
      return doomed.length;
    },
  };
}

const PROFILE_TABLE = 'sce_tcsk_profiles';
/** tcsk.backup_tables() in 0003: every owned table except core infrastructure and the legacy blob. */
const NOT_BACKED_UP = new Set(['sce_tcsk_profiles', 'sce_tcsk_role_permissions', 'sce_tcsk_backups', 'sce_tcsk_audit_logs', 'sce_tcsk_departments', 'sce_tcsk_app_data']);
const isBackedUp = (table: string) => Boolean(loadCatalog().get(table)?.owner) && !NOT_BACKED_UP.has(table);
const vnDay = (at: unknown) => todayVN(String(at) as Instant);

// The audit rows of 202611041100_core_audit_in_functions.sql, word for word.
const CORE_AUDIT_ACTIONS = new Set([
  'CẬP NHẬT THAM SỐ HỆ THỐNG', 'CẬP NHẬT NGÀY NGHỈ LỄ', 'CẬP NHẬT HỒ SƠ', 'PHÂN QUYỀN TÀI KHOẢN', 'CHUYỂN PHÒNG BAN', 'DUYỆT/MỞ KHÓA TÀI KHOẢN',
  'KHÓA TÀI KHOẢN', 'TẠO TÀI KHOẢN', 'TẠO BẢN SAO LƯU', 'KHÔI PHỤC SAO LƯU', 'TẢI BẢN SAO LƯU', 'KHỞI TẠO QUẢN TRỊ VIÊN',
]);
const CORE_AUDIT_ENTITIES = new Set(['profile', 'backup', 'settings', 'holidays']);
const CORE_AUDIT_ACTIONS_FOLDED = new Set([...CORE_AUDIT_ACTIONS].map((a) => a.toLowerCase()));
/** The one command allowed to audit under another feature's permission: it asks guests to write. */
const CROSS_FEATURE_AUDIT = new Set(['directory.importToEvent guests.write']);
/** tcsk.audit_text (202611041530): NFKC, invisible format characters dropped, Unicode White_Space collapsed, trimmed; null when empty. */
const auditText = (t: string | null) =>
  t === null
    ? null
    : t.normalize('NFKC').replace(/[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, '')
      .replace(/[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, ' ').replace(/^ | $/g, '') || null;
/** 202611041350_core_audit_action_charset.sql: Vietnamese letters, digits, spaces and plain punctuation; entities are ASCII identifiers. */
const AUDIT_ACTION = /^[0-9A-Za-zÀ-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ /().,:;'"&+%#?!-]+$/u;
const AUDIT_ENTITY = /^[A-Za-z0-9_.-]+$/;

/** public.sce_tcsk_audit_command of 202611041320_core_audit_writer.sql, 202611041330 and 202611041350, check for check. */
function writeCommandAudit(store: Store, actor: Actor, row: CommandAuditRow): void {
  // 202611041330_core_audit_writer_nulls.sql: a missing argument is refused before any check reads it.
  if (typeof actor.profile.id !== 'string' || typeof row.command !== 'string' || typeof row.perm !== 'string' || (actor.aal !== 'aal1' && actor.aal !== 'aal2')) {
    throw new DbError('forbidden');
  }
  const [feature = '', verb = ''] = row.command.split('.');
  const action = auditText(row.action);
  const entity = auditText(row.entity);
  const def = permissionMatrix().get(row.perm);
  const forbidden = feature === '' || feature === 'core' || verb === '' || action === null || !AUDIT_ACTION.test(action) || (entity !== null && !AUDIT_ENTITY.test(entity))
    || (row.perm.split('.')[0] !== feature && !CROSS_FEATURE_AUDIT.has(`${row.command} ${row.perm}`))
    || CORE_AUDIT_ENTITIES.has(entity?.toLowerCase() ?? '') || CORE_AUDIT_ACTIONS_FOLDED.has(action.toLowerCase())
    || actor.profile.status !== 'active' || !aalOk(actor) || !def;
  if (forbidden) throw new DbError('forbidden');
  const grant = grantOf(actor, def);
  const dept = actor.profile.department;
  const ev = row.eventId === null ? undefined : rowsOf(store, 'sce_tcsk_events').find((e) => e.id === row.eventId);
  const allowed = row.eventId === null
    ? def.scope === 'global' && grant === 'all'
    : ev !== undefined && def.scope === 'event' && (grant === 'all' || (grant === 'department' && dept !== null
      && (ev.department === dept || (Array.isArray(ev.supporting_departments) && ev.supporting_departments.includes(dept)))));
  if (!allowed) throw new DbError('forbidden');
  store.seq += 1;
  rowsOf(store, 'sce_tcsk_audit_logs').push({
    id: store.seq, actor_id: actor.profile.id, actor_email: actor.profile.email, action: action.slice(0, 120), summary: row.summary.slice(0, 2000),
    event_id: row.eventId, entity, entity_id: row.entityId, created_at: new Date().toISOString(),
  });
}

/** The audit writer over the store behind a memoryDb (tests, the dev memory runtime), or null for any other Db. */
export function memoryAuditWriter(db: Db): AuditWriter | null {
  const store = probedStores.get(db.table(STORE_PROBE));
  return store ? async (actor, row) => writeCommandAudit(store, actor, row) : null;
}
const SETTINGS_AUDIT: ReadonlyArray<readonly [column: string, label: string, unit: string]> = [
  ['parent_agency', 'Đơn vị chủ quản (cấp trên)', ''],
  ['agency_name', 'Đơn vị tổ chức sự kiện', ''],
  ['agency_short_name', 'Tên viết tắt', ''],
  ['daily_report_threshold_days', 'Ngưỡng kích hoạt báo cáo hàng ngày', ''],
  ['field_presence_hours', 'Thời gian cán bộ có mặt hiện trường', ''],
  ['guest_quota_percent', 'Tỷ lệ danh sách khách mời tối thiểu (nhóm 1a)', '%'],
  ['badge_quota_percent', 'Tỷ lệ in thẻ đại biểu tối thiểu (nhóm 2b)', '%'],
  ['google_client_id', 'Google Client ID mặc định', ''],
];
const roleLabel = (role: unknown) => ROLES[role as Role]?.label ?? String(role);
const who = (p: Row) => `${String(p.fullname)} <${String(p.email)}>`;

function holidayDiff(previous: ReadonlyArray<Row>, stored: ReadonlyArray<Row>): string {
  const key = (h: Row) => `${String(h.holiday_date)}|${String(h.name)}|${String(h.kind)}`;
  const line = (h: Row) => `${formatVNDate(String(h.holiday_date) as IsoDate)} ${String(h.name)}${h.kind === 'holiday' ? '' : ' (ngày làm bù)'}`;
  const missingFrom = (rows: ReadonlyArray<Row>, other: ReadonlyArray<Row>) => rows.filter((h) => !other.some((o) => key(o) === key(h))).map(line);
  const [added, dropped] = [missingFrom(stored, previous), missingFrom(previous, stored)];
  return [added.length > 0 && `thêm ${added.join(', ')}`, dropped.length > 0 && `bỏ ${dropped.join(', ')}`].filter(Boolean).join('; ') || 'không thay đổi';
}

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
  /** tcsk.take_snapshot: no check, no audit. */
  const snapshot = (note: string, kind: 'manual' | 'auto') => {
    store.seq += 1;
    const id = store.seq;
    const data = Object.fromEntries([...store.tables].filter(([t]) => isBackedUp(t)).map(([t, rows]) => [t, structuredClone(rows)]));
    rowsOf(store, 'sce_tcsk_backups').push({
      id, data, note: note.trim() || 'Sao lưu', kind, format: 2, created_by: actor.profile.id, created_by_email: actor.profile.email, created_at: new Date().toISOString(),
    });
    return id;
  };
  return {
    sce_tcsk_create_backup: (a) => {
      if (!rls.hasPerm('core.backups.create')) throw new DbError('forbidden');
      const id = snapshot(a.note, a.kind);
      audit('TẠO BẢN SAO LƯU', `Bản #${id}${a.kind === 'auto' ? ' (tự động)' : ''}: ${a.note.trim() || 'Sao lưu'}`, null, 'backup', String(id));
      return { id };
    },
    sce_tcsk_restore_backup: (a) => {
      if (!rls.hasPerm('core.backups.restore')) throw new DbError('forbidden');
      const backup = rowsOf(store, 'sce_tcsk_backups').find((b) => b.id === a.id);
      if (!backup) throw new DbError('not_found');
      if (backup.format !== 2) throw new DbError('constraint', { constraint: 'legacy_format' });
      const data = structuredClone(backup.data) as Record<string, Row[]>;
      const beforeId = snapshot(`Trước khi khôi phục #${a.id}`, 'manual');
      for (const t of new Set([...store.tables.keys(), ...Object.keys(data)])) {
        if (isBackedUp(t)) store.tables.set(t, data[t] ?? []);
      }
      const taken = formatVNTime(String(backup.created_at) as Instant, { withDate: true });
      audit('KHÔI PHỤC SAO LƯU', `Khôi phục từ bản #${a.id} (${taken}): ${String(backup.note ?? '')}. Dữ liệu trước đó lưu ở bản #${beforeId}`, null, 'backup', String(a.id));
    },
    sce_tcsk_set_profile_role: (a) => {
      assertManage();
      const [old, name] = transact(() => {
        const p = profile(a.id);
        const prev = p.role;
        p.role = a.role;
        return [prev, who(p)];
      });
      audit('PHÂN QUYỀN TÀI KHOẢN', `${name}: ${roleLabel(old)} → ${roleLabel(a.role)}`, null, 'profile', a.id);
    },
    sce_tcsk_set_profile_department: (a) => {
      assertManage();
      const p = profile(a.id);
      const old = p.department;
      p.department = a.department;
      audit('CHUYỂN PHÒNG BAN', `${who(p)}: ${old === null || old === undefined ? '(chưa có)' : String(old)} → ${a.department}`, null, 'profile', a.id);
    },
    sce_tcsk_set_profile_status: (a) => {
      assertManage();
      if (a.status === 'locked' && a.ids.includes(actor.profile.id)) throw new DbError('constraint', { constraint: 'cannot_lock_self' });
      const targets = a.ids.flatMap((id) => rowsOf(store, PROFILE_TABLE).filter((p) => p.id === id));
      const accounts = targets.map((p) => `${a.status === 'locked' ? 'Khóa' : p.status === 'pending' ? 'Duyệt' : 'Mở khóa'} ${who(p)}`).join('; ');
      const n = transact(() => {
        const changed = targets.filter((p) => p.status !== a.status);
        for (const p of changed) p.status = a.status;
        return changed.length;
      });
      audit(a.status === 'active' ? 'DUYỆT/MỞ KHÓA TÀI KHOẢN' : 'KHÓA TÀI KHOẢN', accounts || '0 tài khoản', null, 'profile', a.ids.join(','));
      return n;
    },
    sce_tcsk_admit_profile: (a) => {
      assertManage();
      const p = profile(a.id);
      if (p.status !== 'pending') throw new DbError('constraint', { constraint: 'not_pending' });
      Object.assign(p, { role: a.role, department: a.department, status: 'active' });
      audit('TẠO TÀI KHOẢN', `${who(p)}, ${roleLabel(a.role)}, ${a.department}`, null, 'profile', a.id);
    },
    sce_tcsk_ensure_profile: () => undefined,
    sce_tcsk_update_settings: (a) => {
      if (!rls.hasPerm('core.settings.edit')) throw new DbError('forbidden');
      const row = rowsOf(store, 'sce_tcsk_system_settings')[0];
      if (!row || row.version !== a.expectedVersion) return null;
      const before = { ...row };
      const values = Object.fromEntries(Object.entries(settingsPatchColumns(a.patch)).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]));
      Object.assign(row, values, { version: Number(row.version) + 1, updated_at: new Date().toISOString(), updated_by: actor.profile.id });
      const shown = (v: unknown, unit: string) => `${v === null || v === undefined ? '(trống)' : String(v)}${unit}`;
      const changes = SETTINGS_AUDIT.filter(([c]) => before[c] !== row[c]).map(([c, label, unit]) => `${label}: ${shown(before[c], unit)} → ${shown(row[c], unit)}`);
      audit('CẬP NHẬT THAM SỐ HỆ THỐNG', changes.join('; ') || 'không thay đổi', null, 'settings', '1');
      return parseSettingsRow(row);
    },
    sce_tcsk_replace_holidays: (a) => {
      if (!rls.hasPerm('core.holidays.edit')) throw new DbError('forbidden');
      if (!Number.isInteger(a.year) || a.year < 2000 || a.year > 2100) throw new DbError('constraint', { constraint: 'invalid_year' });
      const inYear = (date: unknown) => String(date).startsWith(`${a.year}-`);
      if (a.holidays.some((h) => !inYear(h.date) || !h.name.trim())) throw new DbError('constraint', { constraint: 'holiday_outside_year' });
      if (new Set(a.holidays.map((h) => h.date)).size !== a.holidays.length) throw new DbError('constraint', { constraint: 'sce_tcsk_holidays_pkey' });
      const at = new Date().toISOString();
      const before = rowsOf(store, 'sce_tcsk_holidays').filter((h) => inYear(h.holiday_date));
      const seen = a.expected.map((h) => `${h.date}|${h.name.trim().slice(0, 120)}|${h.kind}`).sort();
      if (JSON.stringify(seen) !== JSON.stringify(before.map((h) => `${String(h.holiday_date)}|${String(h.name)}|${String(h.kind)}`).sort())) return null;
      const kept = rowsOf(store, 'sce_tcsk_holidays').filter((h) => !inYear(h.holiday_date));
      const added = a.holidays.map((h) => ({ holiday_date: h.date, name: h.name.trim().slice(0, 120), kind: h.kind, updated_at: at, updated_by: actor.profile.id }));
      store.tables.set('sce_tcsk_holidays', [...kept, ...added].sort((x, y) => String(x.holiday_date).localeCompare(String(y.holiday_date))));
      audit('CẬP NHẬT NGÀY NGHỈ LỄ', `Năm ${a.year}: ${holidayDiff(before, added)}`, null, 'holidays', String(a.year));
      return parseHolidayRows(before);
    },
    sce_tcsk_update_profile_name: (a) => {
      if (actor.profile.status !== 'active') throw new DbError('forbidden');
      const clean = a.fullname.replace(/\s+/g, ' ').trim();
      if (!clean || clean.length > 120) throw new DbError('constraint', { constraint: 'invalid_fullname' });
      const row = profile(actor.profile.id);
      const old = row.fullname;
      Object.assign(row, { fullname: clean, updated_at: new Date().toISOString() });
      audit('CẬP NHẬT HỒ SƠ', `Tên hiển thị: "${String(old)}" → "${clean}"`, null, 'profile', actor.profile.id);
      return parseProfileRow(row);
    },
    sce_tcsk_list_profiles: () =>
      rowsOf(store, PROFILE_TABLE)
        .filter((p) => rls.seesProfile(p))
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)) || String(x.email).localeCompare(String(y.email)))
        .map(parseProfileRow),
    sce_tcsk_list_backups: (a) => {
      if (!rls.hasPerm('core.backups.create')) return [];
      return [...rowsOf(store, 'sce_tcsk_backups')]
        .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)) || Number(y.id) - Number(x.id))
        .slice(0, Math.min(Math.max(a.limit, 1), 200))
        .map(parseBackupRow);
    },
    sce_tcsk_backup_data: (a) => {
      if (!rls.hasPerm('core.backups.create')) throw new DbError('forbidden');
      const backup = rowsOf(store, 'sce_tcsk_backups').find((b) => b.id === a.id);
      if (!backup) throw new DbError('not_found');
      audit('TẢI BẢN SAO LƯU', `Tải bản sao lưu #${a.id}`, null, 'backup', String(a.id));
      return structuredClone(backup.data);
    },
    sce_tcsk_list_audit: (a) => {
      if (!rls.hasPerm('core.audit.read')) return [];
      const actorQuery = a.actor?.toLowerCase();
      return rowsOf(store, 'sce_tcsk_audit_logs')
        .filter((r) =>
          (a.beforeId === undefined || Number(r.id) < a.beforeId) &&
          (a.action === undefined || r.action === a.action) &&
          (a.entity === undefined || r.entity === a.entity) &&
          (actorQuery === undefined || String(r.actor_email ?? '').toLowerCase().includes(actorQuery)) &&
          (a.eventId === undefined || r.event_id === a.eventId) &&
          (a.from === undefined || vnDay(r.created_at) >= a.from) &&
          (a.to === undefined || vnDay(r.created_at) <= a.to))
        .sort((x, y) => Number(y.id) - Number(x.id))
        .slice(0, Math.min(Math.max(a.limit, 1), 201))
        .map(parseAuditRow);
    },
    sce_tcsk_audit_facets: () => {
      const rows = rls.hasPerm('core.audit.read') ? rowsOf(store, 'sce_tcsk_audit_logs') : [];
      const distinct = (values: unknown[]) => [...new Set(values.filter((v): v is string => typeof v === 'string'))].sort();
      return { actions: distinct(rows.map((r) => r.action)), entities: distinct(rows.map((r) => r.entity)) };
    },
  };
}

export function memoryDb(seed: Seed, actor: Actor): Db {
  const store = storeFor(seed);
  const rls = new Rls(store, actor);
  const handlers = rpcHandlers(store, actor, rls);
  return {
    // A def that names fewer defaulted columns demands more of a draft than the table accepts; the cast only widens.
    table: (def) => memoryTable(store, actor, rls, def as never) as never,
    async rpc<K extends keyof RpcMap>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']> {
      const handler = handlers[name] as ((a: RpcMap[K]['args']) => RpcMap[K]['result']) | undefined;
      if (!handler) throw new Error(`rpc ${String(name)} is not allowlisted`);
      return handler(args);
    },
  };
}
