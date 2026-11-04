// Enforces the parallel-work contract (docs/architecture/design.md, item 8).
// collectSnapshot() reads the repo; checkContract() is pure, so the tests
// break each rule on a copy of the real snapshot.
// Usage: pnpm check:contract

import './server-context';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { permissionMatrix } from '@/core/permissions';
import { parseCatalog, tablesTouched, type SqlFile } from '@/core/db/sql-catalog';
import { PERMISSIONS_SQL_PATH, renderPermissionsSql } from './gen-permissions-sql';

export interface ManifestFacts {
  key: string;
  permissions: ReadonlyArray<string>;
  routes: ReadonlyArray<string>;
  tables: ReadonlyArray<string>;
}

export interface ContractSnapshot {
  featureDirs: ReadonlyArray<string>;
  /** Files each feature dir must have, keyed by feature, listing the ones present. */
  featureFiles: Readonly<Record<string, ReadonlyArray<string>>>;
  registries: { manifests: ReadonlyArray<string>; slots: ReadonlyArray<string>; servers: ReadonlyArray<string> };
  manifests: ReadonlyArray<ManifestFacts>;
  /** Directories under src/app holding a page.tsx, relative to src/app ('' for the root page). */
  pages: ReadonlyArray<string>;
  /** Keys a feature's files add to CommandMap / PermissionMap by declaration merging. */
  augmentations: ReadonlyArray<{ feature: string; file: string; map: 'CommandMap' | 'PermissionMap'; keys: ReadonlyArray<string> }>;
  /** Runtime verbs of each feature's server `commands` record. */
  commandVerbs: Readonly<Record<string, ReadonlyArray<string>>>;
  permissionsSql: { onDisk: string; generated: string };
  migrations: ReadonlyArray<SqlFile>;
  /** Non-test files that return `audit: 'sql'`, by feature. */
  sqlAudits: ReadonlyArray<{ feature: string; file: string }>;
}

export const REQUIRED_FEATURE_FILES = ['manifest.ts', 'slots.tsx', 'index.ts', 'contract.ts', 'server/index.ts'] as const;

/** Pages the foundation owns. Exact dirs, plus subtrees ending in '/**'. */
export const FOUNDATION_PAGES: ReadonlyArray<string> = ['', '(app)', '(app)/go/**', '(app)/events/[eventId]', '(auth)/**', '(print)', 'dev/**'];

const FOUNDATION_MIGRATION = /^000\d_[a-z0-9_]+\.sql$/;
const MODULE_MIGRATION = /^(\d{12})_([a-z]+)_[a-z0-9_]+\.sql$/;

const segments = (dir: string) => dir.split('/').filter(Boolean);
const isAncestorOrSelf = (ancestor: string, dir: string) => {
  const [a, d] = [segments(ancestor), segments(dir)];
  return a.length <= d.length && a.every((s, i) => s === d[i]);
};
const foundationOwns = (page: string) =>
  FOUNDATION_PAGES.some((f) => (f.endsWith('/**') ? isAncestorOrSelf(f.slice(0, -3), page) : f === page));

