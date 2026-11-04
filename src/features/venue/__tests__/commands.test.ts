import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, type IsoDate, type SeatCode, type Version } from '@/core/brand';
import type { CommandId, InputOf } from '@/core/commands';
import type { Db, Table } from '@/core/db';
import { PTDN, testActor, XTDT } from '@/core/testing/actors';
import type { HallZone } from '../contract';
import { commands } from '../server/commands';
import { defaultHallId } from '../server/default-hall-ids';
import { ROSTER_NOT_READY } from '../server/upstream';
import { rosterReady } from './guest-fixture';
import { harness } from './harness';

vi.mock('@/features/guests/server', async () => await import('./guest-fixture'));

const admin = testActor('admin', null);
const xtdtUser = testActor('user', XTDT);
const ptdnUser = testActor('user', PTDN);
const ubnd = defaultHallId('hall_ubnd_tang3');
const ncc = defaultHallId('hall_ncc');
const seat = (c: string) => c as SeatCode;

afterEach(() => rosterReady(true));

/** A Db that runs `hook` once, right after the `nth` call of `op` on `table`: a second writer acting in the middle of a command. */
function interleave(table: string, op: 'list' | 'removeWhere' | 'update', hook: () => Promise<unknown>, nth = 1) {
  return (db: Db): Db => {
    let calls = 0;
    return {
      ...db,
      table: (def) => {
        const t = db.table(def);
        if (def.name !== table) return t;
        const write = t[op] as (...args: unknown[]) => Promise<unknown>;
        return {
          ...t,
          [op]: async (...args: unknown[]) => {
            const out = await write(...args);
            if (++calls === nth) await hook();
            return out;
          },
        } as typeof t as Table<never> as never;
      },
    };
  };
}

async function setup() {
  const h = harness();
  await h.ok(admin, 'venue.restoreDefaultHallTemplates', {});
  const eventId = await h.createEvent();
  await h.ok(xtdtUser, 'venue.setEventHall', { eventId, version: null, templateId: ubnd, seats: 'remap' });
  const g = {
    vip1: await h.addGuest(eventId, 'Nguyễn Văn VIP', 'VIP'),
    vip2: await h.addGuest(eventId, 'Trần Thị VIP', 'VIP', 'substituted'),
    so1: await h.addGuest(eventId, 'Lê Sở Ngành', 'SoNganh'),
    dn1: await h.addGuest(eventId, 'Phạm Doanh Nghiệp', 'DoanhNghiep'),
    declined: await h.addGuest(eventId, 'Vũ Báo Vắng', 'DoanhNghiep', 'declined'),
    pending: await h.addGuest(eventId, 'Đỗ Chờ Trả Lời', 'BaoChi', 'pending'),
  };
  return { h, eventId, g };
}

