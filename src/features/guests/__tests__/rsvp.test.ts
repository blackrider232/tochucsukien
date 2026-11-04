import { describe, expect, it } from 'vitest';
import type { EventId, GuestId, Instant } from '@/core/brand';
import { testActor, XTDT } from '@/core/testing/actors';
import { harness, NOW } from './harness';

const xtdtUser = testActor('user', XTDT);
const at = (iso: string) => iso as Instant;

async function setup() {
  const h = harness();
  const eventId = await h.createEvent();
  const created = await h.addGuest(xtdtUser, eventId);
  await h.seat(eventId, created.id, 'A-04');
  const confirmed = await h.ok(xtdtUser, 'guests.update', { eventId, id: created.id, version: created.version, patch: { rsvpStatus: 'confirmed' } });
  return { h, eventId, guest: confirmed.value, first: created };
}
const seatOf = async (h: ReturnType<typeof harness>, eventId: EventId, guestId: GuestId) =>
  (await h.roster(xtdtUser, eventId)).find((g) => g.id === guestId)!;

describe('a decline saves the guest first and releases the seat after (m4a B18)', () => {
  it('a stale version fails with conflict and leaves the seat, the status and the audit trail alone', async () => {
    const { h, eventId, guest, first } = await setup();
    const audits = h.audits().length;
    const r = await h.run(xtdtUser, 'guests.update', { eventId, id: guest.id, version: first.version, patch: { rsvpStatus: 'declined' } });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await seatOf(h, eventId, guest.id)).toMatchObject({ rsvpStatus: 'confirmed', seatCode: 'A-04' });
    expect(h.audits()).toHaveLength(audits);
  });

  it('when venue cannot release the seat, the decline stays applied, the audit says so and the error names the seat (update)', async () => {
    const { h, eventId, guest } = await setup();
    h.venueState.releaseFails = true;
    const r = await h.run(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'declined' } });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(!r.ok && r.message).toBe('Đã ghi nhận báo vắng nhưng chưa giải phóng được ghế A-04. Vui lòng giải phóng ghế này thủ công ở sơ đồ chỗ ngồi.');
    expect(await seatOf(h, eventId, guest.id)).toMatchObject({ rsvpStatus: 'declined', seatCode: 'A-04' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT RSVP', entity_id: guest.id });
    expect(h.audits().at(-1)!.summary).toContain('chưa giải phóng được ghế A-04, cần giải phóng thủ công');
  });

  it('the same holds for a declined form response (applyRsvp)', async () => {
    const { h, eventId, guest } = await setup();
    h.venueState.releaseFails = true;
    const r = await h.run(xtdtUser, 'guests.applyRsvp', { eventId, id: guest.id, status: 'declined', source: 'google_form', respondedAt: at('2026-11-05T01:00:00.000Z') });
    expect(r).toMatchObject({ ok: false, kind: 'conflict' });
    expect(await seatOf(h, eventId, guest.id)).toMatchObject({ rsvpStatus: 'declined', rsvpSource: 'google_form', seatCode: 'A-04' });
    expect(h.audits().at(-1)!.summary).toContain('chưa giải phóng được ghế A-04, cần giải phóng thủ công');
  });
});

