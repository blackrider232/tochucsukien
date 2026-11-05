import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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
    expect(mentioning(/\b(systemAuditWriter|startSystemRun|systemContext)\b/)).toEqual(['src/core/auth/admin.ts', 'src/core/auth/cron.ts']);
    expect(mentioning(/@\/core\/auth\/cron|\.\/cron'/).filter((f) => !f.startsWith('src/app/api/cron/'))).toEqual([]);
  });
});