describe('venue.assignSeat (asked by live)', () => {
  it('seats a guest, is a no-op the second time, and its undo frees the seat', async () => {
    const { h, eventId, g } = await setup();
    const r = await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-03') });
    expect(r.value).toEqual({ eventId, seatCode: 'A-03', guestId: g.vip1 });
    expect(h.audits().at(-1)).toMatchObject({ action: 'XẾP CHỖ NGỒI', summary: 'Xếp chỗ: ghế A-03: Nguyễn Văn VIP', event_id: eventId });
    const again = await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-03') });
    expect(again.inverse).toBeUndefined();
    expect(h.rows('sce_tcsk_seat_assignments')).toHaveLength(1);
    expect((await h.undo(xtdtUser, r.inverse)).ok).toBe(true);
    expect(await h.seats(eventId)).toEqual({});
  });

  it("moves a seated guest instead of giving them a second seat, and never evicts another guest (m4b BUG-06, BUG-09)", async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-05') });
    expect(await h.seats(eventId)).toEqual({ 'A-05': g.vip1 });
    const taken = await h.run(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('A-05') });
    expect(taken).toMatchObject({ ok: false, kind: 'conflict', message: 'Ghế A-05 đã có Nguyễn Văn VIP ngồi.' });
    expect(await h.seats(eventId)).toEqual({ 'A-05': g.vip1 });
  });

  it("'auto' takes the first free seat outside the VIP zone (decision 10) and keeps a seated guest's seat (m5 BUG-19)", async () => {
    const { h, eventId, g } = await setup();
    expect((await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: 'auto' })).value?.seatCode).toBe('B-01');
    await h.ok(xtdtUser, 'venue.releaseGuestSeat', { eventId, guestId: g.vip1 });
    expect((await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: 'auto' })).value?.seatCode).toBe('B-01');
    expect((await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.dn1, seatCode: 'auto' })).value?.seatCode).toBe('B-02');
    expect((await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: 'auto' })).value?.seatCode).toBe('B-01');
    expect(h.rows('sce_tcsk_seat_assignments')).toHaveLength(2);
  });

  it.each([['after the pick', 1], ['after the check', 2]])("two desks seating walk-ins with 'auto' at once both get a seat when the rival acts %s (review finding 4)", async (_, nth) => {
    const { h, eventId, g } = await setup();
    const rival = () => h.ok(admin, 'venue.assignSeat', { eventId, guestId: g.dn1, seatCode: seat('B-01') });
    const r = await h.runWith(xtdtUser, interleave('sce_tcsk_seat_assignments', 'list', rival, nth), 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: 'auto' });
    expect(r).toMatchObject({ ok: true, value: { seatCode: 'B-02' } });
    expect(await h.seats(eventId)).toEqual({ 'B-01': g.dn1, 'B-02': g.so1 });
  });

  it('refuses a declined guest, a seat the hall does not have, and a guest of another event', async () => {
    const { h, eventId, g } = await setup();
    expect(await h.run(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.declined, seatCode: seat('C-01') })).toMatchObject({ ok: false, kind: 'invalid', message: 'Vũ Báo Vắng đã báo vắng, không xếp chỗ.' });
    expect(await h.run(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('D-01') })).toMatchObject({ ok: false, kind: 'invalid' });
    const other = await h.createEvent();
    const stranger = await h.addGuest(other, 'Khách sự kiện khác', 'VIP');
    expect(await h.run(xtdtUser, 'venue.assignSeat', { eventId, guestId: stranger, seatCode: seat('A-01') })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(h.rows('sce_tcsk_seat_assignments')).toHaveLength(0);
  });

  it('says the guest list is not ready, and writes nothing, until guests lands', async () => {
    const { h, eventId, g } = await setup();
    rosterReady(false);
    expect(await h.run(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: 'auto' })).toMatchObject({ ok: false, kind: 'conflict', message: ROSTER_NOT_READY });
    expect(await h.run(xtdtUser, 'venue.autoAssign', { eventId, mode: 'fill-empty', seed: 1 })).toMatchObject({ ok: false, message: ROSTER_NOT_READY });
    expect(await h.run(xtdtUser, 'venue.applySeats', { eventId, changes: [{ seatCode: seat('A-01'), from: g.vip2, to: g.vip1 }] })).toMatchObject({ ok: false, message: ROSTER_NOT_READY });
    expect(h.rows('sce_tcsk_seat_assignments')).toHaveLength(0);
  });
});

describe('venue.applySeats (seat dialog, swap, every undo)', () => {
  it('swaps two guests in one command, and the undo swaps them back', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('B-02') });
    const r = await h.ok(xtdtUser, 'venue.applySeats', { eventId, changes: [{ seatCode: seat('A-01'), from: g.vip1, to: g.so1 }, { seatCode: seat('B-02'), from: g.so1, to: g.vip1 }] });
    expect(await h.seats(eventId)).toEqual({ 'A-01': g.so1, 'B-02': g.vip1 });
    await h.undo(xtdtUser, r.inverse);
    expect(await h.seats(eventId)).toEqual({ 'A-01': g.vip1, 'B-02': g.so1 });
  });

  it('refuses a change made against a seat someone else edited meanwhile (m4b BUG-17)', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    const stale = await h.run(xtdtUser, 'venue.applySeats', { eventId, changes: [{ seatCode: seat('A-01'), from: null, to: g.vip2 }] });
    expect(stale).toMatchObject({ ok: false, kind: 'conflict' });
    const hidden = await h.run(xtdtUser, 'venue.applySeats', { eventId, changes: [{ seatCode: seat('A-02'), from: null, to: g.vip1 }] });
    expect(hidden).toMatchObject({ ok: false, kind: 'conflict', message: 'Nguyễn Văn VIP đang ngồi ghế A-01. Đang tải lại…' });
    expect(await h.seats(eventId)).toEqual({ 'A-01': g.vip1 });
  });

  it('cannot give one guest two seats or one seat two guests (unique by construction)', async () => {
    const { h, eventId, g } = await setup();
    expect(await h.run(xtdtUser, 'venue.applySeats', { eventId, changes: [{ seatCode: seat('A-01'), from: null, to: g.vip1 }, { seatCode: seat('A-02'), from: null, to: g.vip1 }] })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(xtdtUser, 'venue.applySeats', { eventId, changes: [{ seatCode: seat('A-01'), from: null, to: g.vip1 }, { seatCode: seat('A-01'), from: null, to: g.vip2 }] })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(h.rows('sce_tcsk_seat_assignments')).toHaveLength(0);
  });
});

