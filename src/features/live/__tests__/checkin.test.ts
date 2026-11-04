import { describe, expect, it } from 'vitest';
import type { Instant } from '@/core/brand';
import { testActor, XTDT } from '@/core/testing/actors';
import { desk, harness, interleave, NOW } from './harness';

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
    expect(actions(h).filter((a) => a.includes('CHECK-IN'))).toEqual(['CHECK-IN ĐẠI BIỂU', 'QUÉT LẠI CHECK-IN']);
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
  it('cancel clears the check-in with its gift; restore refuses a time in the future or a guest checked in again', async () => {
    const { h, eventId, guest } = await setup();
    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    await h.ok(desk, 'live.setGift', { eventId, guestId: guest.id, given: true });
    const cancel = await h.ok(desk, 'live.cancelCheckIn', { eventId, guestId: guest.id });
    expect(await h.checkins(eventId)).toEqual([]);
    expect(h.audits().at(-1)!.summary).toBe('Hủy check-in lúc 07:45: Trần Văn Bình (Sở Công Thương), bỏ cả ghi nhận phát quà');

    const future = await h.run(desk, 'live.restoreCheckIn', { eventId, guestId: guest.id, checkedInAt: '2026-12-16T00:00:00.000Z' as Instant, desk: null, giftGiven: false });
    expect(future).toMatchObject({ ok: false, kind: 'invalid' });

    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(await h.undo(desk, cancel.inverse)).toMatchObject({ ok: false, kind: 'conflict' });
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
