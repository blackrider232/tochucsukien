// One-time import of the legacy blob (sce_tcsk_app_data id = 1, or an exported
// SCE_Event_Backup_*.json) into the normalized tables. Each feature implements
// a pure LegacyImporter for the blob keys its manifest lists; the foundation
// script scripts/import-legacy.ts runs them in dependency order and writes
// with the service role. Re-running converges: every new id is a uuid v5 of the
// legacy coordinates, and every write is an upsert on id.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { EventId, IsoDate, Uuid } from '@/core/brand';
import type { FeatureKey } from '@/core/registry';
import { buildWorkCalendar, parseIsoDate, type Holiday, type WorkCalendar } from '@/core/dates';
import { serviceRoleImportStore, type ImportStore } from '@/core/db/import-store';

/** Untyped on purpose. Importers parse their keys leniently with zod and report what they drop. */
export type LegacyBlob = Readonly<Record<string, unknown>>;

export interface DeterministicIds {
  /** uuid v5(NAMESPACE, `${entity}|${scope ?? ''}|${legacyId}`). Same input, same id, every run. */
  idFor<E extends string>(entity: E, legacyId: string, scope?: string): Uuid<E>;
  /** Event id for a legacy 'evt_…' id; also resolves 'programs' entries. */
  eventId(legacyEventId: string): EventId;
}

export interface ImportContext {
  ids: DeterministicIds;
  calendar: WorkCalendar;
  /** --include-demo. Off by default: rows recognised as seed/demo data are skipped and listed. */
  includeDemo: boolean;
}