describe('a seat batch raced by another writer (no transaction, review finding 2)', () => {
  it('a swap raced between its delete and insert rolls back, says who lost a seat, and audits that loss', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('B-02') });
    const rival = () => h.ok(admin, 'venue.assignSeat', { eventId, guestId: g.dn1, seatCode: seat('A-01') });
    const swap = await h.runWith(xtdtUser, interleave('sce_tcsk_seat_assignments', 'removeWhere', rival), 'venue.applySeats', {
      eventId, changes: [{ seatCode: seat('A-01'), from: g.vip1, to: g.so1 }, { seatCode: seat('B-02'), from: g.so1, to: g.vip1 }],
    });
    expect(swap).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('Nguyễn Văn VIP mất ghế A-01') });
    expect(await h.seats(eventId)).toEqual({ 'A-01': g.dn1, 'B-02': g.so1 });
    expect(h.audits().at(-1)).toMatchObject({ action: 'XẾP CHỖ NGỒI', summary: expect.stringContaining('Nguyễn Văn VIP mất ghế A-01') });
  });

  it('a move raced on its target seat puts the guest back and changes nothing else', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    const audited = h.audits().length;
    const rival = () => h.ok(admin, 'venue.assignSeat', { eventId, guestId: g.dn1, seatCode: seat('A-05') });
    const move = await h.runWith(xtdtUser, interleave('sce_tcsk_seat_assignments', 'removeWhere', rival), 'venue.applySeats', {
      eventId, changes: [{ seatCode: seat('A-01'), from: g.vip1, to: null }, { seatCode: seat('A-05'), from: null, to: g.vip1 }],
    });
    expect(move).toMatchObject({ ok: false, kind: 'conflict', message: 'Ghế vừa được người khác thay đổi trong lúc lưu, nên chưa có thay đổi nào. Đang tải lại…' });
    expect(await h.seats(eventId)).toEqual({ 'A-01': g.vip1, 'A-05': g.dn1 });
    expect(h.audits()).toHaveLength(audited + 1);
  });
});

describe('undo of a hall change (venue.restoreEventHall, review findings 1 and 3)', () => {
  it('refuses when a seat it would free now holds someone else, and leaves hall and seats unchanged', async () => {
    const { h, eventId, g } = await setup();
    const xHall = newId<'HallTemplate'>();
    const ubndZones = (await h.hall(eventId))!.zones;
    await h.ok(admin, 'venue.createHallTemplate', { id: xHall, draft: { name: 'Hội trường X', location: '', description: '', zones: ubndZones.map((z, i) => (i === 0 ? { ...z, key: 'X', prefix: 'X-' } : z)) } });
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-03') });
    const change = await h.ok(xtdtUser, 'venue.setEventHall', { eventId, version: (await h.hall(eventId))!.version, templateId: xHall, seats: 'remap' });
    expect(await h.seats(eventId)).toEqual({ 'X-03': g.vip1 });
    await h.ok(admin, 'venue.applySeats', { eventId, changes: [{ seatCode: seat('X-03'), from: g.vip1, to: g.so1 }] });
    const hallBefore = await h.hall(eventId);

    const undo = await h.undo(xtdtUser, change.inverse);
    expect(undo).toMatchObject({ ok: false, kind: 'conflict', message: 'Ghế X-03 vừa được người khác thay đổi. Đang tải lại…' });
    expect(await h.hall(eventId)).toEqual(hallBefore);
    expect(await h.seats(eventId)).toEqual({ 'X-03': g.so1 });
  });

  it('a direct call cannot seat a declined guest, use a seat the hall lacks, give a guest two seats or evict anyone', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    const hall = (await h.hall(eventId))!;
    const restore = (add: Array<{ seatCode: SeatCode; guestId: typeof g.vip1 }>) =>
      h.run(xtdtUser, 'venue.restoreEventHall', { eventId, version: hall.version, hall: { templateId: hall.templateId, zones: hall.zones }, release: [], add });
    expect(await restore([{ seatCode: seat('C-02'), guestId: g.declined }])).toMatchObject({ ok: false, kind: 'invalid', message: 'Vũ Báo Vắng đã báo vắng, không xếp chỗ.' });
    expect(await restore([{ seatCode: seat('Q-99'), guestId: g.so1 }])).toMatchObject({ ok: false, kind: 'invalid', message: 'Ghế Q-99 không có trong sơ đồ hội trường.' });
    expect(await restore([{ seatCode: seat('A-02'), guestId: g.vip1 }])).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await restore([{ seatCode: seat('A-01'), guestId: g.so1 }])).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.seats(eventId)).toEqual({ 'A-01': g.vip1 });
    expect(await h.hall(eventId)).toEqual(hall);
  });

  it('undoing a zone shrink raced on its seat leaves the hall and the seats as they were', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('B-18') });
    const hall = (await h.hall(eventId))!;
    const smaller = hall.zones.map((z): HallZone => (z.key === 'B' ? { ...z, seatCount: 10 } : z));
    const shrink = await h.ok(xtdtUser, 'venue.updateEventZones', { eventId, version: hall.version, zones: smaller, releaseOrphans: true });
    const rival = () => h.ok(admin, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('C-01') });
    const undo = shrink.inverse!;
    const r = await h.runWith(xtdtUser, interleave('sce_tcsk_event_halls', 'update', rival), undo.command, undo.input as never);
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await h.hall(eventId))!.zones.find((z) => z.key === 'B')!.seatCount).toBe(10);
    expect(await h.seats(eventId)).toEqual({ 'C-01': g.so1 });
  });
});

