import { describe, expect, it } from 'vitest';
import type { GuestId, UserId, Version } from '@/core/brand';
import { DbError, memoryDb } from '@/core/db';
import { inspectMemoryDb } from '@/core/db/memory';
import { PTDN, testActor, XTDT } from '@/core/testing/actors';
import { checkinsTable, contactsTable, E1, E2, E3, eventRows, eventsTable, guestsTable } from '@/core/testing/tables';

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

describe('memoryDb rpc', () => {
  const profiles = (adminId: string, userId: string) => [
    { id: adminId, email: 'admin@sce.vn', fullname: 'Admin', role: 'admin', department: null, status: 'active' },
    { id: userId, email: 'u@sce.vn', fullname: 'U', role: 'user', department: XTDT, status: 'pending' },
  ];

  it('writes audit rows for active actors only', async () => {
    const { seed, xtdt } = setup();
    await memoryDb(seed, xtdt).rpc('sce_tcsk_write_audit', { action: 'X', summary: 's', eventId: E1, entity: 'guest', entityId: '1' });
    await rejectsWith(memoryDb(seed, testActor('user', XTDT, { status: 'locked' })).rpc('sce_tcsk_write_audit', { action: 'Y', summary: '', eventId: null, entity: null, entityId: null }), 'forbidden');
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs')).toMatchObject([{ action: 'X', event_id: E1, actor_id: xtdt.profile.id }]);
  });

  it('profile functions re-check core.users.manage and keep the last admin', async () => {
    const admin = testActor('admin', null);
    const user = testActor('user', XTDT);
    const seed = { sce_tcsk_profiles: profiles(admin.profile.id, user.profile.id) };
    await rejectsWith(memoryDb(seed, user).rpc('sce_tcsk_set_profile_role', { id: user.profile.id, role: 'admin' }), 'forbidden');
    const err = await rejectsWith(memoryDb(seed, admin).rpc('sce_tcsk_set_profile_role', { id: admin.profile.id, role: 'user' }), 'constraint');
    expect(err.detail?.constraint).toBe('last_admin');
    expect(inspectMemoryDb(seed, 'sce_tcsk_profiles')[0]).toMatchObject({ role: 'admin' });
    expect(await memoryDb(seed, admin).rpc('sce_tcsk_set_profile_status', { ids: [user.profile.id as UserId], status: 'active' })).toBe(1);
    expect(inspectMemoryDb(seed, 'sce_tcsk_audit_logs').map((a) => a.action)).toEqual(['DUYỆT/MỞ KHÓA TÀI KHOẢN']);
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
