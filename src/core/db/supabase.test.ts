import { describe, expect, it } from 'vitest';
import type { GuestId, Version } from '@/core/brand';
import { DbError, supabaseDb } from '@/core/db';
import { supabaseAuditWriter } from '@/core/db/supabase';
import { translatePgError, type PgBuilder, type PgResponse } from '@/core/db/supabase';
import { testActor, XTDT } from '@/core/testing/actors';
import { checkinsTable, E1, guestsTable } from '@/core/testing/tables';

type Call = { table: string; ops: Array<[string, ...unknown[]]> };
type Responder = (call: Call) => PgResponse | Promise<PgResponse>;

/** Records each chained call and answers when awaited, like supabase-js' builders. */
function fakeClient(respond: Responder) {
  const calls: Call[] = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const builder = (call: Call): PgBuilder => {
    const chain = (op: string) => (...args: unknown[]) => {
      call.ops.push([op, ...args]);
      return builder(call);
    };
    const settle = () => Promise.resolve().then(() => respond(call));
    return {
      select: chain('select'), insert: chain('insert'), upsert: chain('upsert'), update: chain('update'), delete: chain('delete'),
      eq: chain('eq'), in: chain('in'), is: chain('is'), order: chain('order'), range: chain('range'),
      maybeSingle: () => {
        call.ops.push(['maybeSingle']);
        return settle();
      },
      then: (ok, fail) => settle().then(ok, fail),
    };
  };
  const client = {
    from: (table: string) => {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return builder(call);
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return respond({ table: `rpc:${fn}`, ops: [['rpc', args]] });
    },
  };
  return { client, calls, rpcs };
}

const has = (call: Call, op: string) => call.ops.some(([o]) => o === op);
const opArgs = (call: Call, op: string) => call.ops.filter(([o]) => o === op).map(([, ...a]) => a);

const G1 = 'aaaaaaaa-0000-4000-8000-000000000001' as GuestId;
const guestRow = (over: Record<string, unknown> = {}) => ({
  id: G1, event_id: E1, legacy_id: null, name: 'Nguyễn Văn A', guest_group: 'VIP', organization: 'UBND', rsvp_status: 'pending',
  checkin_code: 'K7M2PQ', version: 3, created_at: '2026-11-01T00:00:00+00:00', created_by: null, updated_at: '2026-11-02T00:00:00+00:00', updated_by: null,
  ...over,
});
const ok = (data: unknown): PgResponse => ({ data, error: null, status: 200 });
const fail = (code: string, message: string, status = 400): PgResponse => ({ data: null, error: { code, message }, status });
const actor = testActor('user', XTDT);

async function kindOf(p: Promise<unknown>): Promise<string | null> {
  return p.then(() => null, (e: unknown) => (e instanceof DbError ? e.kind : `non-DbError: ${String(e)}`));
}

describe('supabaseDb row mapping', () => {
  it('maps snake_case columns and overrides to the parsed domain row', async () => {
    const { client, calls } = fakeClient(() => ok([guestRow()]));
    const rows = await supabaseDb(client, actor).table(guestsTable).list({ eventId: E1, group: ['VIP', 'BaoChi'], rsvpStatus: undefined });
    expect(rows).toEqual([expect.objectContaining({ id: G1, eventId: E1, group: 'VIP', checkinCode: 'K7M2PQ', version: 3 })]);
    const call = calls[0]!;
    expect(call.table).toBe('sce_tcsk_guests');
    expect(opArgs(call, 'eq')).toEqual([['event_id', E1]]);
    expect(opArgs(call, 'in')).toEqual([['guest_group', ['VIP', 'BaoChi']]]);
    expect(opArgs(call, 'order')).toEqual([['name', { ascending: true }], ['id', { ascending: true }]]);
  });

  it('pages past the PostgREST row cap instead of truncating at 1000', async () => {
    const page = (n: number, offset: number) => Array.from({ length: n }, (_, i) => guestRow({ id: `aaaaaaaa-0000-4000-8000-${String(offset + i).padStart(12, '0')}` }));
    const { client, calls } = fakeClient((call) => {
      const [[from]] = opArgs(call, 'range') as [[number, number]];
      return ok(from === 0 ? page(1000, 0) : page(5, 1000));
    });
    expect(await supabaseDb(client, actor).table(guestsTable).list()).toHaveLength(1005);
    expect(calls.map((c) => opArgs(c, 'range')[0])).toEqual([[0, 999], [1000, 1999]]);
  });

  it('honours a limit without an extra request', async () => {
    const { client, calls } = fakeClient(() => ok([guestRow()]));
    await supabaseDb(client, actor).table(guestsTable).list(undefined, { limit: 1 });
    expect(calls.map((c) => opArgs(c, 'range')[0])).toEqual([[0, 0]]);
  });

  it('turns NULL filters into IS NULL', async () => {
    const { client, calls } = fakeClient(() => ok([]));
    await supabaseDb(client, actor).table(checkinsTable).list({ checkedInAt: null });
    expect(opArgs(calls[0]!, 'is')).toEqual([['checked_in_at', null]]);
  });

  it('a row that does not match the schema is a bug, reported with the table name', async () => {
    const { client } = fakeClient(() => ok([guestRow({ guest_group: 'Khác' })]));
    await expect(supabaseDb(client, actor).table(guestsTable).list()).rejects.toThrow('sce_tcsk_guests: row does not match its schema');
  });

  it('never sends managed columns on writes', async () => {
    const { client, calls } = fakeClient(() => ok([guestRow({ version: 4 })]));
    await supabaseDb(client, actor).table(guestsTable).update(G1, { name: 'B', version: 99 } as never, { expectedVersion: 3 as Version });
    expect(opArgs(calls[0]!, 'update')).toEqual([[{ name: 'B' }]]);
  });
});