describe('venue.releaseGuestSeat (asked by guests on decline or delete)', () => {
  it('frees the seat, works without the roster, is a no-op without a seat, and undoes', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('B-04') });
    rosterReady(false);
    const r = await h.ok(xtdtUser, 'venue.releaseGuestSeat', { eventId, guestId: g.so1 });
    expect(await h.seats(eventId)).toEqual({});
    expect(h.audits().at(-1)).toMatchObject({ action: 'HỦY XẾP CHỖ', summary: 'Giải phóng ghế B-04' });
    expect((await h.ok(xtdtUser, 'venue.releaseGuestSeat', { eventId, guestId: g.so1 })).inverse).toBeUndefined();
    rosterReady(true);
    await h.undo(xtdtUser, r.inverse);
    expect(await h.seats(eventId)).toEqual({ 'B-04': g.so1 });
  });
});

describe('venue.autoAssign', () => {
  it('fill-empty keeps a hand-placed VIP and the seated walk-in, and seats only attending guests (m4b BUG-03)', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-12') });
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.pending, seatCode: seat('C-24') });
    const r = await h.ok(xtdtUser, 'venue.autoAssign', { eventId, mode: 'fill-empty', seed: 9 });
    const seats = await h.seats(eventId);
    expect(seats['A-12']).toBe(g.vip1);
    expect(seats['C-24']).toBe(g.pending);
    expect(Object.values(seats)).not.toContain(g.declined);
    expect(Object.values(seats).sort()).toEqual([g.vip1, g.vip2, g.so1, g.dn1, g.pending].sort());
    expect(r.value).toMatchObject({ attending: 4, placed: 4, unplaced: 0 });
    expect(r.value.perZone.map((z) => [z.key, z.assigned])).toEqual([['A', 2], ['B', 1], ['C', 2]]);
    expect(h.audits().at(-1)).toMatchObject({ action: 'TỰ ĐỘNG XẾP CHỖ', summary: 'Tự động xếp chỗ (chỉ xếp người chưa có ghế): 4/4 đại biểu có ghế, 3 ghế mới' });
    await h.undo(xtdtUser, r.inverse);
    expect(await h.seats(eventId)).toEqual({ 'A-12': g.vip1, 'C-24': g.pending });
  });

  it('reassign-all clears every seat first, and its undo puts each guest back', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.pending, seatCode: seat('C-24') });
    const r = await h.ok(xtdtUser, 'venue.autoAssign', { eventId, mode: 'reassign-all', seed: 4 });
    expect(Object.values(await h.seats(eventId))).not.toContain(g.pending);
    await h.undo(xtdtUser, r.inverse);
    expect(await h.seats(eventId)).toEqual({ 'C-24': g.pending });
  });

  it('refuses when nobody has confirmed, with the legacy guidance', async () => {
    const h = harness();
    await h.ok(admin, 'venue.restoreDefaultHallTemplates', {});
    const eventId = await h.createEvent();
    await h.ok(xtdtUser, 'venue.setEventHall', { eventId, version: null, templateId: ubnd, seats: 'remap' });
    await h.addGuest(eventId, 'A', 'VIP', 'pending');
    expect(await h.run(xtdtUser, 'venue.autoAssign', { eventId, mode: 'fill-empty' })).toMatchObject({ ok: false, kind: 'invalid', message: expect.stringContaining('Không có đại biểu nào đã xác nhận') });
  });
});

