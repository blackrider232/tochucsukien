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

  it('no feature names a writer or the service client', () => {
    expect(mentioning(/\b(memoryAuditWriter|supabaseAuditWriter|serviceClient|AuditWriter)\b/).filter((f) => f.startsWith('src/features/'))).toEqual([]);
  });
});
