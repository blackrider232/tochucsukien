// Every audit action and entity literal in reports' server code, written
// through core's real audit writer: a literal outside the charset of
// 202611041350_core_audit_action_charset.sql would be refused there and the
// command's row lost as `unaudited`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { memoryDb } from '@/core/db';
import { memoryAuditWriter } from '@/core/db/memory';
import { admin, harness } from './harness';

const SERVER = join(__dirname, '..', 'server');

function auditLiterals() {
  const actions = new Set<string>();
  const entities = new Set<string>();
  let calls = 0;
  for (const file of readdirSync(SERVER).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(SERVER, file), 'utf8');
    const constants = new Map([...src.matchAll(/const ([A-Z_]+) = '([^']+)';/g)].map((m) => [m[1]!, m[2]!]));
    for (const m of src.matchAll(/\baudit\(\s*(?:'([^']+)'|([A-Z_]+))\s*,/g)) {
      calls += 1;
      const action = m[1] ?? constants.get(m[2]!);
      if (action === undefined) throw new Error(`${file}: audit action ${m[2]} is not a string constant of the file`);
      actions.add(action);
    }
    for (const m of src.matchAll(/,\s*'([^']+)',\s*[\w.]+,?\s*\),?\s*\n/g)) entities.add(m[1]!);
  }
  return { actions: [...actions], entities: [...entities], calls };
}

describe('reports audit literals fit core audit charset', () => {
  const found = auditLiterals();

  it('the scan finds every audit call', () => {
    expect(found.calls).toBe(11);
    expect(found.actions).toHaveLength(10);
    expect(found.entities.sort()).toEqual(['bidding_package', 'daily_report', 'media_clipping', 'press_release']);
  });

  it.each(found.actions.flatMap((action) => found.entities.map((entity) => [action, entity] as const)))('%s on %s is accepted', async (action, entity) => {
    const h = harness();
    const eventId = await h.createEvent();
    const write = memoryAuditWriter(memoryDb(h.seed, admin))!;
    await expect(write(admin, { command: 'reports.createClipping', perm: 'reports.write', action, summary: 's', eventId, entity, entityId: 'x' })).resolves.toBeUndefined();
  });

  it('the writer behind the check refuses a character outside the charset', async () => {
    const h = harness();
    const eventId = await h.createEvent();
    const write = memoryAuditWriter(memoryDb(h.seed, admin))!;
    await expect(write(admin, { command: 'reports.createClipping', perm: 'reports.write', action: 'XÓA → TIN BÀI', summary: 's', eventId, entity: 'media_clipping', entityId: 'x' })).rejects.toThrow();
    await expect(write(admin, { command: 'reports.createClipping', perm: 'reports.write', action: 'XÓA TIN BÀI', summary: 's', eventId, entity: 'tin bài', entityId: 'x' })).rejects.toThrow();
  });
});