describe('the event hall', () => {
  it('clearSeats empties the hall and undoes', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    const r = await h.ok(xtdtUser, 'venue.clearSeats', { eventId });
    expect(await h.seats(eventId)).toEqual({});
    await h.undo(xtdtUser, r.inverse);
    expect(await h.seats(eventId)).toEqual({ 'A-01': g.vip1 });
  });

  it('a hall change remaps seats by zone position and number, or releases them; undo restores hall and seats (m4b BUG-05)', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-12') });
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.dn1, seatCode: seat('C-24') });
    const before = (await h.hall(eventId))!;
    const r = await h.ok(xtdtUser, 'venue.setEventHall', { eventId, version: before.version, templateId: defaultHallId('hall_sce_tang2'), seats: 'remap' });
    expect(await h.seats(eventId)).toEqual({});
    expect(h.audits().at(-1)).toMatchObject({ summary: 'Chuyển sang hội trường "Hội trường Đa năng Tầng 2 Trung tâm SCE", hủy xếp chỗ 2 đại biểu' });
    await h.undo(xtdtUser, r.inverse);
    expect((await h.hall(eventId))!.templateId).toBe(ubnd);
    expect(await h.seats(eventId)).toEqual({ 'A-12': g.vip1, 'C-24': g.dn1 });

    const now = (await h.hall(eventId))!;
    await h.ok(xtdtUser, 'venue.setEventHall', { eventId, version: now.version, templateId: ncc, seats: 'remap' });
    expect(await h.seats(eventId)).toEqual({ 'A-12': g.vip1, 'C-24': g.dn1 });
    const later = (await h.hall(eventId))!;
    await h.ok(xtdtUser, 'venue.setEventHall', { eventId, version: later.version, templateId: ubnd, seats: 'release' });
    expect(await h.seats(eventId)).toEqual({});
  });

  it('a stale hall version is a conflict', async () => {
    const { h, eventId } = await setup();
    expect(await h.run(xtdtUser, 'venue.setEventHall', { eventId, version: null, templateId: ncc, seats: 'remap' })).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('shrinking a zone below a seated guest needs an explicit release; prefix and zone set are not editable per event', async () => {
    const { h, eventId, g } = await setup();
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.so1, seatCode: seat('B-18') });
    const hall = (await h.hall(eventId))!;
    const smaller = hall.zones.map((z): HallZone => (z.key === 'B' ? { ...z, seatCount: 10, name: 'Khu B mới' } : z));
    expect(await h.run(xtdtUser, 'venue.updateEventZones', { eventId, version: hall.version, zones: smaller, releaseOrphans: false })).toMatchObject({ ok: false, kind: 'conflict', message: expect.stringContaining('B-18') });
    expect(await h.seats(eventId)).toEqual({ 'B-18': g.so1 });
    const r = await h.ok(xtdtUser, 'venue.updateEventZones', { eventId, version: hall.version, zones: smaller, releaseOrphans: true });
    expect(r.value.zones[1]).toMatchObject({ name: 'Khu B mới', seatCount: 10 });
    expect(await h.seats(eventId)).toEqual({});
    await h.undo(xtdtUser, r.inverse);
    expect(await h.seats(eventId)).toEqual({ 'B-18': g.so1 });
    const renamed = hall.zones.map((z, i) => (i === 0 ? { ...z, prefix: 'V-' } : z));
    const latest = (await h.hall(eventId))!;
    expect(await h.run(xtdtUser, 'venue.updateEventZones', { eventId, version: latest.version, zones: renamed, releaseOrphans: true })).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(xtdtUser, 'venue.updateEventZones', { eventId, version: latest.version, zones: [...hall.zones, { ...hall.zones[0]!, key: 'D', prefix: 'D-' }], releaseOrphans: true })).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('releaseOrphans frees the seats an imported or shrunk hall no longer has', async () => {
    const { h, eventId, g } = await setup();
    await h.ctx(admin).db.table((await import('../server/tables')).seatsTable).insert({ id: newId(), eventId, seatCode: seat('Z-01'), guestId: g.dn1 });
    await h.ok(xtdtUser, 'venue.releaseOrphans', { eventId });
    expect(await h.seats(eventId)).toEqual({});
    expect(h.audits().at(-1)).toMatchObject({ summary: 'Giải phóng 1 ghế không còn trong sơ đồ: Z-01' });
  });
});