describe('undoing a decline gives the seat back, as undoing a delete does (m4a B57)', () => {
  it('the inverse carries the seat read from the database, and undo seats the guest again', async () => {
    const { h, eventId, guest } = await setup();
    const declined = await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'declined' } });
    expect((await seatOf(h, eventId, guest.id)).seatCode).toBeNull();
    expect(declined.inverse).toMatchObject({ command: 'guests.undoRsvp', input: { seatCode: 'A-04' } });
    expect(await h.undo(xtdtUser, declined.inverse)).toMatchObject({ ok: true, value: { rsvpStatus: 'confirmed' } });
    expect(await seatOf(h, eventId, guest.id)).toMatchObject({ rsvpStatus: 'confirmed', seatCode: 'A-04' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'HOÀN TÁC RSVP' });
    expect(h.audits().at(-1)!.summary).toContain('Báo vắng → Tham dự chính thức, xếp lại ghế A-04');
  });

  it('undo still restores the RSVP, and says so, when the seat went to someone else meanwhile', async () => {
    const { h, eventId, guest } = await setup();
    const declined = await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'declined' } });
    const other = await h.addGuest(xtdtUser, eventId, { name: 'Người khác' });
    await h.seat(eventId, other.id, 'A-04');
    expect(await h.undo(xtdtUser, declined.inverse)).toMatchObject({ ok: true, value: { rsvpStatus: 'confirmed' } });
    expect(await seatOf(h, eventId, guest.id)).toMatchObject({ rsvpStatus: 'confirmed', seatCode: null });
    expect(h.audits().at(-1)!.summary).toContain('không xếp lại được ghế A-04 (ghế không còn trống)');
  });

  it('a declined form response is undone the same way', async () => {
    const { h, eventId, guest } = await setup();
    const r = await h.ok(xtdtUser, 'guests.applyRsvp', { eventId, id: guest.id, status: 'declined', source: 'google_form', respondedAt: at('2026-11-05T01:00:00.000Z') });
    expect(r.inverse).toMatchObject({ command: 'guests.undoRsvp', input: { seatCode: 'A-04' } });
    expect((await h.undo(xtdtUser, r.inverse)).ok).toBe(true);
    expect(await seatOf(h, eventId, guest.id)).toMatchObject({ rsvpStatus: 'confirmed', seatCode: 'A-04' });
  });

  it('a guest without a seat keeps the plain update as its inverse', async () => {
    const { h, eventId } = await setup();
    const unseated = await h.addGuest(xtdtUser, eventId, { name: 'Không ghế', rsvpStatus: 'confirmed' });
    const declined = await h.ok(xtdtUser, 'guests.update', { eventId, id: unseated.id, version: unseated.version, patch: { rsvpStatus: 'declined' } });
    expect(declined.inverse).toMatchObject({ command: 'guests.update' });
  });
});

describe('applyRsvp (asked by comms)', () => {
  it('refuses substituted without a substitute name, with a Vietnamese message, and writes nothing', async () => {
    const { h, eventId } = await setup();
    const pending = await h.addGuest(xtdtUser, eventId, { name: 'Chưa trả lời' });
    const audits = h.audits().length;
    for (const substituteName of [undefined, '   ']) {
      const r = await h.run(xtdtUser, 'guests.applyRsvp', { eventId, id: pending.id, status: 'substituted', source: 'google_form', respondedAt: at('2026-11-05T01:00:00.000Z'), substituteName });
      expect(r).toMatchObject({ ok: false, kind: 'invalid', fieldErrors: { substituteName: 'Nhập tên người đi thay.' } });
      expect(!r.ok && r.message).toBe('Cần nhập tên người đi thay khi chọn "Cử người đi thay".');
    }
    expect(await seatOf(h, eventId, pending.id)).toMatchObject({ rsvpStatus: 'pending', rsvpAt: null });
    expect(h.audits()).toHaveLength(audits);
  });

  it('accepts substituted with a name, and keeps the standing substitute when the response names none', async () => {
    const { h, eventId } = await setup();
    const g = await h.addGuest(xtdtUser, eventId, { name: 'Cử người', rsvpStatus: 'substituted', substituteName: 'Vũ D' });
    await h.ok(xtdtUser, 'guests.applyRsvp', { eventId, id: g.id, status: 'substituted', source: 'google_form', respondedAt: at('2026-11-05T01:00:00.000Z') });
    expect(await seatOf(h, eventId, g.id)).toMatchObject({ rsvpStatus: 'substituted', substituteName: 'Vũ D' });
    await h.ok(xtdtUser, 'guests.applyRsvp', { eventId, id: g.id, status: 'substituted', source: 'google_form', respondedAt: at('2026-11-05T02:00:00.000Z'), substituteName: 'Lê E' });
    expect(await seatOf(h, eventId, g.id)).toMatchObject({ substituteName: 'Lê E' });
  });

  it('applies a response only when it is strictly newer than the last change (m4a B15, Q5)', async () => {
    const { h, eventId, guest } = await setup();
    expect(guest.rsvpAt).toBe(NOW);
    const send = (respondedAt: string) => h.ok(xtdtUser, 'guests.applyRsvp', { eventId, id: guest.id, status: 'pending', source: 'google_form', respondedAt: at(respondedAt) });
    expect((await send('2026-11-04T01:59:59.999Z')).value).toEqual({ applied: false });
    expect((await send(NOW)).value).toEqual({ applied: false });
    expect((await send('2026-11-04T02:00:00.001Z')).value).toEqual({ applied: true });
    expect(await seatOf(h, eventId, guest.id)).toMatchObject({ rsvpStatus: 'pending', rsvpAt: '2026-11-04T02:00:00.001Z' });
  });
});
