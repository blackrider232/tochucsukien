// Repository port. One generic, deep interface over every table: it hides
// supabase-js, snake/camel mapping, row parsing, optimistic concurrency,
// updated_by stamping and error translation. Features describe a table once
// with defineTable() and never import @supabase/* (eslint boundary rule).
//
// Two implementations behind the same interface:
//   supabaseDb  production, user-scoped client, RLS enforced by Postgres
//   memoryDb    tests and the dev memory runtime (SCE_DEV_MEMORY=1), emulates RLS with permissionMatrix()
// There is no third way to touch data.

import type { EventId, Instant, IsoDate, UserId, Uuid, Version } from '@/core/brand';
import type { Profile } from '@/core/auth';
import type { Holiday } from '@/core/dates';
import type { FeatureKey } from '@/core/registry';
import type { SettingsPatch, SystemSettings } from '@/core/settings';
import { DbError, type DbErrorKind } from './errors';

export { DbError, type DbErrorKind };
export { supabaseDb } from './supabase';
export { memoryDb } from './memory';

/** Satisfied structurally by a zod schema. Rows are parsed at this boundary only. */
export interface Schema<T> {
  parse(input: unknown): T;
}

export interface BaseRow {
  id: Uuid<string> | string;
  version: Version;
  createdAt: Instant;
  createdBy: UserId | null;
  updatedAt: Instant;
  updatedBy: UserId | null;
}
export interface EventScopedRow extends BaseRow {
  eventId: EventId;
}

/** Columns the DB owns. A draft never carries them. */
type Managed = 'version' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy';
export type DraftOf<Row extends BaseRow> = Omit<Row, Managed | 'id'> & { id?: Row['id'] };

export interface TableDef<Row extends BaseRow> {
  /** Postgres table, e.g. 'sce_tcsk_guests'. Must carry `comment on table ... 'sce:owner=<feature>'`. */
  readonly name: `sce_tcsk_${string}`;
  readonly owner: FeatureKey;
  readonly eventScoped: Row extends EventScopedRow ? true : false;
  readonly row: Schema<Row>;
  /** Default order for list(). */
  readonly orderBy?: ReadonlyArray<{ column: keyof Row & string; ascending: boolean }>;
  /** Column names that are not the snake_case of the field ('group' -> 'guest_group', 'budget' -> 'budget_vnd'). */
  readonly columns?: { readonly [K in keyof Row & string]?: string };
}
export function defineTable<Row extends BaseRow>(def: TableDef<Row>): TableDef<Row> {
  return def;
}

export type Where<Row> = { readonly [K in keyof Row]?: Row[K] | ReadonlyArray<Row[K]> };

/** How an update may overwrite. Forms pass the version they loaded. */
export type WriteGuard = { expectedVersion: Version } | { overwrite: 'idempotent-set' };

export interface Table<Row extends BaseRow> {
  list(where?: Where<Row>, opts?: { limit?: number }): Promise<Row[]>;
  get(id: Row['id']): Promise<Row | null>;
  /** Insert with a client-generated id; repeating it with the same id and payload is a no-op. */
  insert(draft: DraftOf<Row>): Promise<Row>;
  insertMany(drafts: ReadonlyArray<DraftOf<Row>>): Promise<Row[]>;
  /** Single-statement upsert on a declared unique key (e.g. ['eventId','guestId']). */
  upsertOn(key: ReadonlyArray<keyof Row & string>, draft: DraftOf<Row>): Promise<Row>;
  update(id: Row['id'], patch: Partial<DraftOf<Row>>, guard: WriteGuard): Promise<Row>;
  remove(id: Row['id'], guard?: WriteGuard): Promise<void>;
  removeWhere(where: Where<Row>): Promise<number>;
}

export interface Db {
  table<Row extends BaseRow>(def: TableDef<Row>): Table<Row>;
  /** Only SQL functions listed in RPC_ALLOWLIST (core-owned). */
  rpc<K extends keyof RpcMap>(name: K, args: RpcMap[K]['args']): Promise<RpcMap[K]['result']>;
}

/** SQL functions callable from the app. Core-owned list; features ask core to add one. */
export interface RpcMap {
  sce_tcsk_write_audit: {
    args: { action: string; summary: string; eventId: EventId | null; entity: string | null; entityId: string | null };
    result: void;
  };
  sce_tcsk_create_backup: { args: { note: string; kind: 'manual' | 'auto' }; result: { id: number } };
  sce_tcsk_restore_backup: { args: { id: number }; result: void };
  /** Profile changes are DB functions that re-check core.users.manage and refuse to remove the last admin. */
  sce_tcsk_set_profile_role: { args: { id: UserId; role: string }; result: void };
  sce_tcsk_set_profile_department: { args: { id: UserId; department: string }; result: void };
  sce_tcsk_set_profile_status: { args: { ids: ReadonlyArray<UserId>; status: 'active' | 'locked' }; result: number };
  /** Creates the caller's missing profile (users from the shared project's other apps). */
  sce_tcsk_ensure_profile: { args: Record<string, never>; result: void };
  // The rest are core's (202611041000_core_admin_functions.sql): the tables behind them have no managed columns.
  /** null when the row's version is no longer expectedVersion. */
  sce_tcsk_update_settings: { args: { expectedVersion: Version; patch: SettingsPatch }; result: SystemSettings | null };
  /** Replaces every row of that calendar year; returns the count written. */
  sce_tcsk_replace_holidays: { args: { year: number; holidays: ReadonlyArray<Holiday> }; result: number };
  sce_tcsk_update_profile_name: { args: { fullname: string }; result: Profile };
  /** As the caller's RLS shows them: everyone for admin and leader, the own department for dept_leader, else only self. */
  sce_tcsk_list_profiles: { args: Record<string, never>; result: Profile[] };
  sce_tcsk_list_backups: { args: { limit: number }; result: BackupRow[] };
  /** The snapshot JSON of one backup; the SQL function audits the download. */
  sce_tcsk_backup_data: { args: { id: number }; result: unknown };
  /** Newest first, keyed on id: pass the last id of a page as beforeId for the next one. Dates are VN days. */
  sce_tcsk_list_audit: { args: AuditQuery; result: AuditLogRow[] };
}

export interface BackupRow {
  id: number;
  note: string;
  kind: 'manual' | 'auto' | 'pre_migration';
  format: 1 | 2;
  createdByEmail: string | null;
  createdAt: Instant;
}
export interface AuditQuery {
  beforeId?: number;
  limit: number;
  action?: string;
  entity?: string;
  actor?: string;
  eventId?: EventId;
  from?: IsoDate;
  to?: IsoDate;
}
export interface AuditLogRow {
  id: number;
  at: Instant;
  actorEmail: string | null;
  action: string;
  summary: string;
  eventId: EventId | null;
  entity: string | null;
  entityId: string | null;
}