describe('hall catalog (admin only, m4b BUG-16)', () => {
  const draft = (over: Partial<InputOf<'venue.createHallTemplate'>['draft']> = {}): InputOf<'venue.createHallTemplate'>['draft'] => ({
    name: 'Hội trường Sở Tài chính', location: 'Hà Nội', description: '',
    zones: [{ key: 'A', name: 'Khu A', prefix: 'A-', seatCount: 8, color: 'red', assignedGroup: 'VIP', vipZone: true }],
    ...over,
  });

  it('creates, edits and deletes with undo; an event keeps the zones it copied', async () => {
    const { h, eventId } = await setup();
    const id = newId<'HallTemplate'>();
    const created = await h.ok(admin, 'venue.createHallTemplate', { id, draft: draft() });
    expect(h.audits().at(-1)).toMatchObject({ action: 'QUẢN TRỊ HỘI TRƯỜNG', summary: 'Thêm hội trường mẫu: "Hội trường Sở Tài chính"', event_id: null });
    const edited = await h.ok(admin, 'venue.updateHallTemplate', { id, version: created.value.version, draft: draft({ name: 'Đổi tên' }) });
    await h.undo(admin, edited.inverse);
    expect(h.rows('sce_tcsk_hall_templates').find((t) => t.id === id)).toMatchObject({ name: 'Hội trường Sở Tài chính' });

    const zonesBefore = (await h.hall(eventId))!.zones;
    const ubndRow = h.rows('sce_tcsk_hall_templates').find((t) => t.id === ubnd)!;
    await h.ok(admin, 'venue.updateHallTemplate', { id: ubnd, version: ubndRow.version as Version, draft: { name: 'UBND mới', location: '', description: '', zones: zonesBefore.slice(0, 1) } });
    expect((await h.hall(eventId))!.zones).toEqual(zonesBefore);

    const fresh = h.rows('sce_tcsk_hall_templates').find((t) => t.id === ubnd)!;
    const removed = await h.ok(admin, 'venue.deleteHallTemplate', { id: ubnd, version: fresh.version as Version });
    expect(h.audits().at(-1)).toMatchObject({ summary: 'Xóa hội trường mẫu: "UBND mới" (1 sự kiện giữ nguyên sơ đồ đã sao chép)' });
    expect(await h.hall(eventId)).toMatchObject({ templateId: null, zones: zonesBefore });
    await h.undo(admin, removed.inverse);
    expect(h.rows('sce_tcsk_hall_templates').some((t) => t.id === ubnd)).toBe(true);
  });

  it('refuses duplicate prefixes, a 100000-seat zone and deleting the last template (m4b BUG-04, BUG-13)', async () => {
    const h = harness();
    const zone = draft().zones[0]!;
    const dup = await h.run(admin, 'venue.createHallTemplate', { id: newId<'HallTemplate'>(), draft: draft({ zones: [zone, { ...zone, key: 'B', prefix: 'a-' }] }) });
    expect(dup).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { 'draft.zones.1.prefix': 'Tiền tố bị trùng với khu khác' } });
    expect(await h.run(admin, 'venue.createHallTemplate', { id: newId<'HallTemplate'>(), draft: draft({ zones: [{ ...zone, seatCount: 100000 }] }) })).toMatchObject({ ok: false, kind: 'invalid' });
    const only = newId<'HallTemplate'>();
    const r = await h.ok(admin, 'venue.createHallTemplate', { id: only, draft: draft() });
    expect(await h.run(admin, 'venue.deleteHallTemplate', { id: only, version: r.value.version })).toMatchObject({ ok: false, message: 'Hệ thống cần duy trì ít nhất 1 hội trường mẫu.' });
  });

  it('restoring defaults puts the issued halls back by id and keeps custom ones (m4b BUG-37)', async () => {
    const h = harness();
    const custom = newId<'HallTemplate'>();
    await h.ok(admin, 'venue.createHallTemplate', { id: custom, draft: draft() });
    await h.ok(admin, 'venue.restoreDefaultHallTemplates', {});
    await h.ok(admin, 'venue.restoreDefaultHallTemplates', {});
    const ids = h.rows('sce_tcsk_hall_templates').map((t) => t.id);
    expect(ids.sort()).toEqual([custom, ncc, ubnd, defaultHallId('hall_sce_tang2')].sort());
  });

  it.each([testActor('leader', null), testActor('dept_leader', XTDT), xtdtUser])('refuses %# to edit the catalog, by RLS and by the command itself', async (actor) => {
    const h = harness();
    expect(await h.run(actor, 'venue.createHallTemplate', { id: newId<'HallTemplate'>(), draft: draft() })).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(await h.runWithoutRls(actor, 'venue.restoreDefaultHallTemplates', {})).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(h.rows('sce_tcsk_hall_templates')).toHaveLength(0);
    expect(h.audits()).toHaveLength(0);
  });
});

