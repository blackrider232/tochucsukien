// @vitest-environment node
// tcsk.audit_text as the migrations define it last, on PGlite, against the memory writer's copy of it.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { memoryDb, type CommandAuditRow } from '@/core/db';
import { inspectMemoryDb, memoryAuditWriter } from '@/core/db/memory';
import { testActor, XTDT } from '@/core/testing/actors';
import { E1, eventRows } from '@/core/testing/tables';

const dir = join(process.cwd(), 'supabase', 'migrations');
const latestAuditText = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
  .map((f) => /create or replace function tcsk\.audit_text\(t text\)[\s\S]*?\$\$[\s\S]*?\$\$;/.exec(readFileSync(join(dir, f), 'utf8'))?.[0])
  .filter((sql): sql is string => sql !== undefined).at(-1)!;

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`create schema tcsk; ${latestAuditText}`);
});

/** Unicode White_Space. */
const label = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const SPACES: ReadonlyArray<number> = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004,
  0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000];

describe('the memory audit writer cleans an action exactly as tcsk.audit_text does', () => {
  const row: CommandAuditRow = { command: 'guests.update', perm: 'guests.write', action: '', summary: 's', eventId: E1, entity: 'guest', entityId: '1' };

  const clean = async (action: string) => {
    const sql = await db.query<{ clean: string | null }>('select tcsk.audit_text($1) as clean', [action]);
    const seed = { sce_tcsk_events: eventRows() };
    await memoryAuditWriter(memoryDb(seed, testActor('user', XTDT)))!(testActor('user', XTDT), { ...row, action }).catch(() => undefined);
    return { sql: sql.rows[0]?.clean ?? null, memory: inspectMemoryDb(seed, 'sce_tcsk_audit_logs')[0]?.action ?? null };
  };

  it.each(SPACES.map((cp) => [label(cp), String.fromCodePoint(cp)]))('collapses %s like a space', async (_label, space) => {
    expect(await clean(` CẬP${space}${space}NHẬT${space}`)).toEqual({ sql: 'CẬP NHẬT', memory: 'CẬP NHẬT' });
  });

  it.each([0x1c, 0x1d, 0x1e, 0x1f].map((cp) => [label(cp), String.fromCodePoint(cp)]))('keeps %s, which is not white space, so the charset refuses the row', async (_label, c) => {
    expect(await clean(` CẬP${c}NHẬT`)).toEqual({ sql: `CẬP${c}NHẬT`, memory: null });
  });
});
