import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { GuestId, Instant, UserId, Version } from '@/core/brand';
import { DbError, defineTable, memoryDb, supabaseDb, type CommandAuditRow, type Db } from '@/core/db';
import { declareGuard, inspectMemoryDb, memoryAuditWriter, type MemoryGuard } from '@/core/db/memory';
import { PTDN, testActor, XTDT } from '@/core/testing/actors';
import { checkinsTable, contactsTable, E1, E2, E3, eventRows, eventsTable, guestsTable, type TestGuest } from '@/core/testing/tables';

const G = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}` as GuestId;
const draft = (eventId: typeof E1, id: GuestId, name: string) => ({ id, eventId, name, group: 'VIP' as const, organization: 'UBND', rsvpStatus: 'pending', checkinCode: `C${id.slice(-5)}` });

function setup() {
  const seed = { sce_tcsk_events: eventRows() };
  const xtdt = testActor('user', XTDT);
  const ptdn = testActor('user', PTDN);
  const admin = testActor('admin', null);
  return { seed, xtdt, ptdn, admin, as: (a: typeof xtdt) => memoryDb(seed, a) };
}

async function rejectsWith(p: Promise<unknown>, kind: DbError['kind']) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(DbError);
  expect((err as DbError).kind).toBe(kind);
  return err as DbError;
}

describe('memoryDb RLS emulation', () => {
  it('scopes event tables by lead or supporting department', async () => {
    const { as, xtdt, ptdn, admin } = setup();
    await as(admin).table(guestsTable).insertMany([draft(E1, G(1), 'A'), draft(E2, G(2), 'B'), draft(E3, G(3), 'C')]);
    expect((await as(xtdt).table(guestsTable).list()).map((g) => g.name)).toEqual(['A', 'C']);
    expect((await as(ptdn).table(guestsTable).list()).map((g) => g.name)).toEqual(['B', 'C']);
    expect(await as(xtdt).table(guestsTable).get(G(2))).toBeNull();
  });

  it('refuses writes into another department’s event', async () => {
    const { as, xtdt } = setup();
    await rejectsWith(as(xtdt).table(guestsTable).insert(draft(E2, G(1), 'A')), 'forbidden');
  });

  it('pending users and admins without AAL2 see nothing', async () => {
    const { as, admin, seed } = setup();
    await as(admin).table(guestsTable).insert(draft(E1, G(1), 'A'));
    expect(await memoryDb(seed, testActor('user', XTDT, { status: 'pending' })).table(guestsTable).list()).toEqual([]);
    expect(await memoryDb(seed, testActor('admin', null, { aal: 'aal1' })).table(guestsTable).list()).toEqual([]);
  });

  it('global tables use has_perm: everyone reads the directory, only admin writes', async () => {
    const { as, xtdt, admin } = setup();
    await rejectsWith(as(xtdt).table(contactsTable).insert({ name: 'X', group: 'VIP', organization: 'UBND' }), 'forbidden');
    await as(admin).table(contactsTable).insert({ name: 'X', group: 'VIP', organization: 'UBND' });
    expect((await as(xtdt).table(contactsTable).list()).map((c) => c.name)).toEqual(['X']);
  });

  it('a supporting department cannot edit the event row itself', async () => {
    const { as, xtdt } = setup();
    const e3 = (await as(xtdt).table(eventsTable).get(E3))!;
    await rejectsWith(as(xtdt).table(eventsTable).update(E3, { name: 'hijack' }, { expectedVersion: e3.version }), 'forbidden');
    const e1 = (await as(xtdt).table(eventsTable).get(E1))!;
    expect((await as(xtdt).table(eventsTable).update(E1, { name: 'đổi tên' }, { expectedVersion: e1.version })).version).toBe(2);
  });
});

describe('memoryDb soft-deleted events (0006)', () => {
  // E3 is led by PTDN with XTĐT supporting.
  async function deleteE3() {
    const { seed, as, xtdt, ptdn, admin } = setup();
    const actors = { xtdt, ptdn, admin, ptdnLead: testActor('dept_leader', PTDN), xtdtLead: testActor('dept_leader', XTDT), leader: testActor('leader', 'Ban Giám đốc') };
    await as(admin).table(guestsTable).insert(draft(E3, G(1), 'A'));
    const e3 = (await as(actors.ptdnLead).table(eventsTable).get(E3))!;
    const deleted = await as(actors.ptdnLead).table(eventsTable).update(E3, { deletedAt: '2026-11-04T01:00:00.000Z' }, { expectedVersion: e3.version });
    return { seed, as, actors, deleted };
  }

  it('the lead department’s dept_leader reads and restores its deleted event', async () => {
    const { as, actors, deleted } = await deleteE3();
    expect((await as(actors.ptdnLead).table(eventsTable).get(E3))?.deletedAt).toBe('2026-11-04T01:00:00.000Z');
    const restored = await as(actors.ptdnLead).table(eventsTable).update(E3, { deletedAt: null }, { expectedVersion: deleted.version });
    expect(restored.deletedAt).toBeNull();
    expect((await as(actors.xtdt).table(guestsTable).list()).map((g) => g.name)).toEqual(['A']);
  });

  it('only holders of progress.delete in scope see it; its children stay hidden from all but admin', async () => {
    const { as, actors } = await deleteE3();
    const sees = async (a: typeof actors.admin) => (await as(a).table(eventsTable).list()).some((e) => e.id === E3);
    expect(await sees(actors.leader)).toBe(true);
    expect((await as(actors.admin).table(eventsTable).list()).map((e) => e.id)).toEqual([E1, E2, E3]);
    expect(await sees(actors.xtdtLead)).toBe(false);
    expect(await sees(actors.ptdn)).toBe(false);
    expect(await as(actors.ptdnLead).table(guestsTable).list()).toEqual([]);
    expect(await as(actors.xtdt).table(guestsTable).list()).toEqual([]);
    expect((await as(actors.admin).table(guestsTable).list()).map((g) => g.name)).toEqual(['A']);
  });

  it('hard purge stays admin only', async () => {
    const { as, actors, deleted } = await deleteE3();
    await rejectsWith(as(actors.ptdnLead).table(eventsTable).remove(E3, { expectedVersion: deleted.version }), 'forbidden');
    await rejectsWith(as(actors.leader).table(eventsTable).remove(E3, { expectedVersion: deleted.version }), 'forbidden');
    await as(actors.admin).table(eventsTable).remove(E3, { expectedVersion: deleted.version });
    expect(await as(actors.admin).table(eventsTable).get(E3)).toBeNull();
  });

  it('a user cannot soft-delete', async () => {
    const { as, xtdt } = setup();
    const e1 = (await as(xtdt).table(eventsTable).get(E1))!;
    await rejectsWith(as(xtdt).table(eventsTable).update(E1, { deletedAt: '2026-11-04T01:00:00.000Z' }, { expectedVersion: e1.version }), 'forbidden');
  });
});

describe('memoryDb rows, defaults and managed columns', () => {
  it('fills SQL defaults and stamps managed columns', async () => {
    const { as, xtdt, seed } = setup();
    const g = await as(xtdt).table(guestsTable).insert({ id: G(1), eventId: E1, name: 'A', group: 'VIP', organization: '', rsvpStatus: 'pending', checkinCode: 'K7M2PQ' });
    expect(g).toMatchObject({ version: 1, createdBy: xtdt.profile.id, updatedBy: xtdt.profile.id, group: 'VIP' });
    const raw = inspectMemoryDb(seed, 'sce_tcsk_guests')[0]!;
    expect(raw).toMatchObject({ guest_group: 'VIP', send_method: 'direct', has_banquet: false, invite_status: 'pending' });
  });

  it('generates the printed check-in code when the draft has none', async () => {
    const { as, xtdt } = setup();
    const g = await as(xtdt).table(guestsTable).insert({ ...draft(E1, G(1), 'A'), checkinCode: undefined as unknown as string });
    expect(g.checkinCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('reports a missing NOT NULL column as a constraint', async () => {
    const { as, xtdt } = setup();
    const err = await rejectsWith(as(xtdt).table(checkinsTable).insert({ eventId: E1, guestId: undefined as unknown as GuestId, desk: null, checkedInAt: null }), 'constraint');
    expect(err.detail?.constraint).toBe('sce_tcsk_checkins_guest_id_not_null');
  });

  it('enforces unique keys with Postgres constraint names', async () => {
    const { as, xtdt } = setup();
    const t = as(xtdt).table(guestsTable);
    await t.insert({ ...draft(E1, G(1), 'A'), checkinCode: 'SAME01' });
    const err = await rejectsWith(t.insert({ ...draft(E1, G(2), 'B'), checkinCode: 'SAME01' }), 'constraint');
    expect(err.detail?.constraint).toBe('sce_tcsk_guests_event_id_checkin_code_key');
  });
});

describe('memoryDb insertMany', () => {
  it('inserts thousands of rows in linear time', async () => {
    const { as, xtdt } = setup();
    const t = as(xtdt).table(guestsTable);
    const drafts = Array.from({ length: 6000 }, (_, i) => draft(E1, G(i + 1), `K${i}`));
    const started = performance.now();
    const rows = await t.insertMany(drafts);
    expect(rows).toHaveLength(6000);
    // One scan per row took 4.6 s for these 6000 rows; one pass takes about 0.15 s.
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it('returns a row already stored instead of a second copy, and checks unique keys within the batch', async () => {
    const { as, xtdt } = setup();
    const t = as(xtdt).table(guestsTable);
    await t.insert(draft(E1, G(1), 'A'));
    expect((await t.insertMany([draft(E1, G(1), 'A'), draft(E1, G(2), 'B')])).map((g) => g.name)).toEqual(['A', 'B']);
    const err = await rejectsWith(t.insertMany([{ ...draft(E1, G(3), 'C'), checkinCode: 'TWICE1' }, { ...draft(E1, G(4), 'D'), checkinCode: 'TWICE1' }]), 'constraint');
    expect(err.detail?.constraint).toBe('sce_tcsk_guests_event_id_checkin_code_key');
  });
});

describe('memoryDb foreign keys (the ON DELETE of the migrations)', () => {
  const M = 'cccccccc-0000-4000-8000-000000000001';

  it('cascades a deleted guest to its check-in, past RLS, as Postgres does', async () => {
    const { as, xtdt, seed } = setup();
    await as(xtdt).table(guestsTable).insertMany([draft(E1, G(1), 'A'), draft(E1, G(2), 'B')]);
    await as(xtdt).table(checkinsTable).insertMany([{ eventId: E1, guestId: G(1), desk: 'D1', checkedInAt: null }, { eventId: E1, guestId: G(2), desk: 'D1', checkedInAt: null }]);
    await as(xtdt).table(guestsTable).remove(G(1));
    expect(inspectMemoryDb(seed, 'sce_tcsk_checkins').map((c) => c.guest_id)).toEqual([G(2)]);
  });

  it('cascades a purged event through its guests to their check-ins', async () => {
    const { as, xtdt, admin, seed } = setup();
    await as(xtdt).table(guestsTable).insert(draft(E1, G(1), 'A'));
    await as(xtdt).table(checkinsTable).insert({ eventId: E1, guestId: G(1), desk: null, checkedInAt: null });
    expect(await as(admin).table(eventsTable).removeWhere({ id: E1 })).toBe(1);
    expect([inspectMemoryDb(seed, 'sce_tcsk_guests'), inspectMemoryDb(seed, 'sce_tcsk_checkins')]).toEqual([[], []]);
  });

  it('sets a guest’s master contact to null when the contact goes', async () => {
    const seed = {
      sce_tcsk_events: eventRows(),
      sce_tcsk_master_contacts: [{ id: M, name: 'C', guest_group: 'VIP', organization: '', version: 1 }],
      sce_tcsk_guests: [{ id: G(1), event_id: E1, name: 'A', master_contact_id: M, version: 1 }],
    };
    await memoryDb(seed, testActor('admin', null)).table(contactsTable).remove(M);
    expect(inspectMemoryDb(seed, 'sce_tcsk_guests')[0]).toMatchObject({ id: G(1), master_contact_id: null });
  });
});

describe('memoryDb views (sce_tcsk_guest_roster of 0002)', () => {
  interface RosterRow extends TestGuest { seatCode: string | null; checkedInAt: string | null }
  const rosterView = defineTable<RosterRow>({
    name: 'sce_tcsk_guest_roster',
    owner: 'guests',
    eventScoped: true,
    columns: { group: 'guest_group' },
    orderBy: [{ column: 'name', ascending: true }],
    row: z.object({
      id: z.string(), eventId: z.string(), name: z.string(), group: z.string(), organization: z.string(), rsvpStatus: z.string(), checkinCode: z.string(),
      version: z.number(), createdAt: z.string(), createdBy: z.string().nullable(), updatedAt: z.string(), updatedBy: z.string().nullable(),
      seatCode: z.string().nullable(), checkedInAt: z.string().nullable(),
    }).transform((r) => r as unknown as RosterRow),
  });
  const seat = { id: 'dddddddd-0000-4000-8000-000000000001', event_id: E1, guest_id: G(1), seat_code: 'A-01', version: 1 };

  it('left joins seats and check-ins onto guests, each under its own RLS, and filters on the joined columns', async () => {
    const seed = { sce_tcsk_events: eventRows(), sce_tcsk_seat_assignments: [seat] };
    const [xtdt, ptdn] = [testActor('user', XTDT), testActor('user', PTDN)];
    await memoryDb(seed, xtdt).table(guestsTable).insertMany([draft(E1, G(1), 'A'), draft(E1, G(2), 'B')]);
    await memoryDb(seed, xtdt).table(checkinsTable).insert({ eventId: E1, guestId: G(2), desk: null, checkedInAt: '2026-12-15T01:00:00.000Z' as Instant });
    const roster = memoryDb(seed, xtdt).table(rosterView);
    expect((await roster.list({ eventId: E1 })).map((r) => [r.name, r.seatCode, r.checkedInAt])).toEqual([['A', 'A-01', null], ['B', null, '2026-12-15T01:00:00.000Z']]);
    expect((await roster.list({ checkedInAt: null })).map((r) => r.name)).toEqual(['A']);
    expect((await roster.get(G(2)))?.checkedInAt).toBe('2026-12-15T01:00:00.000Z');
    expect(await memoryDb(seed, ptdn).table(rosterView).list({ eventId: E1 })).toEqual([]);
  });

  it('refuses writes, as Postgres refuses them on a join view', async () => {
    const { as, xtdt } = setup();
    await expect(as(xtdt).table(rosterView).insert({ ...draft(E1, G(1), 'A'), seatCode: null, checkedInAt: null })).rejects.toThrow(/is a view/);
  });
});

describe('declareGuard (a CHECK, restrictive policy or trigger rule memoryDb cannot read from the SQL)', () => {
  const nameCheck: MemoryGuard = ({ op, row }) => {
    if (op !== 'delete' && String(row.name).trim() === '') throw new DbError('constraint', { table: 'sce_tcsk_guests', constraint: 'sce_tcsk_guests_name_check' });
  };

  it('refuses an insert, a batch, an update and a delete the guard refuses, and nothing is stored', async () => {
    const { as, xtdt, seed } = setup();
    declareGuard(seed, 'sce_tcsk_guests', nameCheck);
    declareGuard(seed, 'sce_tcsk_guests', ({ op, before }) => {
      if (op === 'delete' && before?.name === 'Khóa') throw new DbError('forbidden', { table: 'sce_tcsk_guests' });
    });
    const t = as(xtdt).table(guestsTable);
    expect((await rejectsWith(t.insert(draft(E1, G(1), ' ')), 'constraint')).detail?.constraint).toBe('sce_tcsk_guests_name_check');
    await rejectsWith(t.insertMany([draft(E1, G(2), 'B'), draft(E1, G(3), '')]), 'constraint');
    const kept = await t.insert(draft(E1, G(4), 'Khóa'));
    await rejectsWith(t.update(G(4), { name: '' }, { expectedVersion: kept.version }), 'constraint');
    await rejectsWith(t.remove(G(4)), 'forbidden');
    expect(inspectMemoryDb(seed, 'sce_tcsk_guests').map((g) => g.name)).toEqual(['Khóa']);
  });

  it('applies only to the seed it was declared on', async () => {
    const guarded = setup();
    declareGuard(guarded.seed, 'sce_tcsk_guests', nameCheck);
    const other = setup();
    expect((await other.as(other.xtdt).table(guestsTable).insert(draft(E1, G(1), ''))).name).toBe('');
  });
});

describe('memoryDb created_at', () => {
  it('orders rows inserted in the same millisecond by insertion, and gives one batch one timestamp', async () => {
    const { as, xtdt, seed } = setup();
    const t = as(xtdt).table(guestsTable);
    for (const n of [1, 2, 3]) await t.insert(draft(E1, G(n), `K${n}`));
    await t.insertMany([draft(E1, G(4), 'K4'), draft(E1, G(5), 'K5')]);
    const at = inspectMemoryDb(seed, 'sce_tcsk_guests').map((g) => String(g.created_at));
    expect(new Set(at.slice(0, 4)).size).toBe(4);
    expect([...at.slice(0, 4)].sort()).toEqual(at.slice(0, 4));
    expect(at[4]).toBe(at[3]);
  });
});

describe('memoryDb optimistic concurrency and idempotency', () => {
  it('bumps the version and refuses a stale expectedVersion', async () => {
    const { as, xtdt } = setup();
    const t = as(xtdt).table(guestsTable);
    const g = await t.insert(draft(E1, G(1), 'A'));
    const v2 = await t.update(g.id, { name: 'A2' }, { expectedVersion: g.version });
    expect(v2.version).toBe(2);
    await rejectsWith(t.update(g.id, { name: 'stale' }, { expectedVersion: g.version }), 'conflict');
    expect((await t.update(g.id, { name: 'force' }, { overwrite: 'idempotent-set' })).version).toBe(3);
  });

  it('hides other departments’ rows as not_found, never forbidden', async () => {
    const { as, xtdt, ptdn } = setup();
    const g = await as(ptdn).table(guestsTable).insert(draft(E2, G(1), 'A'));
    await rejectsWith(as(xtdt).table(guestsTable).update(g.id, { name: 'x' }, { expectedVersion: g.version }), 'not_found');
  });

  it('keeps event_id immutable', async () => {
    const { as, admin } = setup();
    const g = await as(admin).table(guestsTable).insert(draft(E1, G(1), 'A'));
    await rejectsWith(as(admin).table(guestsTable).update(g.id, { eventId: E2 }, { expectedVersion: g.version }), 'constraint');
  });

  it('re-inserting the same id and payload is a no-op; a different payload conflicts', async () => {
    const { as, xtdt, seed } = setup();
    const t = as(xtdt).table(guestsTable);
    const first = await t.insert(draft(E1, G(1), 'A'));
    expect(await t.insert(draft(E1, G(1), 'A'))).toEqual(first);
    expect(inspectMemoryDb(seed, 'sce_tcsk_guests')).toHaveLength(1);
    await rejectsWith(t.insert(draft(E1, G(1), 'other')), 'conflict');
  });

  it('upsertOn converges on the declared key and keeps the row id', async () => {
    const { as, xtdt } = setup();
    await as(xtdt).table(guestsTable).insert(draft(E1, G(1), 'A'));
    const t = as(xtdt).table(checkinsTable);
    const a = await t.upsertOn(['eventId', 'guestId'], { eventId: E1, guestId: G(1), desk: 'Bàn 1', checkedInAt: null });
    const b = await t.upsertOn(['eventId', 'guestId'], { id: 'ffffffff-0000-4000-8000-000000000000', eventId: E1, guestId: G(1), desk: 'Bàn 2', checkedInAt: null });
    expect(b.id).toBe(a.id);
    expect(b).toMatchObject({ desk: 'Bàn 2', version: 2 });
    expect(await t.list()).toHaveLength(1);
  });

  it('remove: stale version conflicts, a missing row without a guard is a no-op', async () => {
    const { as, xtdt } = setup();
    const t = as(xtdt).table(guestsTable);
    const g = await t.insert(draft(E1, G(1), 'A'));
    await t.update(g.id, { name: 'A2' }, { expectedVersion: g.version });
    await rejectsWith(t.remove(g.id, { expectedVersion: g.version }), 'conflict');
    await t.remove(g.id, { expectedVersion: 2 as Version });
    await t.remove(g.id);
    await rejectsWith(t.remove(g.id, { expectedVersion: 2 as Version }), 'not_found');
  });

  it('removeWhere deletes only visible, writable rows and needs a condition', async () => {
    const { as, xtdt, admin } = setup();
    await as(admin).table(guestsTable).insertMany([draft(E1, G(1), 'A'), draft(E1, G(2), 'B'), draft(E2, G(3), 'C')]);
    expect(await as(xtdt).table(guestsTable).removeWhere({ group: 'VIP' })).toBe(2);
    expect(await as(admin).table(guestsTable).list()).toHaveLength(1);
    await expect(as(xtdt).table(guestsTable).removeWhere({})).rejects.toThrow('needs at least one condition');
  });

  it('lists with filters, IN lists, limit and the default order', async () => {
    const { as, admin } = setup();
    await as(admin).table(guestsTable).insertMany([draft(E1, G(1), 'C'), draft(E1, G(2), 'A'), draft(E3, G(3), 'B')]);
    const t = as(admin).table(guestsTable);
    expect((await t.list({ eventId: E1 })).map((g) => g.name)).toEqual(['A', 'C']);
    expect((await t.list({ id: [G(1), G(3)] })).map((g) => g.name)).toEqual(['B', 'C']);
    expect((await t.list(undefined, { limit: 2 })).map((g) => g.name)).toEqual(['A', 'B']);
  });
});

describe('memoryAuditWriter (sce_tcsk_audit_command, 202611041320_core_audit_writer.sql)', () => {
  const row: CommandAuditRow = { command: 'guests.update', perm: 'guests.write', action: 'CẬP NHẬT KHÁCH MỜI', summary: 's', eventId: E1, entity: 'guest', entityId: '1' };
  const writerOf = (seed: Parameters<typeof memoryDb>[0]) => memoryAuditWriter(memoryDb(seed, testActor('user', PTDN)))!;
  const coreAction = 'PHÂN QUYỀN TÀI KHOẢN';

  it('writes for the actor it is given, not the Db’s, with the action in canonical form', async () => {
    const { seed, xtdt } = setup();
    await writerOf(seed)(xtdt, { ...row, action: '  CẬP  NHẬT\u200b KHÁCH MỜI ' });
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs')).toMatchObject([{ action: 'CẬP NHẬT KHÁCH MỜI', event_id: E1, entity: 'guest', actor_id: xtdt.profile.id, actor_email: xtdt.profile.email }]);
  });

  it('finds the store through a Db that only forwards table(), like the test wrappers', async () => {
    const { seed, xtdt } = setup();
    const inner = memoryDb(seed, xtdt);
    const wrapped: Db = { rpc: inner.rpc.bind(inner), table: (def) => inner.table(def) };
    await memoryAuditWriter(wrapped)!(xtdt, row);
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs')).toHaveLength(1);
  });

  it('is null for a Db that is not a memoryDb', () => {
    expect(memoryAuditWriter(supabaseDb({}, testActor('user', XTDT)))).toBeNull();
  });

  const admin = testActor('admin', null);
  it.each<[string, ReturnType<typeof testActor>, Partial<CommandAuditRow>]>([
    ['a locked account', testActor('user', XTDT, { status: 'locked' }), {}],
    ['another department’s event', testActor('user', 'Phòng Tư vấn doanh nghiệp'), {}],
    ['a core command', admin, { command: 'core.users.setRole', perm: 'core.users.manage', eventId: null }],
    ['a permission of another feature', testActor('user', XTDT), { perm: 'progress.write' }],
    ['a command of another feature', testActor('user', XTDT), { command: 'directory.createContact' }],
    ['an unknown permission', admin, { perm: 'guests.everything' as never }],
    ['a command without a verb', testActor('user', XTDT), { command: 'guests' }],
    ['an event that does not exist, even for an admin', admin, { eventId: 'eeeeeeee-0000-4000-8000-0000000000ff' as typeof E1 }],
    ['an event permission without an event, even for an admin', admin, { eventId: null }],
    ['a global permission on an event', admin, { command: 'templates.create', perm: 'templates.admin' }],
    ['an admin at aal1', testActor('admin', null, { aal: 'aal1' }), { command: 'templates.create', perm: 'templates.admin', eventId: null }],
    ['a user with a verified factor at aal1', testActor('user', XTDT, { aal: 'aal1', hasVerifiedTotp: true }), {}],
    ...[coreAction, coreAction.toLowerCase(), ` ${coreAction.replace(/ /g, '  ')}\t`, coreAction.normalize('NFD'), coreAction.replace(/ /g, '\u00a0'),
      coreAction.replace('QUYỀN', 'QU\u200bYỀN'), coreAction.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)), '\ufeffTẠO BẢN SAO LƯU']
      .map((action): [string, ReturnType<typeof testActor>, Partial<CommandAuditRow>] => [`the core action ${JSON.stringify(action)}`, testActor('user', XTDT), { action }]),
    ...['Profile', ' BACKUP ', 'pro\u200dfile', 'ｓｅｔｔｉｎｇｓ'].map((entity): [string, ReturnType<typeof testActor>, Partial<CommandAuditRow>] => [`the core entity ${JSON.stringify(entity)}`, testActor('user', XTDT), { entity }]),
    ['an empty action', testActor('user', XTDT), { action: ' \u200b ' }],
    ...[coreAction.replace('P', '\u0420'), coreAction.replace('O', '\u041e'), ...['\u2066', '\u2067', '\u2068', '\u2069', '\u034f', '\u3164'].map((c) => coreAction.replace(' ', ` ${c}`)),
      'CẬP NHẬT <b>KHÁCH</b>', 'CẬP NHẬT\u0007KHÁCH']
      .map((action): [string, ReturnType<typeof testActor>, Partial<CommandAuditRow>] => [`the look-alike action ${JSON.stringify(action)}`, testActor('user', XTDT), { action }]),
    ...['pr\u043efile', 'guest<1>', 'khách'].map((entity): [string, ReturnType<typeof testActor>, Partial<CommandAuditRow>] => [`the entity ${JSON.stringify(entity)}`, testActor('user', XTDT), { entity }]),
    ['an assurance level that is not one, for a user without a factor', testActor('user', XTDT, { aal: 'aal3' as never }), {}],
    ['a null assurance level, for a user without a factor', { ...testActor('user', XTDT), aal: null as never }, {}],
    ['a null command under a core permission', admin, { command: null as never, perm: 'core.users.manage', eventId: null, entity: 'user' }],
    ['a null command under its own permission', testActor('user', XTDT), { command: null as never }],
    ['a null permission', testActor('user', XTDT), { perm: null as never }],
    ['a null action', testActor('user', XTDT), { action: null as never }],
  ])('refuses %s and writes nothing', async (_label, actor, patch) => {
    const { seed } = setup();
    await rejectsWith(writerOf(seed)(actor, { ...row, ...patch }), 'forbidden');
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs')).toEqual([]);
  });

  it('takes an admin at aal2, a factor at aal2 and the one cross-feature permission on the allowlist', async () => {
    const { seed } = setup();
    const write = writerOf(seed);
    await write(admin, { ...row, command: 'templates.create', perm: 'templates.admin', eventId: null, entity: 'template' });
    await write(testActor('user', XTDT, { aal: 'aal2', hasVerifiedTotp: true }), row);
    await write(testActor('user', XTDT), { ...row, command: 'directory.importToEvent' });
    await write(testActor('user', XTDT), { ...row, action: 'XÓA/KHÔI PHỤC KHÁCH (LẦN 2): "VIP", 50% - ỔN?', entity: 'master_contact' });
    // An 'all' grant covers every department's event (design.md, RBAC matrix).
    await write(testActor('leader', 'Ban Giám đốc'), row);
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs')).toHaveLength(5);
  });
});

describe('memoryDb rpc', () => {
  const profiles = (adminId: string, userId: string) => [
    { id: adminId, email: 'admin@sce.vn', fullname: 'Admin', role: 'admin', department: null, status: 'active' },
    { id: userId, email: 'u@sce.vn', fullname: 'U', role: 'user', department: XTDT, status: 'pending' },
  ];

  it('profile functions re-check core.users.manage and keep the last admin', async () => {
    const admin = testActor('admin', null);
    const user = testActor('user', XTDT);
    const seed = { sce_tcsk_profiles: profiles(admin.profile.id, user.profile.id) };
    await rejectsWith(memoryDb(seed, user).rpc('sce_tcsk_set_profile_role', { id: user.profile.id, role: 'admin' }), 'forbidden');
    const err = await rejectsWith(memoryDb(seed, admin).rpc('sce_tcsk_set_profile_role', { id: admin.profile.id, role: 'user' }), 'constraint');
    expect(err.detail?.constraint).toBe('last_admin');
    expect(inspectMemoryDb(seed, 'sce_tcsk_profiles')[0]).toMatchObject({ role: 'admin' });
    expect(await memoryDb(seed, admin).rpc('sce_tcsk_set_profile_status', { ids: [user.profile.id as UserId], status: 'active' })).toBe(1);
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs')).toMatchObject([{ action: 'DUYỆT/MỞ KHÓA TÀI KHOẢN', summary: 'Duyệt U <u@sce.vn>' }]);
  });

  it('backup and restore round-trip domain tables', async () => {
    const { seed, admin, xtdt } = setup();
    const db = memoryDb(seed, admin);
    await db.table(guestsTable).insert(draft(E1, G(1), 'A'));
    const { id } = await db.rpc('sce_tcsk_create_backup', { note: 'trước', kind: 'manual' });
    await db.table(guestsTable).remove(G(1));
    await rejectsWith(memoryDb(seed, xtdt).rpc('sce_tcsk_restore_backup', { id }), 'forbidden');
    await db.rpc('sce_tcsk_restore_backup', { id });
    expect((await db.table(guestsTable).list()).map((g) => g.name)).toEqual(['A']);
  });
});
