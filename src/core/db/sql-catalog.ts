// Reads what the TypeScript side needs to know about the schema straight from
// the migration files: each table's owner comment, its register_table policy
// (scope, read and write permission, immutable), column defaults, NOT NULL,
// unique keys and foreign keys between app tables. memoryDb emulates RLS and defaults from it; check:contract
// compares owners with the manifests. Parsing the SQL keeps one source of truth.

export type ColumnDefault =
  | { kind: 'value'; value: unknown }
  | { kind: 'now' }
  | { kind: 'uuid' }
  | { kind: 'random_code'; length: number };

export interface CatalogColumn {
  name: string;
  isArray: boolean;
  notNull: boolean;
  default: ColumnDefault | null;
}

/** A foreign key to another app table; keys into auth.* are left out. */
export interface CatalogForeignKey {
  name: string;
  columns: ReadonlyArray<string>;
  table: string;
  refColumns: ReadonlyArray<string>;
  onDelete: 'cascade' | 'set null' | 'restrict' | 'no action';
}

export interface CatalogTable {
  name: string;
  owner: string | null;
  policy: { scope: 'event' | 'global'; read: string; write: string; immutable: boolean } | null;
  columns: ReadonlyArray<CatalogColumn>;
  /** Primary key first, then unique constraints, each with Postgres' default constraint name. */
  uniques: ReadonlyArray<{ name: string; columns: ReadonlyArray<string> }>;
  foreignKeys: ReadonlyArray<CatalogForeignKey>;
}

export interface SqlFile {
  name: string;
  sql: string;
}

const TABLE_REF = String.raw`(?:public\.)?(sce_tcsk_\w+)`;

export function parseCatalog(files: ReadonlyArray<SqlFile>): ReadonlyMap<string, CatalogTable> {
  const tables = new Map<string, CatalogTable>();
  const upsert = (name: string, patch: Partial<CatalogTable>) => {
    const prev = tables.get(name) ?? { name, owner: null, policy: null, columns: [], uniques: [], foreignKeys: [] };
    tables.set(name, { ...prev, ...patch });
  };

  for (const file of files) {
    const sql = stripComments(file.sql);
    for (const m of sql.matchAll(new RegExp(String.raw`create table if not exists ${TABLE_REF}\s*\(`, 'gi'))) {
      const name = m[1]!;
      const body = balancedBody(sql, m.index + m[0].length);
      upsert(name, parseTableBody(name, body));
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter table ${TABLE_REF} add column if not exists (\w+) ([^;]+);`, 'gi'))) {
      const table = tables.get(m[1]!);
      if (table && !table.columns.some((c) => c.name === m[2])) {
        upsert(table.name, { columns: [...table.columns, parseColumn(m[2]!, m[3]!)] });
      }
    }
    for (const m of sql.matchAll(new RegExp(String.raw`alter table ${TABLE_REF} add constraint (\w+)\s+foreign key\s*\(([^)]+)\)\s*(references[^;]+);`, 'gi'))) {
      const table = tables.get(m[1]!);
      const fk = foreignKey(m[1]!, m[2]!, m[3]!, m[4]!);
      if (table && fk && !table.foreignKeys.some((k) => k.name === fk.name)) upsert(table.name, { foreignKeys: [...table.foreignKeys, fk] });
    }
    for (const m of sql.matchAll(new RegExp(String.raw`comment on table ${TABLE_REF} is '([^']*)'`, 'gi'))) {
      const owner = /^sce:owner=([a-z]+)/.exec(m[2]!)?.[1] ?? null;
      upsert(m[1]!, { owner });
    }
    for (const m of sql.matchAll(/register_table\(\s*'(?:public\.)?(sce_tcsk_\w+)'\s*,\s*'(\w+)'\s*,\s*'(event|global)'\s*,\s*'([\w.]+)'\s*,\s*'([\w.]+)'([^)]*)\)/gi)) {
      upsert(m[1]!, {
        owner: m[2]!,
        policy: { scope: m[3] as 'event' | 'global', read: m[4]!, write: m[5]!, immutable: /immutable\s*=>\s*true/i.test(m[6] ?? '') },
      });
    }
  }
  return tables;
}

