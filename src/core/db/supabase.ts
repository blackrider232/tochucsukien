// Production Db over a user-scoped supabase-js client. Postgres enforces RLS;
// this file only maps rows, guards versions and translates errors. The client
// type is structural so tests can drive it with a fake PostgREST builder.

import { newId } from '@/core/brand';
import type { Actor } from '@/core/auth';
import { DbError } from './errors';
import { draftMatches, filtersOf, fromColumns, toColumns, columnOf, type Filter } from './mapping';
import { RPC_ALLOWLIST } from './rpc';
import type { AnyTable, AnyTableDef, AuditWriter, BaseRow, Db, DraftOf, RpcMap, Where, WriteGuard } from './index';

export interface PgError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}
export interface PgResponse {
  data: unknown;
  error: PgError | null;
  status?: number;
}
/** The subset of supabase-js' query and filter builders this file calls. */
export interface PgBuilder extends PromiseLike<PgResponse> {
  select(columns?: string): PgBuilder;
  insert(values: object | ReadonlyArray<object>): PgBuilder;
  upsert(values: object | ReadonlyArray<object>, options?: { onConflict?: string; ignoreDuplicates?: boolean }): PgBuilder;
  update(values: object): PgBuilder;
  delete(): PgBuilder;
  eq(column: string, value: unknown): PgBuilder;
  in(column: string, values: ReadonlyArray<unknown>): PgBuilder;
  is(column: string, value: null): PgBuilder;
  order(column: string, options: { ascending: boolean }): PgBuilder;
  range(from: number, to: number): PgBuilder;
  maybeSingle(): PromiseLike<PgResponse>;
}
export interface PgClient {
  from(table: string): PgBuilder;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<PgResponse>;
}

const PAGE = 1000;
const CHUNK = 500;

const CONSTRAINT_CODES = new Set(['23505', '23514', '23503', '23502', '23P01', '22P02', '22023', '22001', '22003', '22007', '22008']);
const AUTH_CODES = new Set(['42501', 'PGRST301', 'PGRST302', 'PGRST303']);

/** PostgREST / Postgres error -> the five kinds callers handle. */
export function translatePgError(error: PgError, status: number | undefined, table?: string): DbError {
  const code = error.code ?? '';
  if (CONSTRAINT_CODES.has(code)) {
    const named = /constraint "([^"]+)"/.exec(`${error.message} ${error.details ?? ''}`)?.[1];
    return new DbError('constraint', { table, constraint: named ?? error.message });
  }
  if (AUTH_CODES.has(code) || status === 401 || status === 403) return new DbError('forbidden', { table });
  if (code === 'PGRST116' || code === 'P0002') return new DbError('not_found', { table });
  return new DbError('unavailable', { table });
}

async function run(q: PromiseLike<PgResponse>, table?: string): Promise<unknown> {
  let res: PgResponse;
  try {
    res = await q;
  } catch {
    throw new DbError('unavailable', { table });
  }
  if (res.error) throw translatePgError(res.error, res.status, table);
  return res.data;
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return data ? [data as Record<string, unknown>] : [];
}

function applyFilters(q: PgBuilder, filters: ReadonlyArray<Filter>): PgBuilder {
  return filters.reduce((acc, f) => (f.op === 'eq' ? acc.eq(f.column, f.value) : f.op === 'in' ? acc.in(f.column, f.values) : acc.is(f.column, null)), q);
}

