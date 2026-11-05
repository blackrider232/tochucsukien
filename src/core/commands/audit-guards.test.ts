import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const isTest = (f: string) => /\.test\.tsx?$/.test(f) || f.includes('/__tests__/') || f.includes('/testing/');
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? sources(p) : /\.(ts|tsx|mjs)$/.test(d.name) ? [p] : [];
  });
}
const files = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'scripts'))].filter((f) => !isTest(f));
const mentioning = (pattern: RegExp) => files.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f)).sort();

describe('who can reach the audit writer', () => {
  it('the SQL writers are named only inside the Db layer (and the SQL test script)', () => {
    expect(mentioning(/sce_tcsk_audit_command|sce_tcsk_write_audit/).filter((f) => !f.startsWith('src/core/db/') && f !== 'scripts/verify-sql.mjs')).toEqual([]);
  });

  it('the service-role writer is built in core/auth and handed to runCommand by dispatch alone', () => {
    expect(mentioning(/\bcommandAuditWriter\b/)).toEqual(['src/core/auth/admin.ts', 'src/core/commands/dispatch.ts']);
    expect(readFileSync(join(ROOT, 'src/core/commands/dispatch.ts'), 'utf8')).toMatch(/runCommand\(loaded\.ctx, lookup, id, input, commandAuditWriter\(loaded\.ctx\.db\)\)/);
  });

  it('the writers trust the actor they get, so they live behind a server-only module that only core/auth/admin.ts imports', () => {
    const SERVER_ONLY = /^import 'next\/dist\/compiled\/server-only';$/m;
    expect(readFileSync(join(ROOT, 'src/core/db/index.ts'), 'utf8')).not.toMatch(/\b(memoryAuditWriter|supabaseAuditWriter)\b/);
    expect(mentioning(/\b(memoryAuditWriter|supabaseAuditWriter)\b/)).toEqual([
      'src/core/auth/admin.ts', 'src/core/commands/pipeline.ts', 'src/core/db/audit-writers.ts', 'src/core/db/memory.ts', 'src/core/db/supabase.ts',
    ]);
    expect(mentioning(/@\/core\/db\/audit-writers|\.\/audit-writers/)).toEqual(['src/core/auth/admin.ts']);
    // pipeline.ts keeps only the memoryDb default of runCommand, for tests and the dev memory runtime.
    expect(readFileSync(join(ROOT, 'src/core/commands/pipeline.ts'), 'utf8')).not.toMatch(/\bsupabaseAuditWriter\b/);
    for (const f of ['src/core/auth/admin.ts', 'src/core/db/audit-writers.ts']) expect(readFileSync(join(ROOT, f), 'utf8')).toMatch(SERVER_ONLY);
  });

  it('no feature names a writer or the service client', () => {
    expect(mentioning(/\b(memoryAuditWriter|supabaseAuditWriter|serviceClient|AuditWriter)\b/).filter((f) => f.startsWith('src/features/'))).toEqual([]);
  });

  it('a scheduled job reaches its writer, run claim and service-role context only through core/auth/cron.ts', () => {
    expect(mentioning(/rpc\('sce_tcsk_(audit_system|start_system_run)'/)).toEqual(['src/core/auth/admin.ts']);
    expect(mentioning(/\b(systemAuditWriter|startSystemRun)\b/)).toEqual(['src/core/auth/admin.ts', 'src/core/auth/cron.ts']);
    // `systemContext` is also a field name in feature code (comms' CronDeps), so match the import of admin.ts's function.
    expect(mentioning(/export (async )?function systemContext\b/)).toEqual(['src/core/auth/admin.ts']);
    expect(mentioning(/import\s*\{[^}]*\bsystemContext\b[^}]*\}\s*from\s*'(@\/core\/auth\/admin|\.\/admin)'/)).toEqual(['src/core/auth/cron.ts']);
    expect(mentioning(/@\/core\/auth\/cron/).filter((f) => !f.startsWith('src/app/api/cron/'))).toEqual([]);
    // A feature's own ./cron (comms') is not core's; inside core/auth nothing imports it.
    expect(mentioning(/from '\.\/cron'/).filter((f) => f.startsWith('src/core/auth/'))).toEqual([]);
  });

  it('a system actor is built by systemActor() in core/auth/system.ts and by nothing else', () => {
    // A feature that could build `{ ...actor, system: 'rsvp-sync' }` would hold the job's pipeline rights.
    const settingSystem = (file: string): boolean => {
      const code = readFileSync(join(ROOT, file), 'utf8');
      const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      let found = false;
      const visit = (node: ts.Node): void => {
        if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name.getText(source).replace(/['"]/g, '') === 'system') found = true;
        else ts.forEachChild(node, visit);
      };
      visit(source);
      return found;
    };
    expect(files.map((f) => relative(ROOT, f)).filter(settingSystem).sort()).toEqual(['src/core/auth/system.ts']);
    expect(mentioning(/\bsystemActor\b/)).toEqual(['src/core/auth/admin.ts', 'src/core/auth/index.ts', 'src/core/auth/system.ts']); // index.ts: its doc comment
    expect(mentioning(/\bSYSTEM_ACTOR_ID\b/)).toEqual(['src/core/auth/system.ts']);
    expect(mentioning(/@\/core\/auth\/system|\.\/system'/)).toEqual(['src/core/auth/admin.ts', 'src/core/auth/cron.ts']);
  });
});