describe('supabaseDb optimistic concurrency', () => {
  it('guards updates with the expected version', async () => {
    const { client, calls } = fakeClient(() => ok([guestRow({ version: 4, name: 'B' })]));
    const row = await supabaseDb(client, actor).table(guestsTable).update(G1, { name: 'B' }, { expectedVersion: 3 as Version });
    expect(row.version).toBe(4);
    expect(opArgs(calls[0]!, 'eq')).toEqual([['id', G1], ['version', 3]]);
  });

  it.each([
    ['conflict', guestRow({ version: 5 })],
    ['forbidden', guestRow({ version: 3 })],
    ['not_found', null],
  ])('a guarded update that touched no row is %s when the re-read finds %j', async (kind, reread) => {
    const { client } = fakeClient((call) => (has(call, 'update') ? ok([]) : ok(reread)));
    expect(await kindOf(supabaseDb(client, actor).table(guestsTable).update(G1, { name: 'B' }, { expectedVersion: 3 as Version }))).toBe(kind);
  });

  it('idempotent-set updates skip the version filter', async () => {
    const { client, calls } = fakeClient(() => ok([guestRow()]));
    await supabaseDb(client, actor).table(guestsTable).update(G1, { name: 'B' }, { overwrite: 'idempotent-set' });
    expect(opArgs(calls[0]!, 'eq')).toEqual([['id', G1]]);
  });

  it('remove with a stale version is a conflict; without a guard a missing row is a no-op', async () => {
    const stale = fakeClient((call) => (has(call, 'delete') ? ok([]) : ok(guestRow({ version: 9 }))));
    expect(await kindOf(supabaseDb(stale.client, actor).table(guestsTable).remove(G1, { expectedVersion: 3 as Version }))).toBe('conflict');
    const gone = fakeClient((call) => (has(call, 'delete') ? ok([]) : ok(null)));
    expect(await kindOf(supabaseDb(gone.client, actor).table(guestsTable).remove(G1))).toBeNull();
  });
});