export function checkContract(s: ContractSnapshot): string[] {
  const errors: string[] = [];
  const keys = new Set(s.manifests.map((m) => m.key));

  // 1. Feature directories vs the three registry lists.
  for (const [name, listed] of Object.entries(s.registries)) {
    for (const dir of s.featureDirs) if (!listed.includes(dir)) errors.push(`src/features/${dir} is missing from the ${name} registry`);
    for (const key of listed) if (!s.featureDirs.includes(key)) errors.push(`${name} registry lists "${key}" but src/features/${key} does not exist`);
  }
  for (const dir of s.featureDirs) {
    for (const file of REQUIRED_FEATURE_FILES) {
      if (!(s.featureFiles[dir] ?? []).includes(file)) errors.push(`src/features/${dir}/${file} is missing`);
    }
  }

  // 2. Every page is covered by exactly one owner.
  for (const page of s.pages) {
    if (foundationOwns(page)) {
      const claimant = s.manifests.find((m) => m.routes.includes(page));
      if (claimant) errors.push(`app/${page}/page.tsx is foundation-owned but ${claimant.key} declares it`);
      continue;
    }
    const covering = s.manifests.flatMap((m) => m.routes.filter((r) => isAncestorOrSelf(r, page)).map((r) => ({ key: m.key, route: r })));
    const depth = Math.max(-1, ...covering.map((c) => segments(c.route).length));
    const best = covering.filter((c) => segments(c.route).length === depth);
    if (best.length === 0) errors.push(`app/${page}/page.tsx is not covered by any manifest route`);
    else if (best.length > 1) errors.push(`app/${page}/page.tsx is covered by ${best.map((b) => `${b.key} (${b.route})`).join(' and ')}`);
  }
  const routeOwners = new Map<string, string>();
  for (const m of s.manifests) {
    for (const r of m.routes) {
      const prev = routeOwners.get(r);
      if (prev && prev !== m.key) errors.push(`route ${r} is declared by both ${prev} and ${m.key}`);
      routeOwners.set(r, m.key);
    }
  }

  // 3. Permission keys and command ids carry their feature's prefix.
  const seenPerms = new Map<string, string>();
  for (const m of s.manifests) {
    for (const p of m.permissions) {
      if (!p.startsWith(`${m.key}.`)) errors.push(`permission ${p} in the ${m.key} manifest must start with "${m.key}."`);
      const prev = seenPerms.get(p);
      if (prev) errors.push(`permission ${p} is declared by both ${prev} and ${m.key}`);
      seenPerms.set(p, m.key);
    }
  }
  for (const a of s.augmentations) {
    for (const k of a.keys) {
      if (!k.startsWith(`${a.feature}.`)) errors.push(`${a.map} key ${k} in ${a.file} must start with "${a.feature}."`);
    }
  }
  for (const [feature, verbs] of Object.entries(s.commandVerbs)) {
    const declared = new Set(s.augmentations.filter((a) => a.map === 'CommandMap' && a.feature === feature).flatMap((a) => a.keys));
    for (const verb of verbs) {
      if (!declared.has(`${feature}.${verb}`)) errors.push(`command ${feature}.${verb} is implemented but not declared in ${feature}'s CommandMap`);
    }
  }

  for (const a of s.sqlAudits) {
    if (a.feature !== 'core') errors.push(`${a.file} returns audit: 'sql'; only core's SQL functions write their own audit rows`);
  }

  // 4. The generated permission seed is fresh.
  if (s.permissionsSql.onDisk !== s.permissionsSql.generated) {
    errors.push('supabase/migrations/0004_permissions_seed.sql is stale: run pnpm tsx scripts/gen-permissions-sql.ts');
  }

  // 5. Table owner comments match the manifests' tables.
  const catalog = parseCatalog(s.migrations);
  const listedBy = new Map<string, string>();
  for (const m of s.manifests) {
    for (const t of m.tables) {
      const prev = listedBy.get(t);
      if (prev) errors.push(`table ${t} is listed by both ${prev} and ${m.key}`);
      listedBy.set(t, m.key);
      const owner = catalog.get(t)?.owner;
      if (!owner) errors.push(`table ${t} (manifest ${m.key}) has no sce:owner comment in any migration`);
      else if (owner !== m.key) errors.push(`table ${t} is listed by ${m.key} but its comment says sce:owner=${owner}`);
    }
  }
  for (const t of catalog.values()) {
    if (t.owner && !listedBy.has(t.name)) errors.push(`table ${t.name} has sce:owner=${t.owner} but no manifest lists it`);
    if (t.owner && !keys.has(t.owner)) errors.push(`table ${t.name} names unknown owner "${t.owner}"`);
  }

  // 6. Module migrations touch only their own feature's tables.
  for (const file of s.migrations) {
    if (FOUNDATION_MIGRATION.test(file.name)) continue;
    const m = MODULE_MIGRATION.exec(file.name);
    if (!m || !keys.has(m[2]!)) {
      errors.push(`migration ${file.name} must be named <yyyymmddhhmm>_<feature>_<desc>.sql with a known feature`);
      continue;
    }
    const feature = m[2]!;
    for (const t of tablesTouched(file.sql)) {
      const owner = catalog.get(t)?.owner;
      if (owner !== feature) errors.push(`migration ${file.name} (${feature}) touches ${t}, owned by ${owner ?? 'nobody'}`);
    }
    for (const t of parseCatalog([file]).values()) {
      if (t.columns.length > 0 && !t.policy) errors.push(`migration ${file.name} creates ${t.name} without calling tcsk.register_table`);
    }
  }

  return errors;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const AUGMENT = /declare module '@\/core\/(commands|permissions)'\s*\{\s*interface (CommandMap|PermissionMap)\s*\{([\s\S]*?)\n\s*\}\s*\n?\s*\}/g;

export function augmentationsIn(source: string): Array<{ map: 'CommandMap' | 'PermissionMap'; keys: string[] }> {
  return [...source.matchAll(AUGMENT)].map((m) => ({
    map: m[2] as 'CommandMap' | 'PermissionMap',
    keys: [...m[3]!.matchAll(/^\s*'([^']+)'\s*:/gm)].map((k) => k[1]!),
  }));
}

const strip = (e: ts.Expression): ts.Expression => (ts.isParenthesizedExpression(e) ? strip(e.expression) : e);
const isAuditKey = (name: ts.PropertyName) =>
  (ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression) ? name.expression.text : '') === 'audit';
