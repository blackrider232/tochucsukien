// One-time import of the legacy blob (sce_tcsk_app_data id = 1, or an exported
// SCE_Event_Backup_*.json) into the normalized tables. Each feature implements
// a pure LegacyImporter for the blob keys its manifest lists; the foundation
// script scripts/import-legacy.ts runs them in dependency order and writes
// with the service role. Re-running converges: every new id is a uuid v5 of the
// legacy coordinates, and every write is an upsert on id.

import type { EventId, Uuid } from '@/core/brand';
import type { FeatureKey } from '@/core/registry';
import type { WorkCalendar } from '@/core/dates';

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
  // TODO: 1 load blob; 2 insert it verbatim into sce_tcsk_backups (kind 'pre_migration', format 1);
  // 3 topo-sort importers; 4 plan all (pure) and print the report; 5 unless dryRun, upsert each
  // batch on id in order; 6 demote admins not in keepAdmins; 7 set sce_tcsk_app_data.migrated_at.
  throw new Error('not implemented');
}
