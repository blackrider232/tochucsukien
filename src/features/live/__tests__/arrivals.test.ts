import { describe, expect, it } from 'vitest';
import { newId, type EventId, type GuestId } from '@/core/brand';
import { testActor } from '@/core/testing/actors';
import type { InputOf } from '@/core/commands';
import { admin, desk, harness, interleave } from './harness';

const walk = (eventId: EventId, over: Partial<InputOf<'live.walkIn'>> = {}, guest: Partial<InputOf<'live.walkIn'>['guest']> = {}): InputOf<'live.walkIn'> => ({
  eventId,
  guestId: newId<'Guest'>(),
  guest: { name: 'Hoàng Văn Phát', group: 'DoanhNghiep', title: '', organization: 'Công ty Phát Sinh', phone: '', hasBanquet: false, ...guest },
  zoneKey: null,
  confirmVipZone: false,
  giftGiven: false,
  allowDuplicate: false,
  desk: null,
  ...over,
});

async function setup() {
  const h = harness();
  const eventId = await h.createEvent();
  await h.setHall(eventId);
  return { h, eventId };
}

describe('live.walkIn (decision 10)', () => {
  it('creates the guest through guests, seats it in the zone staff picked, checks it in, and records the gift when ticked', async () => {
    const { h, eventId } = await setup();
    const input = walk(eventId, { zoneKey: 'B', giftGiven: true });
    const r = await h.ok(desk, 'live.walkIn', input);
    expect(r.value).toMatchObject({ guestId: input.guestId, seatCode: 'B-01', seatProblem: null });
    const g = await h.entry(eventId, input.guestId);
    expect(g).toMatchObject({ rsvpStatus: 'confirmed', rsvpSource: 'walk_in', seatCode: 'B-01', substituteName: '' });
    expect(g.checkedInAt).not.toBeNull();
    expect(g.giftGivenAt).not.toBeNull();
    expect(h.audits().map((a) => a.action)).toEqual(expect.arrayContaining(['THÊM KHÁCH MỜI', 'XẾP CHỖ NGỒI', 'CHECK-IN ĐẠI BIỂU', 'PHÁT QUÀ']));
    expect(h.audits().at(-1)).toMatchObject({ action: 'TIẾP NHẬN KHÁCH PHÁT SINH', summary: 'Khách phát sinh: Hoàng Văn Phát (Công ty Phát Sinh), ghế B-01, đã check-in, đã phát quà' });
  });

  it('a walk-in pressed again reuses its own guest id only: not a listed guest with the same details, nor its own id with other details', async () => {
    const { h, eventId } = await setup();
    const listed = await h.addGuest(eventId, { name: 'Hoàng Văn Phát', organization: 'Công ty Phát Sinh' });
    const samePerson = await h.run(desk, 'live.walkIn', walk(eventId, { guestId: listed.id }));
    expect(samePerson).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await h.entry(eventId, listed.id)).checkedInAt).toBeNull();

    const first = walk(eventId, {}, { name: 'Mai Văn Mới', organization: 'Công ty Mới' });
    await h.ok(desk, 'live.walkIn', first);
    const otherDetails = await h.run(desk, 'live.walkIn', { ...first, guest: { ...first.guest, name: 'Người Khác Hẳn' } });
    expect(otherDetails).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await h.entry(eventId, first.guestId)).name).toBe('Mai Văn Mới');
    // The same details with the same id are the retry: nothing new is made.
    expect(await h.run(desk, 'live.walkIn', first)).toMatchObject({ ok: true });
    expect((await h.roster(eventId)).filter((g) => g.name === 'Mai Văn Mới')).toHaveLength(1);
  });

  it('without a seat choice the guest is checked in unseated', async () => {
    const { h, eventId } = await setup();
    const r = await h.ok(desk, 'live.walkIn', walk(eventId));
    expect(r.value.seatCode).toBeNull();
    expect(h.audits().at(-1)!.summary).toContain('không xếp ghế');
  });

  it('a non-VIP guest goes into a VIP zone only with the confirmation', async () => {
    const { h, eventId } = await setup();
    const refused = await h.run(desk, 'live.walkIn', walk(eventId, { zoneKey: 'A' }));
    expect(refused).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.roster(eventId)).toEqual([]);
    const r = await h.ok(desk, 'live.walkIn', walk(eventId, { zoneKey: 'A', confirmVipZone: true }));
    expect(r.value.seatCode).toBe('A-01');
  });

  it('a full zone is refused before anything is written', async () => {
    const { h, eventId } = await setup();
    for (let i = 0; i < 2; i++) await h.ok(desk, 'live.walkIn', walk(eventId, { zoneKey: 'A' }, { group: 'VIP', name: `VIP ${i}`, organization: `Cơ quan ${i}` }));
    const before = { guests: (await h.roster(eventId)).length, audits: h.audits().length };
    const r = await h.run(desk, 'live.walkIn', walk(eventId, { zoneKey: 'A' }, { group: 'VIP' }));
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(r.ok ? '' : r.message).toContain('hết ghế trống');
    expect((await h.roster(eventId)).length).toBe(before.guests);
    expect(h.audits()).toHaveLength(before.audits);
  });

  it('refuses a duplicate of a guest already on the list unless the desk chooses to create anyway (m5 BUG-16)', async () => {
    const { h, eventId } = await setup();
    await h.addGuest(eventId, { name: 'Hoàng Văn Phát', organization: 'Công ty Phát Sinh' });
    expect(await h.run(desk, 'live.walkIn', walk(eventId))).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.run(desk, 'live.walkIn', walk(eventId, { allowDuplicate: true }))).toMatchObject({ ok: true });
  });

  it('pressing "Check-in ngay" again after a success converges on one guest, one seat, one check-in', async () => {
    const { h, eventId } = await setup();
    const input = walk(eventId, { zoneKey: 'C' });
    await h.ok(desk, 'live.walkIn', input);
    const again = await h.ok(desk, 'live.walkIn', input);
    expect(again.value).toMatchObject({ seatCode: 'C-01' });
    expect(await h.roster(eventId)).toHaveLength(1);
    expect(await h.checkins(eventId)).toHaveLength(1);
  });

  it('refuses the id of a guest who is not that walk-in: nobody else is checked in, seated or audited under a false name', async () => {
    const { h, eventId } = await setup();
    const real = await h.addGuest(eventId, { name: 'Lê Thị Thật', organization: 'Sở Thật' });
    const before = h.audits().length;
    const r = await h.run(desk, 'live.walkIn', walk(eventId, { guestId: real.id, zoneKey: 'B' }, { name: 'Người Giả', organization: 'X' }));
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.entry(eventId, real.id)).toMatchObject({ checkedInAt: null, seatCode: null });
    expect(h.audits()).toHaveLength(before);

    const first = await h.ok(desk, 'live.walkIn', walk(eventId, {}, { name: 'Khách Phát Sinh', organization: 'Công ty A' }));
    const other = await h.run(desk, 'live.walkIn', walk(eventId, { guestId: first.value.guestId }, { name: 'Người Khác', organization: 'Công ty B' }));
    expect(other).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('when another desk takes the picked seat first, the next free seat of the zone is used', async () => {
    const { h, eventId } = await setup();
    const rival = await h.addGuest(eventId, { name: 'Khách bàn khác', organization: 'Đơn vị khác' });
    const r = await h.runWith(desk, (db) => interleave(db, 'sce_tcsk_guests', 'insert', () => h.seat(eventId, rival.id, 'C-01')), 'live.walkIn', walk(eventId, { zoneKey: 'C' }));
    expect(r).toMatchObject({ ok: true, value: { seatCode: 'C-02', seatProblem: null } });
  });

  it('when the zone fills meanwhile, the guest is still checked in and the result and the audit say there is no seat', async () => {
    const { h, eventId } = await setup();
    const rivals = await Promise.all([0, 1].map((i) => h.addGuest(eventId, { name: `Khách VIP ${i}`, organization: `Cơ quan ${i}`, group: 'VIP' })));
    const r = await h.runWith(desk, (db) => interleave(db, 'sce_tcsk_guests', 'insert', async () => {
      await h.seat(eventId, rivals[0]!.id, 'A-01');
      await h.seat(eventId, rivals[1]!.id, 'A-02');
    }), 'live.walkIn', walk(eventId, { zoneKey: 'A' }, { group: 'VIP' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seatCode).toBeNull();
    expect(r.value.seatProblem).toContain('Không xếp được ghế ở Khu A: VIP');
    expect((await h.entry(eventId, r.value.guestId)).checkedInAt).not.toBeNull();
    expect(h.audits().at(-1)!.summary).toContain('chưa có ghế: Không xếp được ghế');
  });

  it('undo takes back the check-in, the seat and the guest, each by its owner; an edited guest is kept', async () => {
    const { h, eventId } = await setup();
    const r = await h.ok(desk, 'live.walkIn', walk(eventId, { zoneKey: 'B' }));
    expect((await h.undo(desk, r.inverse)).ok).toBe(true);
    expect(await h.roster(eventId)).toEqual([]);
    expect(h.rows('sce_tcsk_seat_assignments')).toEqual([]);
    expect(await h.checkins(eventId)).toEqual([]);

    const kept = await h.ok(desk, 'live.walkIn', walk(eventId));
    const g = await h.entry(eventId, kept.value.guestId);
    await h.ok(admin, 'guests.update', { eventId, id: g.id, version: g.version, patch: { phone: '0912.000.111' } });
    expect(await h.undo(desk, kept.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.roster(eventId)).toHaveLength(1);
    expect(await h.checkins(eventId)).toHaveLength(1);
  });

  it('undo of a walk-in refuses an invited guest even with its exact version and check-in time (review M18)', async () => {
    const { h, eventId } = await setup();
    const invitedGuest = await h.addGuest(eventId, { name: 'Khách mời thật' });
    const c = await h.ok(desk, 'live.checkIn', { eventId, guestId: invitedGuest.id, desk: null });
    const r = await h.run(desk, 'live.undoWalkIn', { eventId, guestId: invitedGuest.id, checkedInAt: c.value.checkIn.checkedInAt!, guestVersion: invitedGuest.version });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await h.entry(eventId, invitedGuest.id)).toMatchObject({ checkedInAt: c.value.checkIn.checkedInAt });
  });

  it('a walk-in needs the guest and seating permissions too: venue refuses an actor of another department', async () => {
    const { h, eventId } = await setup();
    const r = await h.runWithoutRls(testActor('user', 'Phòng Tư vấn doanh nghiệp'), 'live.walkIn', walk(eventId));
    expect(r).toMatchObject({ ok: false, kind: 'forbidden' });
    expect(await h.roster(eventId)).toEqual([]);
  });
});

describe('live.checkInSubstitute (m5 BUG-15)', () => {
  async function invited() {
    const s = await setup();
    const guest = await s.h.addGuest(s.eventId, { name: 'Đỗ Minh Chủ', organization: 'Sở Kế hoạch', group: 'SoNganh' });
    await s.h.seat(s.eventId, guest.id, 'B-02');
    return { ...s, guest: await s.h.entry(s.eventId, guest.id) };
  }

  it('checks in the invited record with the attendee as its substitute, keeping its seat; no second guest', async () => {
    const { h, eventId, guest } = await invited();
    const r = await h.ok(desk, 'live.checkInSubstitute', { eventId, guestId: guest.id, version: guest.version, substituteName: 'Vũ Hải Đăng - Phó Giám đốc', giftGiven: false, confirmDeclined: false, desk: null });
    expect(r.value.checkIn.checkedInAt).not.toBeNull();
    expect(await h.roster(eventId)).toHaveLength(1);
    expect(await h.entry(eventId, guest.id)).toMatchObject({ rsvpStatus: 'substituted', substituteName: 'Vũ Hải Đăng - Phó Giám đốc', seatCode: 'B-02' });
    expect(h.audits().at(-1)!.summary).toBe('Người đi thay Vũ Hải Đăng - Phó Giám đốc check-in thay cho Đỗ Minh Chủ (Sở Kế hoạch)');
  });

  it('undo takes the check-in back and restores the RSVP as it was', async () => {
    const { h, eventId, guest } = await invited();
    const r = await h.ok(desk, 'live.checkInSubstitute', { eventId, guestId: guest.id, version: guest.version, substituteName: 'Người thay', giftGiven: false, confirmDeclined: false, desk: null });
    expect((await h.undo(desk, r.inverse)).ok).toBe(true);
    expect(await h.entry(eventId, guest.id)).toMatchObject({ rsvpStatus: 'confirmed', substituteName: '', checkedInAt: null, seatCode: 'B-02' });
  });

  it('undo of a substitute is refused once the guest was edited after it (review M19)', async () => {
    const { h, eventId, guest } = await invited();
    const r = await h.ok(desk, 'live.checkInSubstitute', { eventId, guestId: guest.id, version: guest.version, substituteName: 'Người thay', giftGiven: false, confirmDeclined: false, desk: null });
    const now = await h.entry(eventId, guest.id);
    await h.ok(admin, 'guests.update', { eventId, id: guest.id, version: now.version, patch: { title: 'Giám đốc' } });
    expect(await h.undo(desk, r.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.entry(eventId, guest.id)).toMatchObject({ rsvpStatus: 'substituted', title: 'Giám đốc' });
    expect((await h.entry(eventId, guest.id)).checkedInAt).not.toBeNull();
  });

  it('undo of a substitute refuses a plain check-in: no check-in removed, no RSVP rewritten (review LOW-1)', async () => {
    const { h, eventId, guest } = await invited();
    const c = await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    const before = h.audits().length;
    const r = await h.run(desk, 'live.undoSubstitute', { eventId, guestId: guest.id, checkedInAt: c.value.checkIn.checkedInAt!, guestVersion: guest.version, rsvpStatus: 'declined', substituteName: '' });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.entry(eventId, guest.id)).toMatchObject({ rsvpStatus: 'confirmed', checkedInAt: c.value.checkIn.checkedInAt });
    expect(h.audits()).toHaveLength(before);
  });

  it('refuses a guest already checked in, and a declined guest without the confirmation', async () => {
    const { h, eventId, guest } = await invited();
    const declined = await h.addGuest(eventId, { name: 'Người vắng', rsvpStatus: 'declined' });
    const input = (g: { id: GuestId; version: number }, confirmDeclined = false) =>
      ({ eventId, guestId: g.id, version: g.version as never, substituteName: 'Người thay', giftGiven: false, confirmDeclined, desk: null });
    expect(await h.run(desk, 'live.checkInSubstitute', input(declined))).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.run(desk, 'live.checkInSubstitute', input(declined, true))).toMatchObject({ ok: true });
    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(await h.run(desk, 'live.checkInSubstitute', input(guest))).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await h.entry(eventId, guest.id)).rsvpStatus).toBe('confirmed');
  });
});

