import { describe, expect, it } from 'vitest';
import { DbError, type Db } from '@/core/db';
import { translatePgError } from '@/core/db/supabase';
import { newId, type Instant } from '@/core/brand';
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

describe('a server clock the database refuses', () => {
  const SKEW = 'Đồng hồ máy chủ lệch so với cơ sở dữ liệu';
  /** What the guard's SQLSTATE 22008 becomes in core's translatePgError, thrown by the given writes of the check-in table. */
  const skewed = (methods: ReadonlyArray<'insert' | 'update'>) => (db: Db): Db => ({
    rpc: db.rpc.bind(db),
    table(def) {
      const t = db.table(def);
      if (def.name !== 'sce_tcsk_checkins') return t;
      const refuse = async () => { throw translatePgError({ code: '22008', message: 'a check-in is recorded at the current time', details: 'constraint "live_clock_skew"' }, 400, def.name); };
      return { ...t, ...Object.fromEntries(methods.map((m) => [m, refuse])) } as typeof t;
    },
  });

  it('translatePgError names the guard\'s constraint', () => {
    expect(translatePgError({ code: '22008', message: 'm', details: 'constraint "live_clock_skew"' }, 400)).toMatchObject({ kind: 'constraint', detail: { constraint: 'live_clock_skew' } });
  });

  it('a check-in the database refuses for its time says the clock is off, not that the user may not', async () => {
    const { h, eventId, guest } = await setup();
    const r = await h.runWith(desk, skewed(['insert']), 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(r.ok ? '' : r.message).toContain(SKEW);
    expect(await h.checkins(eventId)).toEqual([]);
  });

  it('a gift, a confirmed declined check-in and a walk-in say the same', async () => {
    const { h, eventId, guest } = await setup();
    await h.ok(desk, 'live.checkIn', { eventId, guestId: guest.id, desk: null });
    const gift = await h.runWith(desk, skewed(['update']), 'live.setGift', { eventId, guestId: guest.id, given: true });
    expect(gift).toMatchObject({ ok: false, kind: 'conflict' });
    expect(gift.ok ? '' : gift.message).toContain(SKEW);
    const declined = await h.addGuest(eventId, { name: 'Lê Thị Vắng', rsvpStatus: 'declined' });
    const confirm = await h.runWith(desk, skewed(['insert']), 'live.checkInDeclined', { eventId, guestId: declined.id, desk: null });
    expect(confirm).toMatchObject({ ok: false, kind: 'conflict' });
    expect(confirm.ok ? '' : confirm.message).toContain(SKEW);
    const walk = await h.runWith(desk, skewed(['insert']), 'live.walkIn', {
      eventId, guestId: newId<'Guest'>(), guest: { name: 'Khách Mới', group: 'DoanhNghiep', title: '', organization: 'X', phone: '', hasBanquet: false },
      zoneKey: null, confirmVipZone: false, giftGiven: false, allowDuplicate: true, desk: null,
    });
    expect(walk).toMatchObject({ ok: false, kind: 'conflict' });
    expect(walk.ok ? '' : walk.message).toContain(SKEW);
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

  describe('two desks cancel the same check-in at once', () => {
    const TOKENS = 'sce_tcsk_checkin_undo_tokens';
    const secondDesk = testActor('user', XTDT);
    async function checkedIn() {
      const s = await setup();
      await s.h.ok(desk, 'live.checkIn', { eventId: s.eventId, guestId: s.guest.id, desk: 'Bàn 2' });
      s.h.clock.now = CANCEL_AT;
      return s;
    }
    /** The loser reads the check-in, then the other desk cancels it, then the loser goes on. */
    async function race(method: 'list' | 'insert', first: 'list' | 'insert' = method) {
      const { h, eventId, guest } = await checkedIn();
      let winner: Awaited<ReturnType<typeof h.ok<'live.cancelCheckIn'>>> | undefined;
      const loser = await h.runWith(restorer, (db) => interleave(db, TOKENS, first, async () => { winner = await h.ok(secondDesk, 'live.cancelCheckIn', { eventId, guestId: guest.id }); }), 'live.cancelCheckIn', { eventId, guestId: guest.id });
      return { h, eventId, guest, winner: winner!, loser };
    }

    it.each(['list', 'insert'] as const)('the loser (%s) is told someone cancelled it, and the winner keeps the token to undo with', async (step) => {
      const { h, eventId, winner, loser } = await race(step);
      expect(loser).toMatchObject({ ok: false, kind: 'conflict' });
      expect(loser.ok ? '' : loser.message).toContain('Đã có người hủy check-in này');
      expect(h.rows(TOKENS)).toHaveLength(1);
      expect(await h.undo(secondDesk, winner.inverse)).toMatchObject({ ok: true });
      expect((await h.checkins(eventId))[0]).toMatchObject({ checkedInAt: NOW, desk: 'Bàn 2' });
    });

    it('a token insert the database refuses (the check-in is gone) reads as a conflict, not as a permission error', async () => {
      const { h, eventId, guest } = await checkedIn();
      const refusing = (db: Db): Db => ({
        rpc: db.rpc.bind(db),
        table(def) {
          const t = db.table(def);
          if (def.name !== TOKENS) return t;
          return { ...t, insert: async () => { await h.ok(secondDesk, 'live.cancelCheckIn', { eventId, guestId: guest.id }); throw new DbError('forbidden', { table: TOKENS }); } } as typeof t;
        },
      });
      const r = await h.runWith(restorer, refusing, 'live.cancelCheckIn', { eventId, guestId: guest.id });
      expect(r).toMatchObject({ ok: false, kind: 'conflict' });
      expect(r.ok ? '' : r.message).toContain('Đã có người hủy check-in này');
    });

    it('a token insert refused while the check-in is still there stays a permission error', async () => {
      const { h, eventId, guest } = await checkedIn();
      const refusing = (db: Db): Db => ({
        rpc: db.rpc.bind(db),
        table(def) {
          const t = db.table(def);
          return def.name === TOKENS ? ({ ...t, insert: async () => { throw new DbError('forbidden', { table: TOKENS }); } } as typeof t) : t;
        },
      });
      expect(await h.runWith(restorer, refusing, 'live.cancelCheckIn', { eventId, guestId: guest.id })).toMatchObject({ ok: false, kind: 'forbidden' });
      expect(await h.checkins(eventId)).toHaveLength(1);
    });
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
