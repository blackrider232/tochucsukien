import { describe, expect, it } from 'vitest';
import type { Instant } from '@/core/brand';
import { testActor, XTDT } from '@/core/testing/actors';
import { checkinsTable } from '../server/tables';
import { admin, desk, harness, interleave, NOW } from './harness';

const LATER = '2026-12-15T00:46:00.000Z' as Instant;
const actions = (h: ReturnType<typeof harness>) => h.audits().map((a) => a.action);

async function setup() {
  const h = harness();
  const eventId = await h.createEvent();
  const guest = await h.addGuest(eventId, { name: 'Trần Văn Bình', organization: 'Sở Công Thương' });
  return { h, eventId, guest };
}

describe('live.checkIn', () => {
  it('is idempotent: a second scan keeps the first time, reports it, and has nothing to undo (m5 BUG-08)', async () => {
    const { h, eventId, guest } = await setup();
    const first = await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(first.value).toMatchObject({ already: false, checkIn: { checkedInAt: NOW, checkedInBy: desk.profile.id } });
    expect(first.inverse?.command).toBe('live.undoCheckIn');

    h.clock.now = LATER;
    const again = await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(again.value).toMatchObject({ already: true, checkIn: { checkedInAt: NOW } });
    expect(again.inverse).toBeUndefined();
    expect(await h.checkins(eventId)).toHaveLength(1);
    expect((await h.entry(eventId, guest.id)).checkedInAt).toBe(NOW);
    expect(h.audits().at(-1)).toMatchObject({ action: 'QUÉT LẠI CHECK-IN', summary: 'Trần Văn Bình (Sở Công Thương) đã check-in lúc 07:45; không thay đổi' });
  });

  it('never writes the guest row', async () => {
    const { h, eventId, guest } = await setup();
    const before = await h.entry(eventId, guest.id);
    const r = await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: 'Bàn 2' });
    await h.ok(desk, 'live.setGift', { eventId, guestId: guest.id, given: true });
    await h.undo(desk, r.inverse);
    const after = await h.entry(eventId, guest.id);
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it('undo removes that check-in, and its own undo restores the same time', async () => {
    const { h, eventId, guest } = await setup();
    const r = await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    const undone = await h.undo(desk, r.inverse);
    expect(undone.ok).toBe(true);
    expect(await h.checkins(eventId)).toEqual([]);
    h.clock.now = LATER;
    const redone = await h.undo(desk, undone.ok ? undone.inverse : undefined);
    expect(redone.ok && redone.value).toMatchObject({ checkedInAt: NOW });
    expect(actions(h).slice(-3)).toEqual(['CHECK-IN ĐẠI BIỂU', 'HOÀN TÁC CHECK-IN', 'KHÔI PHỤC CHECK-IN']);
  });

  it('an undo does not remove a later check-in another desk made', async () => {
    const { h, eventId, guest } = await setup();
    const mine = await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    await h.ok(desk, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    h.clock.now = LATER;
    await h.ok(testActor('user', XTDT), 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    const r = await h.undo(desk, mine.inverse);
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect((await h.checkins(eventId))[0]).toMatchObject({ checkedInAt: LATER });
  });

  it('two desks scanning one badge at once: one check-in, the second desk is told the first time (m5 BUG-05)', async () => {
    const { h, eventId, guest } = await setup();
    const deskB = testActor('user', XTDT);
    let second: Awaited<ReturnType<typeof h.run<'live.checkIn'>>> | null = null;
    const first = await h.runWith(desk, (db) => interleave(db, 'sce_tcsk_checkins', 'insert', async () => {
      h.clock.now = LATER;
      second = await h.run(deskB, 'live.checkIn', { eventId, guestId: guest.id, desk: 'Bàn 2' });
    }), 'live.checkIn', { eventId, guestId: guest.id, desk: 'Bàn 1' });
    expect(second).toMatchObject({ ok: true, value: { already: false, checkIn: { checkedInAt: LATER, desk: 'Bàn 2' } } });
    expect(first).toMatchObject({ ok: true, value: { already: true, checkIn: { checkedInAt: LATER, desk: 'Bàn 2' } } });
    expect(await h.checkins(eventId)).toHaveLength(1);
    expect(actions(h).filter((a) => String(a).includes('CHECK-IN'))).toEqual(['CHECK-IN ĐẠI BIỂU', 'QUÉT LẠI CHECK-IN']);
  });
});

describe('declined guests (decision 7)', () => {
  it('refuses a plain check-in and writes neither a check-in nor a success audit', async () => {
    const { h, eventId } = await setup();
    const declined = await h.addGuest(eventId, { name: 'Lê Thị Vắng', rsvpStatus: 'declined' });
    const before = h.audits().length;
    const r = await h.run(desk, 'live.checkIn', { eventId, guestId: declined.id, desk: null });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(r.ok ? '' : r.message).toContain('đã báo vắng');
    expect(await h.checkins(eventId)).toEqual([]);
    expect(h.audits()).toHaveLength(before);
  });

  it('checks in after the confirmation, and the audit says it was a declined guest', async () => {
    const { h, eventId } = await setup();
    const declined = await h.addGuest(eventId, { name: 'Lê Thị Vắng', organization: 'Báo Thử', rsvpStatus: 'declined' });
    const r = await h.ok(desk, 'live.checkInDeclined', { eventId, guestId: declined.id, desk: null });
    expect(r.value.already).toBe(false);
    expect(h.audits().at(-1)).toMatchObject({ action: 'CHECK-IN ĐẠI BIỂU BÁO VẮNG', summary: 'Xác nhận check-in đại biểu đã báo vắng: Lê Thị Vắng (Báo Thử)' });
  });

  it('a declined guest already checked in through the confirmation re-scans as already, not as a new confirmation (review M02)', async () => {
    const { h, eventId } = await setup();
    const declined = await h.addGuest(eventId, { name: 'Lê Thị Vắng', rsvpStatus: 'declined' });
    await h.ok(desk, 'live.checkInDeclined', { eventId, guestId: declined.id, desk: null });
    h.clock.now = LATER;
    const again = await h.run(desk, 'live.checkIn', { eventId, guestId: declined.id, desk: null });
    expect(again).toMatchObject({ ok: true, value: { already: true, checkIn: { checkedInAt: NOW } } });
    expect(actions(h).at(-1)).toBe('QUÉT LẠI CHECK-IN');
  });

  it('an undone cancel is refused once the guest has declined in between', async () => {
    const { h, eventId, guest } = await setup();
    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    const cancel = await h.ok(desk, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    await h.ok(desk, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'declined' } });
    expect(await h.undo(desk, cancel.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.checkins(eventId)).toEqual([]);
  });
});

describe('cancel, restore and the welcome pack', () => {
  it('cancel clears the check-in with its gift; its undo refuses a guest checked in again', async () => {
    const { h, eventId, guest } = await setup();
    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    await h.ok(desk, 'live.setGift', { eventId, guestId: guest.id, given: true });
    const cancel = await h.ok(desk, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    expect(await h.checkins(eventId)).toEqual([]);
    expect(h.audits().at(-1)!.summary).toBe('Hủy check-in lúc 07:45: Trần Văn Bình (Sở Công Thương), bỏ cả ghi nhận phát quà');


    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(await h.undo(desk, cancel.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('a legacy gift-only row: no gift on top without a check-in, taking the gift back removes the row, a check-in keeps the gift (review M12)', async () => {
    const { h, eventId, guest } = await setup();
    const legacy = () => h.ctx(admin).db.table(checkinsTable).insert({ eventId, guestId: guest.id, checkedInAt: null, checkedInBy: null, desk: null, giftGivenAt: NOW });
    await legacy();
    const r = await h.run(desk, 'live.setGift', { eventId, guestId: guest.id, given: true });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(r.ok ? '' : r.message).toContain('chưa check-in');
    await h.ok(desk, 'live.setGift', { eventId, guestId: guest.id, given: false });
    expect(await h.checkins(eventId)).toEqual([]);
    await legacy();
    h.clock.now = LATER;
    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(await h.checkins(eventId)).toEqual([expect.objectContaining({ checkedInAt: LATER, giftGivenAt: NOW })]);
  });

  it('cancel without a check-in changes nothing and says so', async () => {
    const { h, eventId, guest } = await setup();
    const r = await h.ok(desk, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    expect(r.inverse).toBeUndefined();
    expect(h.audits().at(-1)!.summary).toBe('Trần Văn Bình (Sở Công Thương) chưa check-in; không có gì để hủy');
  });

  it('a gift needs a check-in first, is a set, and is never automatic (decision 8, m5 BUG-30)', async () => {
    const { h, eventId, guest } = await setup();
    expect(await h.run(desk, 'live.setGift', { eventId, guestId: guest.id, given: true })).toMatchObject({ ok: false, kind: 'invalid' });
    const c = await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(c.value.checkIn.giftGivenAt).toBeNull();
    const g = await h.ok(desk, 'live.setGift', { eventId, guestId: guest.id, given: true });
    expect(g.value?.giftGivenAt).toBe(NOW);
    const again = await h.ok(desk, 'live.setGift', { eventId, guestId: guest.id, given: true });
    expect(again.inverse).toBeUndefined();
    await h.undo(desk, g.inverse);
    expect((await h.checkins(eventId))[0]!.giftGivenAt).toBeNull();
  });
});

describe('the undo of a cancel restores what the server kept, once', () => {
  const GIFT_AT = '2026-12-15T00:50:00.000Z' as Instant;
  const CANCEL_AT = '2026-12-15T02:00:00.000Z' as Instant;
  const restorer = testActor('user', XTDT);

  async function cancelled() {
    const s = await setup();
    await s.h.ok(desk, 'live.checkIn', { eventId: s.eventId, guestId: s.guest.id, desk: 'Bàn 2' });
    s.h.clock.now = GIFT_AT;
    await s.h.ok(desk, 'live.setGift', { eventId: s.eventId, guestId: s.guest.id, given: true });
    s.h.clock.now = CANCEL_AT;
    const cancel = await s.h.ok(restorer, 'live.cancelCheckIn', { eventId: s.eventId, guestId: s.guest.id });
    return { ...s, cancel };
  }

  it('brings back the original time, desk, gift time and actor, and the audit names them', async () => {
    const { h, eventId, cancel } = await cancelled();
    h.clock.now = '2026-12-15T02:05:00.000Z' as Instant;
    const r = await h.undo(restorer, cancel.inverse);
    expect(r.ok).toBe(true);
    expect((await h.checkins(eventId))[0]).toMatchObject({ checkedInAt: NOW, desk: 'Bàn 2', giftGivenAt: GIFT_AT, checkedInBy: desk.profile.id });
    expect(h.audits().at(-1)).toMatchObject({
      action: 'KHÔI PHỤC CHECK-IN',
      summary: 'Khôi phục check-in lúc 07:45 (hoàn tác): Trần Văn Bình (Sở Công Thương), đã phát quà lúc 07:50',
    });
  });

  it('refuses a restore the client made up: a guest never checked in stays unchecked and nothing is audited', async () => {
    const { h, eventId } = await setup();
    const never = await h.addGuest(eventId, { name: 'Lê Thị Thật' });
    const before = h.audits().length;
    const forged = { eventId, guestId: never.id, checkedInAt: '2020-01-01T00:00:00.000Z', desk: 'forged', giftGiven: true };
    const r = await h.run(desk, 'live.restoreCheckIn', forged as never);
    expect(r.ok).toBe(false);
    expect(await h.checkins(eventId)).toEqual([]);
    expect(h.audits()).toHaveLength(before);
  });

  it('a token is single-use: an old undo cannot restore a check-in after a later cancel', async () => {
    const { h, eventId, guest, cancel } = await cancelled();
    await h.undo(restorer, cancel.inverse);
    await h.ok(restorer, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    expect(await h.undo(restorer, cancel.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.checkins(eventId)).toEqual([]);
  });

  it('a second cancel without a restore between replaces the first token: one token survives, the newest', async () => {
    const { h, eventId, guest, cancel } = await cancelled();
    h.clock.now = '2026-12-15T02:01:00.000Z' as Instant;
    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: 'Bàn 3' });
    h.clock.now = '2026-12-15T02:02:00.000Z' as Instant;
    const second = await h.ok(restorer, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    expect(h.rows('sce_tcsk_checkin_undo_tokens')).toHaveLength(1);
    expect(await h.undo(restorer, cancel.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await h.undo(restorer, second.inverse)).toMatchObject({ ok: true });
    expect((await h.checkins(eventId))[0]).toMatchObject({ checkedInAt: '2026-12-15T02:01:00.000Z', desk: 'Bàn 3' });
  });

  it('an expired token is refused', async () => {
    const { h, eventId, cancel } = await cancelled();
    h.clock.now = '2026-12-15T02:16:00.000Z' as Instant;
    const r = await h.undo(restorer, cancel.inverse);
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(r.ok ? '' : r.message).toContain('quá 15 phút');
    expect(await h.checkins(eventId)).toEqual([]);
  });

  it('a token restores only its own guest of its own event', async () => {
    const { h, eventId, cancel } = await cancelled();
    const someone = await h.addGuest(eventId, { name: 'Phạm Thị Khác' });
    const input = cancel.inverse!.input as Record<string, unknown>;
    expect(await h.run(restorer, 'live.restoreCheckIn', { ...input, guestId: someone.id } as never)).toMatchObject({ ok: false });
    const otherEvent = await h.createEvent();
    const twin = await h.addGuest(otherEvent, { name: 'Trần Văn Bình', organization: 'Sở Công Thương' });
    expect(await h.run(restorer, 'live.restoreCheckIn', { ...input, eventId: otherEvent, guestId: twin.id } as never)).toMatchObject({ ok: false });
    expect(await h.checkins(eventId)).toEqual([]);
    expect(await h.checkins(otherEvent)).toEqual([]);
  });

  it('undoing the cancel of a confirmed declined check-in needs no second confirmation (decision 7)', async () => {
    const { h, eventId } = await setup();
    const declined = await h.addGuest(eventId, { name: 'Lê Thị Vắng', rsvpStatus: 'declined' });
    await h.ok(desk, 'live.checkInDeclined', { eventId, guestId: declined.id, desk: null });
    const cancel = await h.ok(desk, 'live.cancelCheckIn', { eventId, guestId: declined.id });
    expect(await h.undo(desk, cancel.inverse)).toMatchObject({ ok: true });
    expect((await h.checkins(eventId))[0]).toMatchObject({ guestId: declined.id, checkedInAt: NOW });
  });
});
