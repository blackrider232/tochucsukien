// One-time, re-runnable import of the legacy blob into the normalized tables.
// Usage:
//   pnpm tsx scripts/import-legacy.ts --dry-run --source file <export.json>
//   pnpm tsx scripts/import-legacy.ts --source database --keep-admins a@sce.vn,b@sce.vn
// Flags: --dry-run (plan and report only, no writes), --source file|database,
// --path <file> (or a positional path), --include-demo, --keep-admins <emails>.
// Writing needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDemoLegacyEvent, isDemoLegacyId, normalizeBlob, runLegacyImport, type ImportReport, type ImportRunOptions, type LegacyBlob, type LegacyImporter } from '@/core/legacy';
import type { FeatureManifest } from '@/core/registry';
import { featureManifests } from '@/features/registry';
import { featureServers } from '@/features/registry-server';

export function parseArgs(argv: ReadonlyArray<string>): ImportRunOptions {
  let source: 'file' | 'database' | null = null;
  let path: string | null = null;
  let dryRun = false;
  let includeDemo = false;
  let keepAdmins: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--include-demo') includeDemo = true;
    else if (arg === '--source') source = argv[++i] === 'database' ? 'database' : argv[i] === 'file' ? 'file' : fail(`--source must be file or database, got ${argv[i]}`);
    else if (arg === '--path') path = argv[++i] ?? fail('--path needs a file');
    else if (arg === '--keep-admins') keepAdmins = (argv[++i] ?? '').split(',').map((e) => e.trim()).filter(Boolean);
    else if (arg.startsWith('--')) fail(`unknown flag ${arg}`);
    else path = arg;
  }
  if (source === null) fail('--source file|database is required');
  if (source === 'file' && !path) fail('--source file needs a path');
  return { source: source === 'file' ? { kind: 'file', path: path! } : { kind: 'database' }, dryRun, includeDemo, keepAdmins };
}

function fail(message: string): never {
  throw new Error(message);
}

export interface KeyCoverage {
  key: string;
  rows: number;
  demoRows: number;
  owners: ReadonlyArray<{ feature: string; hasImporter: boolean }>;
}

/** What the blob holds per top-level key, who claims it, and whether that owner has an importer yet. */
export function blobCoverage(blob: LegacyBlob, manifests: ReadonlyArray<FeatureManifest>, importers: ReadonlyArray<LegacyImporter>): KeyCoverage[] {
  const withImporter = new Set(importers.map((i) => i.feature));
  const entries = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value).flatMap((v) => (Array.isArray(v) ? v : [])) : [];
  return Object.keys(blob)
    .sort()
    .map((key) => {
      const value = blob[key];
      const items = entries(value);
      const isRecord = value && typeof value === 'object' && !Array.isArray(value) && items.length === 0;
      return {
        key,
        rows: isRecord ? 1 : items.length,
        demoRows: items.filter((r) => r && typeof r === 'object' && (isDemoLegacyId((r as { id?: unknown }).id) || isDemoLegacyEvent(r as { name?: unknown }))).length,
        owners: manifests.filter((m) => m.legacyBlobKeys.includes(key)).map((m) => ({ feature: m.key, hasImporter: withImporter.has(m.key) })),
      };
    });
}

export function formatReport(opts: ImportRunOptions, report: ImportReport, coverage: ReadonlyArray<KeyCoverage>, importers: ReadonlyArray<LegacyImporter>): string {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const num = (s: string | number, n: number) => String(s).padStart(n);
  const from = opts.source.kind === 'file' ? `file ${opts.source.path}` : 'database (sce_tcsk_app_data id 1)';
  const lines = [
    `Legacy import${opts.dryRun ? ' (dry run, nothing written)' : ''} from ${from}`,
    `Importers: ${importers.map((i) => i.feature).join(', ') || 'none'} (${importers.length} of 9 features); demo rows ${opts.includeDemo ? 'included' : 'skipped'}`,
    '',
    'Blob keys',
    `  ${pad('key', 22)}${num('rows', 6)}${num('demo', 6)}  owners`,
    ...coverage.map(
      (c) =>
        `  ${pad(c.key, 22)}${num(c.rows, 6)}${num(c.demoRows, 6)}  ${c.owners.length === 0 ? 'UNCLAIMED' : c.owners.map((o) => (o.hasImporter ? o.feature : `${o.feature} (no importer yet)`)).join(', ')}`,
    ),
    '',
    'Planned writes',
    `  ${pad('table', 30)}${num('planned', 8)}${num('written', 9)}`,
    ...(report.counts.length === 0 ? ['  (none)'] : report.counts.map((c) => `  ${pad(c.table, 30)}${num(c.planned, 8)}${num(c.written, 9)}`)),
    '',
    `Issues (${report.issues.length})`,
    ...(report.issues.length === 0 ? ['  (none)'] : report.issues.map((i) => `  ${pad(i.severity, 16)}${pad(i.blobKey, 16)}${pad(i.legacyId ?? '-', 28)}${i.message}`)),
    '',
    `Admins demoted: ${opts.dryRun ? 'decided at import time (--keep-admins)' : report.demotedAdmins.join(', ') || 'none'}`,
    `Pre-import backup: ${report.preImportBackupId === null ? 'none (dry run)' : `sce_tcsk_backups #${report.preImportBackupId}`}`,
  ];
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const importers = Object.values(featureServers).flatMap((s) => (s.legacyImporter ? [s.legacyImporter] : []));
  const report = await runLegacyImport(opts, importers);
  const blob = opts.source.kind === 'file' ? normalizeBlob(JSON.parse(readFileSync(opts.source.path, 'utf8'))) : {};
  console.log(formatReport(opts, report, blobCoverage(blob, featureManifests(), importers), importers));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