describe('booths and duty shifts', () => {
  const booth = (over: Partial<InputOf<'venue.createBooth'>['draft']> = {}): InputOf<'venue.createBooth'>['draft'] => ({
    code: 'A01', size: '01 gian tiêu chuẩn (9m²)', company: 'HTX Gốm Bát Tràng', products: 'Gốm sứ', subsidyPercent: 50, status: 'confirmed', contact: '', staff: '', ...over,
  });

  it('creates, edits and deletes a booth with undo, and stores markup as plain text (m4b BUG-07)', async () => {
    const { h, eventId } = await setup();
    const id = newId<'Booth'>();
    const xss = '<img src=x onerror="window.__pwned=1">';
    const created = await h.ok(xtdtUser, 'venue.createBooth', { eventId, id, draft: booth({ company: xss }) });
    expect(created.value.company).toBe(xss);
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT GIAN HÀNG', summary: `Thêm gian hàng A01: ${xss}` });
    const edited = await h.ok(xtdtUser, 'venue.updateBooth', { eventId, id, version: created.value.version, draft: booth({ status: 'available', company: '' }) });
    expect(edited.value).toMatchObject({ status: 'available', company: '' });
    const removed = await h.ok(xtdtUser, 'venue.deleteBooth', { eventId, id, version: edited.value.version });
    expect(h.rows('sce_tcsk_booths')).toHaveLength(0);
    await h.undo(xtdtUser, removed.inverse);
    expect(h.rows('sce_tcsk_booths')).toEqual([expect.objectContaining({ id, code: 'A01', status: 'available' })]);
  });

  it('keeps booth codes unique per event and needs a company unless the booth is empty (m4b BUG-21, BUG-22)', async () => {
    const { h, eventId } = await setup();
    await h.ok(xtdtUser, 'venue.createBooth', { eventId, id: newId<'Booth'>(), draft: booth() });
    expect(await h.run(xtdtUser, 'venue.createBooth', { eventId, id: newId<'Booth'>(), draft: booth({ code: 'a01' }) })).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { 'draft.code': 'Mã gian A01 đã có trong sự kiện này' } });
    expect(await h.run(xtdtUser, 'venue.createBooth', { eventId, id: newId<'Booth'>(), draft: booth({ code: 'A02', company: ' ' }) })).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { 'draft.company': expect.any(String) } });
    expect((await h.run(xtdtUser, 'venue.createBooth', { eventId, id: newId<'Booth'>(), draft: booth({ code: 'A02', company: '', status: 'available' }) })).ok).toBe(true);
    const other = await h.createEvent();
    expect((await h.run(admin, 'venue.createBooth', { eventId: other, id: newId<'Booth'>(), draft: booth() })).ok).toBe(true);
  });

  it('persists duty shifts with undo (m4b BUG-19)', async () => {
    const { h, eventId } = await setup();
    const id = newId<'BoothShift'>();
    const draft = { shiftDate: '2026-12-15' as IsoDate, shiftLabel: '07:30 - 12:00', officerName: 'Lê Thị Mai', department: PTDN, phone: '0912345678', zone: 'Dãy A' };
    const created = await h.ok(xtdtUser, 'venue.createShift', { eventId, id, draft });
    expect(h.audits().at(-1)).toMatchObject({ action: 'PHÂN CÔNG CA TRỰC', summary: 'Thêm ca trực: Lê Thị Mai, 07:30 - 12:00 ngày 15/12/2026' });
    const edited = await h.ok(xtdtUser, 'venue.updateShift', { eventId, id, version: created.value.version, draft: { ...draft, zone: 'Dãy B' } });
    await h.undo(xtdtUser, edited.inverse);
    expect(h.rows('sce_tcsk_booth_shifts')[0]).toMatchObject({ zone: 'Dãy A' });
    const fresh = h.rows('sce_tcsk_booth_shifts')[0]!;
    await h.ok(xtdtUser, 'venue.deleteShift', { eventId, id, version: fresh.version as Version });
    expect(h.rows('sce_tcsk_booth_shifts')).toHaveLength(0);
  });
});