describe('supabaseDb idempotent inserts', () => {
  const insertDraft = { id: G1, eventId: E1, name: 'Nguyễn Văn A', group: 'VIP' as const, organization: 'UBND', rsvpStatus: 'pending', checkinCode: 'K7M2PQ' };
  const pkeyClash = fail('23505', 'duplicate key value violates unique constraint "sce_tcsk_guests_pkey"', 409);

  it('a retried insert with the same id and payload returns the stored row', async () => {
    const { client } = fakeClient((call) => (has(call, 'insert') ? pkeyClash : ok(guestRow())));
    expect(await supabaseDb(client, actor).table(guestsTable).insert(insertDraft)).toMatchObject({ id: G1, version: 3 });
  });

  it('the same id with a different payload is a conflict', async () => {
    const { client } = fakeClient((call) => (has(call, 'insert') ? pkeyClash : ok(guestRow({ name: 'Khác' }))));
    expect(await kindOf(supabaseDb(client, actor).table(guestsTable).insert(insertDraft))).toBe('conflict');
  });

  it('generates a uuid when the draft has none', async () => {
    const { client, calls } = fakeClient(() => ok([guestRow()]));
    await supabaseDb(client, actor).table(guestsTable).insert({ ...insertDraft, id: undefined });
    const [[sent]] = opArgs(calls[0]!, 'insert') as [[Record<string, unknown>]];
    expect(sent.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.guest_group).toBe('VIP');
  });

  it('insertMany ignores duplicates and returns every row in input order', async () => {
    const G2 = 'aaaaaaaa-0000-4000-8000-000000000002';
    const { client, calls } = fakeClient((call) => (has(call, 'upsert') ? ok([guestRow({ id: G2 })]) : ok([guestRow()])));
    const rows = await supabaseDb(client, actor).table(guestsTable).insertMany([insertDraft, { ...insertDraft, id: G2 as GuestId }]);
    expect(rows.map((r) => r.id)).toEqual([G1, G2]);
    expect(opArgs(calls[0]!, 'upsert')[0]![1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(opArgs(calls[1]!, 'in')).toEqual([['id', [G1]]]);
  });

  it('upsertOn targets the declared key and never re-keys the existing row', async () => {
    const { client, calls } = fakeClient(() => ok([{ id: 'c1', event_id: E1, guest_id: G1, desk: 'Bàn 1', checked_in_at: null, version: 1, created_at: '2026-11-01T00:00:00Z', created_by: null, updated_at: '2026-11-01T00:00:00Z', updated_by: null }]));
    await supabaseDb(client, actor).table(checkinsTable).upsertOn(['eventId', 'guestId'], { id: 'new-id', eventId: E1, guestId: G1, desk: 'Bàn 1', checkedInAt: null });
    const [[values, options]] = opArgs(calls[0]!, 'upsert') as [[Record<string, unknown>, unknown]];
    expect(values).not.toHaveProperty('id');
    expect(options).toEqual({ onConflict: 'event_id,guest_id' });
  });

  it('removeWhere refuses an empty condition', async () => {
    const { client } = fakeClient(() => ok([]));
    await expect(supabaseDb(client, actor).table(guestsTable).removeWhere({})).rejects.toThrow('needs at least one condition');
  });
});

describe('error translation', () => {
  it.each([
    [fail('23505', 'duplicate key value violates unique constraint "sce_tcsk_booths_event_id_code_key"'), 'constraint', 'sce_tcsk_booths_event_id_code_key'],
    [fail('23514', 'new row for relation "x" violates check constraint "sce_tcsk_booths_company_check"'), 'constraint', 'sce_tcsk_booths_company_check'],
    [fail('23514', 'last_admin'), 'constraint', 'last_admin'],
    [fail('42501', 'new row violates row-level security policy for table "sce_tcsk_guests"', 403), 'forbidden', undefined],
    [fail('PGRST301', 'JWT expired', 401), 'forbidden', undefined],
    [fail('PGRST116', 'JSON object requested, multiple (or no) rows returned', 406), 'not_found', undefined],
    [fail('P0002', 'not_found'), 'not_found', undefined],
    [fail('', 'TypeError: fetch failed', 0), 'unavailable', undefined],
    [fail('57014', 'canceling statement due to statement timeout', 500), 'unavailable', undefined],
  ])('%j -> %s', (res, kind, constraint) => {
    const err = translatePgError(res.error!, res.status, 't');
    expect(err.kind).toBe(kind);
    if (constraint) expect(err.detail?.constraint).toBe(constraint);
  });

  it('a network exception becomes unavailable', async () => {
    const { client } = fakeClient(() => {
      throw new TypeError('fetch failed');
    });
    expect(await kindOf(supabaseDb(client, actor).table(guestsTable).get(G1))).toBe('unavailable');
  });
});

describe('supabaseDb rpc', () => {
  it('maps arguments to SQL parameter names and parses results', async () => {
    const { client, rpcs } = fakeClient((call) => ok(call.table === 'rpc:sce_tcsk_create_backup' ? 42 : null));
    const db = supabaseDb(client, actor);
    expect(await db.rpc('sce_tcsk_create_backup', { note: 'n', kind: 'manual' })).toEqual({ id: 42 });
    expect(rpcs[0]).toEqual({ fn: 'sce_tcsk_create_backup', args: { note: 'n', kind: 'manual' } });
  });

  it('translates function errors', async () => {
    const { client } = fakeClient(() => fail('42501', 'forbidden'));
    expect(await kindOf(supabaseDb(client, actor).rpc('sce_tcsk_set_profile_role', { id: actor.profile.id, role: 'admin' }))).toBe('forbidden');
  });

  it('refuses functions outside the allowlist, the command audit writer among them', async () => {
    const { client } = fakeClient(() => ok(null));
    await expect(supabaseDb(client, actor).rpc('pg_sleep' as never, {} as never)).rejects.toThrow('not allowlisted');
    await expect(supabaseDb(client, actor).rpc('sce_tcsk_audit_command' as never, {} as never)).rejects.toThrow('not allowlisted');
  });
});

describe('supabaseAuditWriter', () => {
  const row = { command: 'guests.update', perm: 'guests.write', action: 'X', summary: 's', eventId: E1, entity: 'guest', entityId: G1 } as const;

  it('calls the writer on the service client with the actor and its assurance level from the server', async () => {
    const { client, rpcs } = fakeClient(() => ok(null));
    await supabaseAuditWriter(() => client)(actor, row);
    expect(rpcs).toEqual([{ fn: 'sce_tcsk_audit_command', args: {
      actor_id: actor.profile.id, actor_aal: actor.aal, command: 'guests.update', perm: 'guests.write', action: 'X', summary: 's', event_id: E1, entity: 'guest', entity_id: G1,
    } }]);
  });

  it('translates a refusal', async () => {
    const { client } = fakeClient(() => fail('42501', 'forbidden'));
    expect(await kindOf(supabaseAuditWriter(() => client)(actor, row))).toBe('forbidden');
  });
});