/** Tables a migration creates or changes, for the "module migration touches another owner's table" rule. */
export function tablesTouched(sql: string): ReadonlySet<string> {
  const out = new Set<string>();
  const body = stripComments(sql);
  const patterns = [
    String.raw`create table(?: if not exists)? ${TABLE_REF}`,
    String.raw`alter table(?: if exists)?(?: only)? ${TABLE_REF}`,
    String.raw`drop table(?: if exists)? ${TABLE_REF}`,
    String.raw`comment on (?:table|column) ${TABLE_REF}`,
    String.raw`create (?:unique )?index(?: if not exists)? \w+ on ${TABLE_REF}`,
    String.raw`create (?:or replace )?trigger \w+ .*? on ${TABLE_REF}`,
    String.raw`drop trigger(?: if exists)? \w+ on ${TABLE_REF}`,
    String.raw`(?:create|drop) policy(?: if exists)? \w+ on ${TABLE_REF}`,
    String.raw`insert into ${TABLE_REF}`,
    String.raw`update ${TABLE_REF}\s+set`,
    String.raw`delete from ${TABLE_REF}`,
    String.raw`truncate(?: table)? ${TABLE_REF}`,
    String.raw`register_table\(\s*'${TABLE_REF}'`,
  ];
  for (const p of patterns) {
    for (const m of body.matchAll(new RegExp(p, 'gi'))) out.add(m[1]!);
  }
  return out;
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function balancedBody(sql: string, start: number): string {
  let depth = 1;
  let quoted = false;
  for (let i = start; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") quoted = !quoted;
    if (quoted) continue;
    if (c === '(') depth += 1;
    if (c === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(start, i);
    }
  }
  return sql.slice(start);
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const c of body) {
    if (c === "'") quoted = !quoted;
    if (!quoted && c === '(') depth += 1;
    if (!quoted && c === ')') depth -= 1;
    if (!quoted && depth === 0 && c === ',') {
      parts.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const listOf = (cols: string) => cols.split(',').map((c) => c.trim());

/** `references public.x(cols) on delete …` of the key on `columns`; null for a key into another schema. */
function foreignKey(table: string, name: string | null, columns: string, clause: string): CatalogForeignKey | null {
  const ref = /^references\s+(\w+\.)?(\w+)\s*(?:\(([^)]*)\))?/i.exec(clause.trim());
  if (!ref || (ref[1] && ref[1].toLowerCase() !== 'public.') || !ref[2]!.startsWith('sce_tcsk_')) return null;
  const cols = listOf(columns);
  const action = /\bon delete (cascade|set null|restrict|no action)\b/i.exec(clause)?.[1]?.toLowerCase() as CatalogForeignKey['onDelete'] | undefined;
  return { name: name ?? `${table}_${cols.join('_')}_fkey`, columns: cols, table: ref[2]!, refColumns: ref[3] ? listOf(ref[3]) : ['id'], onDelete: action ?? 'no action' };
}

function parseTableBody(table: string, body: string): Pick<CatalogTable, 'columns' | 'uniques' | 'foreignKeys'> {
  const columns: CatalogColumn[] = [];
  const uniques: Array<{ name: string; columns: string[] }> = [];
  const foreignKeys: CatalogForeignKey[] = [];
  for (const part of splitTopLevel(body)) {
    const unique = /^(primary key|unique)\s*\(([^)]+)\)/i.exec(part);
    if (unique) {
      const cols = listOf(unique[2]!);
      uniques.push(unique[1]!.toLowerCase() === 'primary key' ? { name: `${table}_pkey`, columns: cols } : { name: `${table}_${cols.join('_')}_key`, columns: cols });
      continue;
    }
    const tableKey = /^(?:constraint (\w+)\s+)?foreign key\s*\(([^)]+)\)\s*(references.*)$/is.exec(part);
    if (tableKey) {
      const fk = foreignKey(table, tableKey[1] ?? null, tableKey[2]!, tableKey[3]!);
      if (fk) foreignKeys.push(fk);
      continue;
    }
    if (/^(check|constraint|exclude)\b/i.test(part)) continue;
    const col = /^(\w+)\s+(.*)$/s.exec(part);
    if (!col) continue;
    const parsed = parseColumn(col[1]!, col[2]!);
    columns.push(parsed);
    const inline = /\b(references\b.*)$/is.exec(col[2]!);
    const fk = inline ? foreignKey(table, null, col[1]!, inline[1]!) : null;
    if (fk) foreignKeys.push(fk);
    if (/\bprimary key\b/i.test(col[2]!)) uniques.unshift({ name: `${table}_pkey`, columns: [parsed.name] });
    else if (/\bunique\b/i.test(col[2]!)) uniques.push({ name: `${table}_${parsed.name}_key`, columns: [parsed.name] });
  }
  return { columns, uniques, foreignKeys };
}

function parseColumn(name: string, rest: string): CatalogColumn {
  const isArray = /^\w+(?:\s+\w+)?\[\]/.test(rest.trim());
  const notNull = /\bnot null\b/i.test(rest) || /\bprimary key\b/i.test(rest);
  const generated = /\bgenerated\b.*\bidentity\b/i.test(rest);
  const def = /\bdefault\s+((?:'(?:[^']|'')*'|[\w.]+(?:\([^)]*\))?)(?:::[\w\s[\]]+?)?)(?=\s+(?:not|null|check|references|unique|primary|constraint)\b|\s*$)/i.exec(rest);
  return { name, isArray, notNull: notNull && !generated, default: generated ? { kind: 'value', value: undefined } : def ? parseDefault(def[1]!, isArray) : null };
}

function parseDefault(raw: string, isArray: boolean): ColumnDefault | null {
  const expr = raw.replace(/::[\w\s[\]]+$/, '').trim();
  if (/^now\(\)$/i.test(expr)) return { kind: 'now' };
  if (/^gen_random_uuid\(\)$/i.test(expr)) return { kind: 'uuid' };
  const code = /^tcsk\.random_code\((\d+)\)$/i.exec(expr);
  if (code) return { kind: 'random_code', length: Number(code[1]) };
  if (/^'.*'$/s.test(expr)) {
    const text = expr.slice(1, -1).replace(/''/g, "'");
    if (isArray) return { kind: 'value', value: text === '{}' ? [] : text.replace(/^\{|\}$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')) };
    if (/^[[{]/.test(text)) {
      try {
        return { kind: 'value', value: JSON.parse(text) };
      } catch {
        return { kind: 'value', value: text };
      }
    }
    return { kind: 'value', value: text };
  }
  if (/^(true|false)$/i.test(expr)) return { kind: 'value', value: expr.toLowerCase() === 'true' };
  if (/^null$/i.test(expr)) return { kind: 'value', value: null };
  if (/^-?\d+(\.\d+)?$/.test(expr)) return { kind: 'value', value: Number(expr) };
  return null;
}