/** An audit value no reader can check by eye: built from parts, or cast past the type of CommandOutcome. */
function opaqueAudit(e: ts.Expression): boolean {
  const v = strip(e);
  if (ts.isConditionalExpression(v)) return opaqueAudit(v.whenTrue) || opaqueAudit(v.whenFalse);
  return ts.isTemplateExpression(v) || ts.isBinaryExpression(v) || ts.isAsExpression(v) || ts.isTypeAssertionExpression(v);
}

/**
 * Whether feature source can return `audit: 'sql'`: a 'sql' string anywhere (a variable may carry it), or an
 * `audit` property whose value is concatenated, templated or cast. A heuristic over the syntax tree; the pipeline's
 * runtime check is the control, and it catches what this misses after the change has saved.
 */
export function sqlAuditIn(code: string, fileName = 'feature.ts'): boolean {
  const file = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isStringLiteralLike(node) && node.text === 'sql' && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) found = true;
    else if (ts.isPropertyAssignment(node) && isAuditKey(node.name) && opaqueAudit(node.initializer)) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

export async function collectSnapshot(root: string): Promise<ContractSnapshot> {
  // After ./server-context: the feature servers reach core/auth/admin.ts, which is server-only.
  const [{ featureManifests }, { featureServers }, { featureSlots }] = await Promise.all([
    import('@/features/registry'), import('@/features/registry-server'), import('@/features/registry-slots'),
  ]);
  const featuresDir = join(root, 'src', 'features');
  const featureDirs = readdirSync(featuresDir).filter((d) => statSync(join(featuresDir, d)).isDirectory()).sort();
  const featureFiles = Object.fromEntries(featureDirs.map((d) => [d, REQUIRED_FEATURE_FILES.filter((f) => existsSync(join(featuresDir, d, f)))]));

  const appDir = join(root, 'src', 'app');
  const pages = walk(appDir)
    .filter((f) => /[/\\]page\.(tsx|ts|jsx|js)$/.test(f))
    .map((f) => relative(appDir, f).split(sep).slice(0, -1).join('/'))
    .sort();

  const sources = featureDirs.flatMap((feature) =>
    walk(join(featuresDir, feature))
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((file) => ({ feature, file: relative(root, file), code: readFileSync(file, 'utf8') })),
  );
  const augmentations = sources.flatMap(({ feature, file, code }) => augmentationsIn(code).map((a) => ({ feature, file, ...a })));
  const sqlAudits = sources
    .filter(({ file, code }) => !file.includes(`${sep}__tests__${sep}`) && sqlAuditIn(code, file))
    .map(({ feature, file }) => ({ feature, file }));

  const manifests = featureManifests();
  const migrationsDir = join(root, 'supabase', 'migrations');
  return {
    featureDirs,
    featureFiles,
    registries: { manifests: manifests.map((m) => m.key), slots: Object.keys(featureSlots), servers: Object.keys(featureServers) },
    manifests: manifests.map((m) => ({
      key: m.key,
      permissions: Object.keys(m.permissions),
      routes: m.routes.map((r) => r.dir),
      tables: [...m.tables],
    })),
    pages,
    augmentations,
    commandVerbs: Object.fromEntries(Object.entries(featureServers).map(([k, v]) => [k, Object.keys(v.commands)])),
    permissionsSql: { onDisk: readFileSync(PERMISSIONS_SQL_PATH, 'utf8'), generated: renderPermissionsSql(permissionMatrix()) },
    migrations: readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') })),
    sqlAudits,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkContract(await collectSnapshot(join(import.meta.dirname, '..')));
  if (errors.length > 0) {
    for (const e of errors) console.error(`✗ ${e}`);
    console.error(`check:contract failed with ${errors.length} violation(s)`);
    process.exit(1);
  }
  console.log('check:contract passed: features, registries, routes, permissions, commands, SQL seed, table owners and migrations agree');
}
