// Field <-> column mapping and row parsing, shared by both Db implementations
// so memoryDb exercises exactly the mapping production uses.

import type { BaseRow, TableDef, Where } from './index';

const MANAGED = new Set(['version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']);

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (column: string) => column.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export function columnOf<Row extends BaseRow>(def: TableDef<Row>, field: string): string {
  return (def.columns as Record<string, string | undefined> | undefined)?.[field] ?? snake(field);
}

function fieldOf<Row extends BaseRow>(def: TableDef<Row>, column: string): string {
  for (const [field, col] of Object.entries(def.columns ?? {})) if (col === column) return field;
  return camel(column);
}

/** Domain fields -> columns for a write. Managed columns are the DB's, so they never leave here. */
export function toColumns<Row extends BaseRow>(def: TableDef<Row>, fields: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || MANAGED.has(field)) continue;
    out[columnOf(def, field)] = value;
  }
  return out;
}

/** A row as PostgREST returns it -> the parsed domain row. A schema mismatch is a bug, not a user error. */
export function fromColumns<Row extends BaseRow>(def: TableDef<Row>, row: Record<string, unknown>): Row {
  const fields: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) fields[fieldOf(def, column)] = value;
  try {
    return def.row.parse(fields);
  } catch (e) {
    throw new Error(`${def.name}: row does not match its schema: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export type Filter = { column: string; op: 'eq'; value: unknown } | { column: string; op: 'in'; values: ReadonlyArray<unknown> } | { column: string; op: 'is_null' };

export function filtersOf<Row extends BaseRow>(def: TableDef<Row>, where: Where<Row> | undefined): Filter[] {
  return Object.entries(where ?? {}).flatMap(([field, value]): Filter[] => {
    if (value === undefined) return [];
    const column = columnOf(def, field);
    if (value === null) return [{ column, op: 'is_null' }];
    if (Array.isArray(value)) return [{ column, op: 'in', values: value }];
    return [{ column, op: 'eq', value }];
  });
}

/** Deep equality of the fields a draft sets against a stored row, for idempotent re-inserts. */
export function draftMatches(draft: object, row: object): boolean {
  const stored = row as Record<string, unknown>;
  return Object.entries(draft).every(([k, v]) => v === undefined || MANAGED.has(k) || stableJson(v) === stableJson(stored[k]));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