export interface ImportTableBatch {
  table: `sce_tcsk_${string}`;
  /** snake_case column maps, ready for upsert on 'id'. Every row carries legacy_id. */
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

export interface ImportIssue {
  severity: 'skipped_demo' | 'dropped_invalid' | 'coerced' | 'orphan';
  blobKey: string;
  legacyId: string | null;
  message: string;
}

export interface ImportPlan {
  batches: ReadonlyArray<ImportTableBatch>;
  issues: ReadonlyArray<ImportIssue>;
}

export interface LegacyImporter {
  feature: FeatureKey;
  /** Features whose rows must exist first (FKs). The runner sorts topologically. */
  dependsOn: ReadonlyArray<FeatureKey>;
  /** Pure: blob in, rows out. Unit-tested on fixture blobs. */
  plan(blob: LegacyBlob, ctx: ImportContext): ImportPlan;
}

export interface ImportRunOptions {
  source: { kind: 'database' } | { kind: 'file'; path: string };
  dryRun: boolean;
  includeDemo: boolean;
  /**
   * Emails allowed to keep role 'admin'. Every other admin row is demoted to
   * 'user'/'pending' because legacy admins may come from the email backdoor (core B1/B2).
   */
  keepAdmins: ReadonlyArray<string>;
}
export interface ImportReport {
  counts: ReadonlyArray<{ table: string; planned: number; written: number }>;
  issues: ReadonlyArray<ImportIssue>;
  demotedAdmins: ReadonlyArray<string>;
  preImportBackupId: number | null;
}
export function runLegacyImport(opts: ImportRunOptions, importers: ReadonlyArray<LegacyImporter>): Promise<ImportReport> {
  return runLegacyImportWith(opts, importers, defaultIo(opts));
}

/** Fixed namespace of every imported id. Changing it re-keys every imported row, so it never changes. */
export const LEGACY_NAMESPACE = '6b1f8d2e-3c4a-5e6f-8a9b-0c1d2e3f4a5b';

/** RFC 4122 version 5 (SHA-1, name-based) uuid. */
export function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const deterministicIds: DeterministicIds = {
  idFor: <E extends string>(entity: E, legacyId: string, scope?: string) => uuidV5(LEGACY_NAMESPACE, `${entity}|${scope ?? ''}|${legacyId}`) as Uuid<E>,
  eventId: (legacyEventId) => uuidV5(LEGACY_NAMESPACE, `Event||${legacyEventId}`) as EventId,
};

// Seed data the legacy app wrote into real events (design "Demo detection").
const DEMO_ID = /^(?:gst_(?:vip|sn|dn|qt|bc)_0\d|bth_\d{2}|duty_0\d|sc_0\d|media_0\d|bid_0\d|rpt_.+|GF-SIM-01)$/;
export const DEMO_EVENT_NAMES: ReadonlySet<string> = new Set([
  'Hội nghị Xúc tiến Đầu tư và Giao thương Hà Nội - Tokyo 2026',
  'Hội chợ Đặc sản Vùng miền và Sản phẩm OCOP Hà Nội 2026',
]);
export function isDemoLegacyId(legacyId: unknown): boolean {
  return typeof legacyId === 'string' && DEMO_ID.test(legacyId);
}
export function isDemoLegacyEvent(event: { name?: unknown } | null | undefined): boolean {
  return typeof event?.name === 'string' && DEMO_EVENT_NAMES.has(event.name);
}

/** The exported file is appData itself; a sce_tcsk_app_data row ({ id, data }) is unwrapped. */
export function normalizeBlob(raw: unknown): LegacyBlob {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('legacy blob must be a JSON object');
  const obj = raw as Record<string, unknown>;
  const looksLikeRow = obj.data && typeof obj.data === 'object' && !('events' in obj) && !('programs' in obj);
  return (looksLikeRow ? obj.data : obj) as LegacyBlob;
}

/** Topological order by dependsOn; a dependency without an importer is satisfied by definition. */
export function orderImporters(importers: ReadonlyArray<LegacyImporter>): LegacyImporter[] {
  const byFeature = new Map(importers.map((i) => [i.feature, i]));
  const done = new Set<FeatureKey>();
  const visiting = new Set<FeatureKey>();
  const out: LegacyImporter[] = [];
  const visit = (imp: LegacyImporter, path: FeatureKey[]) => {
    if (done.has(imp.feature)) return;
    if (visiting.has(imp.feature)) throw new Error(`legacy importers depend on each other in a cycle: ${[...path, imp.feature].join(' -> ')}`);
    visiting.add(imp.feature);
    for (const dep of imp.dependsOn) {
      const next = byFeature.get(dep);
      if (next) visit(next, [...path, imp.feature]);
    }
    visiting.delete(imp.feature);
    done.add(imp.feature);
    out.push(imp);
  };
  for (const imp of importers) visit(imp, []);
  return out;
}

/** Pure: every importer's plan, batches in dependency order. */
export function planLegacyImport(blob: LegacyBlob, importers: ReadonlyArray<LegacyImporter>, ctx: ImportContext): ImportPlan {
  const batches: ImportTableBatch[] = [];
  const issues: ImportIssue[] = [];
  for (const imp of orderImporters(importers)) {
    const plan = imp.plan(blob, ctx);
    batches.push(...plan.batches);
    issues.push(...plan.issues);
  }
  return { batches, issues };
}

export interface ImportIo {
  loadBlob(source: ImportRunOptions['source']): Promise<unknown>;
  holidays(): Promise<ReadonlyArray<Holiday>>;
  store(): ImportStore;
}

export async function runLegacyImportWith(opts: ImportRunOptions, importers: ReadonlyArray<LegacyImporter>, io: ImportIo): Promise<ImportReport> {
  const blob = normalizeBlob(await io.loadBlob(opts.source));
  const store = opts.dryRun ? null : io.store();
  const preImportBackupId = store ? await store.insertPreMigrationBackup(blob) : null;
  const calendar = buildWorkCalendar(await io.holidays());
  const plan = planLegacyImport(blob, importers, { ids: deterministicIds, calendar, includeDemo: opts.includeDemo });

  const counts = new Map<string, { table: string; planned: number; written: number }>();
  for (const batch of plan.batches) {
    const entry = counts.get(batch.table) ?? { table: batch.table, planned: 0, written: 0 };
    entry.planned += batch.rows.length;
    if (store) entry.written += await store.upsert(batch.table, batch.rows);
    counts.set(batch.table, entry);
  }
  const demotedAdmins = store ? await store.demoteAdmins(opts.keepAdmins) : [];
  if (store) await store.markMigrated();
  return { counts: [...counts.values()], issues: plan.issues, demotedAdmins, preImportBackupId };
}

function defaultIo(opts: ImportRunOptions): ImportIo {
  let store: ImportStore | null = null;
  const getStore = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to read or write the database');
    store ??= serviceRoleImportStore(url, key);
    return store;
  };
  const needsDb = opts.source.kind === 'database' || !opts.dryRun;
  return {
    loadBlob: async (source) => (source.kind === 'file' ? JSON.parse(await readFile(source.path, 'utf8')) : getStore().readBlob()),
    holidays: async () => {
      if (!needsDb) return [];
      const rows = await getStore().readHolidays();
      return rows.flatMap((r) => {
        const date = parseIsoDate(r.holiday_date);
        return date && (r.kind === 'holiday' || r.kind === 'compensatory_workday') ? [{ date: date as IsoDate, name: r.name, kind: r.kind }] : [];
      });
    },
    store: getStore,
  };
}