describe('permissions on every event command (design RBAC: venue.seating.*, venue.booths.* by department)', () => {
  const eventVerbs = Object.keys(commands).filter((v) => !/HallTemplate/.test(v));

  async function inputs() {
    const { h, eventId, g } = await setup();
    const booth = (await h.ok(xtdtUser, 'venue.createBooth', { eventId, id: newId<'Booth'>(), draft: { code: 'B01', size: '', company: 'X', products: '', subsidyPercent: 0, status: 'confirmed', contact: '', staff: '' } })).value;
    const shift = (await h.ok(xtdtUser, 'venue.createShift', { eventId, id: newId<'BoothShift'>(), draft: { shiftDate: '2026-12-15' as IsoDate, shiftLabel: 'Sáng', officerName: 'A', department: XTDT, phone: '', zone: '' } })).value;
    await h.ok(xtdtUser, 'venue.assignSeat', { eventId, guestId: g.vip1, seatCode: seat('A-01') });
    const hall = (await h.hall(eventId))!;
    const all: { [K in CommandId as K extends `venue.${infer V}` ? V : never]?: InputOf<K> } = {
      assignSeat: { eventId, guestId: g.so1, seatCode: 'auto' },
      releaseGuestSeat: { eventId, guestId: g.vip1 },
      applySeats: { eventId, changes: [{ seatCode: seat('A-01'), from: g.vip1, to: null }] },
      autoAssign: { eventId, mode: 'fill-empty', seed: 1 },
      clearSeats: { eventId },
      releaseOrphans: { eventId },
      setEventHall: { eventId, version: hall.version, templateId: ncc, seats: 'remap' },
      updateEventZones: { eventId, version: hall.version, zones: hall.zones, releaseOrphans: true },
      restoreEventHall: { eventId, version: hall.version, hall: null, release: [], add: [] },
      createBooth: { eventId, id: newId<'Booth'>(), draft: { ...booth, code: 'B02' } },
      updateBooth: { eventId, id: booth.id, version: booth.version, draft: { ...booth, company: 'Y' } },
      deleteBooth: { eventId, id: booth.id, version: booth.version },
      createShift: { eventId, id: newId<'BoothShift'>(), draft: { ...shift } },
      updateShift: { eventId, id: shift.id, version: shift.version, draft: { ...shift, zone: 'Z' } },
      deleteShift: { eventId, id: shift.id, version: shift.version },
    };
    const snapshot = () => ['sce_tcsk_event_halls', 'sce_tcsk_seat_assignments', 'sce_tcsk_booths', 'sce_tcsk_booth_shifts', 'sce_tcsk_audit_logs'].map((t) => h.rows(t));
    return { h, all, snapshot };
  }

  it('every event command is listed here', () => {
    expect(eventVerbs.sort()).toEqual(['applySeats', 'assignSeat', 'autoAssign', 'clearSeats', 'createBooth', 'createShift', 'deleteBooth', 'deleteShift', 'releaseGuestSeat', 'releaseOrphans', 'restoreEventHall', 'setEventHall', 'updateBooth', 'updateEventZones', 'updateShift'].sort());
  });

  it.each(eventVerbs)('venue.%s refuses another department through row-level security, writing nothing', async (verb) => {
    const { h, all, snapshot } = await inputs();
    const before = snapshot();
    const r = await h.run(ptdnUser, `venue.${verb}` as CommandId, all[verb as keyof typeof all] as never);
    expect(r.ok).toBe(false);
    expect(['forbidden', 'not_found']).toContain(!r.ok && r.kind);
    expect(snapshot()).toEqual(before);
  });

  it.each(eventVerbs)('venue.%s refuses another department on its own, even when row-level security would let it through', async (verb) => {
    const { h, all, snapshot } = await inputs();
    const before = snapshot();
    expect(await h.runWithoutRls(ptdnUser, `venue.${verb}` as CommandId, all[verb as keyof typeof all] as never)).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(snapshot()).toEqual(before);
  });

  it('a supporting department may seat guests and edit booths', async () => {
    const h = harness();
    await h.ok(admin, 'venue.restoreDefaultHallTemplates', {});
    const eventId = await h.createEvent();
    const event = h.rows('sce_tcsk_events').find((e) => e.id === eventId)!;
    await h.ok(admin, 'progress.updateEvent', { id: eventId, version: event.version as Version, patch: { supportingDepartments: [PTDN] } });
    expect((await h.run(ptdnUser, 'venue.setEventHall', { eventId, version: null, templateId: ubnd, seats: 'remap' })).ok).toBe(true);
    expect((await h.run(ptdnUser, 'venue.createBooth', { eventId, id: newId<'Booth'>(), draft: { code: 'C01', size: '', company: 'Z', products: '', subsidyPercent: 100, status: 'reviewing', contact: '', staff: '' } })).ok).toBe(true);
  });
});