function table<Row extends BaseRow>(client: PgClient, def: AnyTableDef<Row>): AnyTable<Row> {
  const name = def.name;
  const parse = (r: Record<string, unknown>) => fromColumns(def, r);

  async function get(id: Row['id']): Promise<Row | null> {
    const data = await run(client.from(name).select('*').eq('id', id).maybeSingle(), name);
    return data ? parse(data as Record<string, unknown>) : null;
  }

  async function list(where?: Where<Row>, opts?: { limit?: number }): Promise<Row[]> {
    const out: Row[] = [];
    const order = [...(def.orderBy ?? []).map((o) => ({ column: columnOf(def, o.column), ascending: o.ascending })), { column: 'id', ascending: true }];
    // PostgREST caps a response at max-rows (1000 by default) without saying so; page until a short page.
    for (let from = 0; ; from += PAGE) {
      const want = opts?.limit === undefined ? PAGE : Math.min(PAGE, opts.limit - out.length);
      if (want <= 0) break;
      let q = applyFilters(client.from(name).select('*'), filtersOf(def, where));
      for (const o of order) q = q.order(o.column, { ascending: o.ascending });
      const rows = rowsOf(await run(q.range(from, from + want - 1), name));
      out.push(...rows.map(parse));
      if (rows.length < want) break;
    }
    return out;
  }

  /** After a guarded write touched no row: tell conflict, missing and RLS-denied apart. */
  async function explainMiss(id: Row['id'], guard: WriteGuard | undefined): Promise<never> {
    const existing = await get(id);
    if (!existing) throw new DbError('not_found', { table: name });
    if (guard && 'expectedVersion' in guard && existing.version !== guard.expectedVersion) throw new DbError('conflict', { table: name });
    throw new DbError('forbidden', { table: name });
  }

  async function insert(draft: DraftOf<Row, keyof Row & string>): Promise<Row> {
    const id = draft.id ?? newId();
    try {
      const rows = rowsOf(await run(client.from(name).insert({ ...toColumns(def, draft), id }).select('*'), name));
      return parse(rows[0]!);
    } catch (e) {
      if (e instanceof DbError && e.kind === 'constraint' && e.detail?.constraint === `${name}_pkey`) {
        const existing = await get(id);
        if (existing && draftMatches({ ...draft, id }, existing)) return existing;
        throw new DbError('conflict', { table: name, constraint: e.detail.constraint });
      }
      throw e;
    }
  }

  async function insertMany(drafts: ReadonlyArray<DraftOf<Row, keyof Row & string>>): Promise<Row[]> {
    const withIds = drafts.map((d) => ({ ...toColumns(def, d), id: d.id ?? newId() }));
    const byId = new Map<unknown, Row>();
    for (let i = 0; i < withIds.length; i += CHUNK) {
      const chunk = withIds.slice(i, i + CHUNK);
      const inserted = rowsOf(await run(client.from(name).upsert(chunk, { onConflict: 'id', ignoreDuplicates: true }).select('*'), name));
      for (const r of inserted) byId.set(r.id, parse(r));
      const missing = chunk.map((r) => r.id).filter((id) => !byId.has(id));
      if (missing.length > 0) {
        for (const r of rowsOf(await run(client.from(name).select('*').in('id', missing), name))) byId.set(r.id, parse(r));
      }
    }
    return withIds.map((r) => byId.get(r.id)).filter((r): r is Row => r !== undefined);
  }

  async function upsertOn(key: ReadonlyArray<keyof Row & string>, draft: DraftOf<Row, keyof Row & string>): Promise<Row> {
    const values = toColumns(def, draft);
    // On a conflict of another key, writing id would re-key the existing row and break its references.
    if (!key.includes('id' as keyof Row & string)) delete values.id;
    const onConflict = key.map((k) => columnOf(def, k)).join(',');
    const rows = rowsOf(await run(client.from(name).upsert(values, { onConflict }).select('*'), name));
    return parse(rows[0]!);
  }

  async function update(id: Row['id'], patch: Partial<DraftOf<Row>>, guard: WriteGuard): Promise<Row> {
    const values = toColumns(def, patch);
    delete values.id;
    if (Object.keys(values).length === 0) {
      const existing = await get(id);
      if (!existing) throw new DbError('not_found', { table: name });
      if ('expectedVersion' in guard && existing.version !== guard.expectedVersion) throw new DbError('conflict', { table: name });
      return existing;
    }
    let q = client.from(name).update(values).eq('id', id);
    if ('expectedVersion' in guard) q = q.eq('version', guard.expectedVersion);
    const rows = rowsOf(await run(q.select('*'), name));
    if (rows[0]) return parse(rows[0]);
    return explainMiss(id, guard);
  }

  async function remove(id: Row['id'], guard?: WriteGuard): Promise<void> {
    let q = client.from(name).delete().eq('id', id);
    if (guard && 'expectedVersion' in guard) q = q.eq('version', guard.expectedVersion);
    const rows = rowsOf(await run(q.select('id'), name));
    if (rows.length > 0) return;
    const existing = await get(id);
    if (!existing && !(guard && 'expectedVersion' in guard)) return;
    await explainMiss(id, guard);
  }

  async function removeWhere(where: Where<Row>): Promise<number> {
    const filters = filtersOf(def, where);
    if (filters.length === 0) throw new Error(`${name}: removeWhere needs at least one condition`);
    return rowsOf(await run(applyFilters(client.from(name).delete(), filters).select('id'), name)).length;
  }

  return { list, get, insert, insertMany, upsertOn, update, remove, removeWhere };
}

/**
 * The audit writer over `service()`, the server's service-role client (core/auth builds it). The actor and
 * its assurance level come from the request context; the SQL function re-checks both.
 */
export function supabaseAuditWriter(service: () => unknown): AuditWriter {
  return async (actor, row) => {
    await run((service() as PgClient).rpc('sce_tcsk_audit_command', {
      actor_id: actor.profile.id, actor_aal: actor.aal, command: row.command, perm: row.perm, action: row.action,
      summary: row.summary, event_id: row.eventId, entity: row.entity, entity_id: row.entityId,
    }), 'sce_tcsk_audit_logs');
  };
}

/** The actor is unused here: Postgres reads identity from the client's JWT. memoryDb needs it to emulate RLS. */
export function supabaseDb(client: unknown, actor: Actor): Db {
  const pg = client as PgClient;
  return {
    table: (def) => table(pg, def as never) as never,
    async rpc<K extends keyof RpcMap>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']> {
      const spec = RPC_ALLOWLIST[name] as { args(a: unknown): Record<string, unknown>; result(d: unknown): RpcMap[K]['result'] } | undefined;
      if (!spec) throw new Error(`rpc ${String(name)} is not allowlisted`);
      return spec.result(await run(pg.rpc(name, spec.args(args))));
    },
  };
}
