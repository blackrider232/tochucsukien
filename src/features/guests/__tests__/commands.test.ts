import { describe, expect, it } from 'vitest';
import { newId, type ContactId, type Email, type EventId, type Instant, type Version } from '@/core/brand';
import type { CheckinCode } from '@/core/checkin-code';
import type { CommandId, InputOf } from '@/core/commands';
import { testActor, PTDN, XTDT } from '@/core/testing/actors';
import type { Guest } from '../contract';
import { commands } from '../server/commands';
import { draft, harness, NOW } from './harness';

const admin = testActor('admin', null);
const xtdtUser = testActor('user', XTDT);
const xtdtLeader = testActor('dept_leader', XTDT);
const ptdnUser = testActor('user', PTDN);
const ptdnLeader = testActor('dept_leader', PTDN);

async function setup() {
  const h = harness();
  const eventId = await h.createEvent();
  const guest = await h.addGuest(xtdtUser, eventId);
  return { h, eventId, guest };
}

describe('guests.create', () => {
  it('creates a pending, uninvited guest with a DB check-in code, audits and offers undo (m4a B40, B27)', async () => {
    const { h, eventId, guest } = await setup();
    expect(guest).toMatchObject({ name: 'Nguyễn Văn An', rsvpStatus: 'pending', inviteStatus: 'pending', hasBanquet: false, rsvpAt: null, eventId });
    expect(guest.checkinCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(h.audits().at(-1)).toMatchObject({ action: 'THÊM KHÁCH MỜI', summary: 'Thêm khách mời: "Nguyễn Văn An" (Sở Tài chính Hà Nội)', event_id: eventId, entity_id: guest.id });
    const created = await h.ok(xtdtUser, 'guests.create', { eventId, id: newId<'Guest'>(), draft: draft({ name: 'Trần B' }) });
    expect(created.inverse).toMatchObject({ command: 'guests.delete' });
    expect((await h.undo(xtdtUser, created.inverse)).ok).toBe(true);
    expect((await h.roster(xtdtUser, eventId)).map((g) => g.name)).toEqual(['Nguyễn Văn An']);
  });

  it('stamps rsvpAt when the guest is created already answered', async () => {
    const { h, eventId } = await setup();
    expect(await h.addGuest(xtdtUser, eventId, { rsvpStatus: 'confirmed' })).toMatchObject({ rsvpAt: NOW });
  });

  it('a retry with the same id converges; another payload under that id conflicts (m4a B42)', async () => {
    const { h, eventId } = await setup();
    const id = newId<'Guest'>();
    await h.ok(xtdtUser, 'guests.create', { eventId, id, draft: draft({ name: 'Lặp lại', rsvpStatus: 'confirmed' }) });
    await h.ok(xtdtUser, 'guests.create', { eventId, id, draft: draft({ name: 'Lặp lại', rsvpStatus: 'confirmed' }) });
    expect(h.rows('sce_tcsk_guests').filter((r) => r.id === id)).toHaveLength(1);
    expect(await h.run(xtdtUser, 'guests.create', { eventId, id, draft: draft({ name: 'Khác' }) })).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('validates the required fields, the phone and the email with field errors (m4a B04, Q13)', async () => {
    const { h, eventId } = await setup();
    const r = await h.run(xtdtUser, 'guests.create', {
      eventId, id: newId<'Guest'>(), draft: { ...draft(), name: ' ', organization: '', phone: '09ab', email: 'a@b.c\r\nBcc: x@y.vn' as Email },
    });
    expect(r).toMatchObject({ ok: false, kind: 'invalid' });
    expect(!r.ok && r.fieldErrors).toMatchObject({
      'draft.name': 'Nhập họ và tên đại biểu',
      'draft.organization': 'Nhập cơ quan / đơn vị công tác',
      'draft.phone': 'Số điện thoại không hợp lệ (ví dụ 0912.345.678)',
      'draft.email': 'Email không hợp lệ (ví dụ daibieu@domain.vn)',
    });
    expect(h.rows('sce_tcsk_guests')).toHaveLength(1);
  });

  it('accepts Vietnamese and foreign phone forms, lowercases the email, and drops a substitute of a non-substituted guest', async () => {
    const { h, eventId } = await setup();
    for (const phone of ['0913.210.001', '024.3846.3000', '+84 912 345 678', '+81 3 1234 5678']) {
      expect((await h.run(xtdtUser, 'guests.create', { eventId, id: newId<'Guest'>(), draft: draft({ name: phone, phone }) })).ok).toBe(true);
    }
    const g = await h.addGuest(xtdtUser, eventId, { email: ' DaiBieu@Hanoi.GOV.vn ' as Email, substituteName: 'Ai đó', rsvpStatus: 'confirmed' });
    expect(g).toMatchObject({ email: 'daibieu@hanoi.gov.vn', substituteName: '' });
  });
});

describe('guests.update', () => {
  it('updates, audits, and the inverse restores exactly the changed fields', async () => {
    const { h, eventId, guest } = await setup();
    const r = await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { title: 'Phó Giám đốc', notes: 'Đón tại cửa A' } });
    expect(r.value).toMatchObject({ title: 'Phó Giám đốc', notes: 'Đón tại cửa A' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT KHÁCH MỜI', summary: 'Cập nhật hồ sơ đại biểu: "Nguyễn Văn An" (Sở Tài chính Hà Nội)' });
    expect(await h.undo(xtdtUser, r.inverse)).toMatchObject({ ok: true, value: { title: '', notes: '' } });
  });

  it('RSVP: one transition releases the seat on decline, stamps rsvpAt and clears a stale substitute (m4a B18, Q10)', async () => {
    const { h, eventId, guest } = await setup();
    await h.seat(eventId, guest.id, 'A-04');
    const sub = await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'substituted', substituteName: 'Lê C - Phó phòng' } });
    expect(sub.value).toMatchObject({ rsvpStatus: 'substituted', substituteName: 'Lê C - Phó phòng', rsvpAt: NOW, rsvpSource: 'manual' });
    expect((await h.roster(xtdtUser, eventId))[0]!.seatCode).toBe('A-04');
    const declined = await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: sub.value.version, patch: { rsvpStatus: 'declined' } });
    expect(declined.value).toMatchObject({ rsvpStatus: 'declined', substituteName: '' });
    expect((await h.roster(xtdtUser, eventId))[0]!.seatCode).toBeNull();
    expect(h.audits().at(-1)).toMatchObject({ action: 'CẬP NHẬT RSVP', summary: 'Cập nhật RSVP: "Nguyễn Văn An" (Sở Tài chính Hà Nội): Cử người đi thay → Báo vắng' });
    expect(await h.undo(xtdtUser, declined.inverse)).toMatchObject({ ok: true, value: { rsvpStatus: 'substituted', substituteName: 'Lê C - Phó phòng' } });
  });

  it('answers a stale version with conflict', async () => {
    const { h, eventId, guest } = await setup();
    await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { notes: 'a' } });
    expect(await h.run(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { notes: 'b' } })).toMatchObject({ ok: false, kind: 'conflict' });
  });

  it('refuses a guest id of another event, even one the actor may write', async () => {
    const { h, guest } = await setup();
    const other = await h.createEvent();
    expect(await h.run(xtdtUser, 'guests.update', { eventId: other, id: guest.id, version: guest.version, patch: { notes: 'x' } })).toMatchObject({ ok: false, kind: 'not_found' });
    expect(await h.run(xtdtUser, 'guests.delete', { eventId: other, id: guest.id, version: guest.version })).toMatchObject({ ok: false, kind: 'not_found' });
  });
});

describe('guests.delete and guests.restore', () => {
  it('undo brings back the same id, check-in code and seat (m4a B57)', async () => {
    const { h, eventId, guest } = await setup();
    await h.seat(eventId, guest.id, 'B-02');
    const del = await h.ok(xtdtUser, 'guests.delete', { eventId, id: guest.id, version: guest.version });
    expect(h.audits().at(-1)).toMatchObject({ action: 'XÓA KHÁCH MỜI', summary: 'Xóa khách mời: "Nguyễn Văn An" (Sở Tài chính Hà Nội), giải phóng ghế B-02' });
    expect(await h.roster(xtdtUser, eventId)).toEqual([]);
    // Postgres cascades the seat with the guest (FK in 0002); the memory Db does not, so the test removes it as Postgres would.
    await h.unseat(eventId, guest.id);
    const back = await h.undo(xtdtUser, del.inverse);
    expect(back).toMatchObject({ ok: true, value: { id: guest.id, checkinCode: guest.checkinCode, name: guest.name } });
    expect((await h.roster(xtdtUser, eventId))[0]).toMatchObject({ id: guest.id, seatCode: 'B-02' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'KHÔI PHỤC KHÁCH MỜI', summary: 'Khôi phục khách mời: "Nguyễn Văn An" (Sở Tài chính Hà Nội), xếp lại ghế B-02' });
  });

  it('restores a guest unseated, and says so, when the seat went to someone else meanwhile', async () => {
    const { h, eventId, guest } = await setup();
    await h.seat(eventId, guest.id, 'B-02');
    const del = await h.ok(xtdtUser, 'guests.delete', { eventId, id: guest.id, version: guest.version });
    await h.unseat(eventId, guest.id);
    const other = await h.addGuest(xtdtUser, eventId, { name: 'Người khác' });
    await h.seat(eventId, other.id, 'B-02');
    expect((await h.undo(xtdtUser, del.inverse)).ok).toBe(true);
    expect((await h.roster(xtdtUser, eventId)).find((g) => g.id === guest.id)!.seatCode).toBeNull();
    expect(h.audits().at(-1)!.summary).toContain('không xếp lại được ghế B-02');
  });
});

describe('guests.applyRsvp (asked by comms)', () => {
  const at = (iso: string) => iso as Instant;

  it('applies a newer response, maps a named substitute to substituted, and keeps banquet when the form has no banquet answer (m4a B15, B17)', async () => {
    const { h, eventId, guest } = await setup();
    const r = await h.ok(xtdtUser, 'guests.applyRsvp', { eventId, id: guest.id, status: 'confirmed', source: 'google_form', respondedAt: at('2026-11-05T01:00:00.000Z'), substituteName: 'Vũ D' });
    expect(r.value).toEqual({ applied: true });
    expect((await h.roster(xtdtUser, eventId))[0]).toMatchObject({ rsvpStatus: 'substituted', substituteName: 'Vũ D', rsvpSource: 'google_form', rsvpAt: '2026-11-05T01:00:00.000Z', hasBanquet: false });
  });

  it('ignores a response older than the last change, so a staff edit is never overwritten by a re-sync (m4a B15, Q5)', async () => {
    const { h, eventId, guest } = await setup();
    await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'confirmed' } });
    const r = await h.ok(xtdtUser, 'guests.applyRsvp', { eventId, id: guest.id, status: 'declined', source: 'google_form', respondedAt: at('2026-11-01T00:00:00.000Z') });
    expect(r.value).toEqual({ applied: false });
    expect((await h.roster(xtdtUser, eventId))[0]!.rsvpStatus).toBe('confirmed');
    expect(h.audits().at(-1)).toMatchObject({ action: 'BỎ QUA PHẢN HỒI RSVP' });
  });

  it('a declined response releases the seat and sets banquet only when answered', async () => {
    const { h, eventId, guest } = await setup();
    await h.seat(eventId, guest.id, 'C-01');
    await h.ok(xtdtUser, 'guests.applyRsvp', { eventId, id: guest.id, status: 'declined', source: 'google_form', respondedAt: at('2026-11-05T01:00:00.000Z'), hasBanquet: true });
    expect((await h.roster(xtdtUser, eventId))[0]).toMatchObject({ rsvpStatus: 'declined', seatCode: null, hasBanquet: true });
  });
});

describe('guests.upsertMany (asked by directory and comms)', () => {
  it('adds new guests, dedupes by the one identity rule, fills blanks only, and converges on retry (m4a B41)', async () => {
    const { h, eventId, guest } = await setup();
    const contact = 'c0000000-0000-4000-8000-000000000001' as ContactId;
    const items = [
      { id: newId<'Guest'>(), draft: draft({ name: 'NGUYỄN VĂN AN', organization: 'Sở tài chính hà nội', title: 'Giám đốc', masterContactId: contact }) },
      { id: newId<'Guest'>(), draft: draft({ name: 'Mới Một', organization: 'Công ty A', email: 'moi1@a.vn' as Email }) },
      { id: newId<'Guest'>(), draft: draft({ name: 'Mới Một (trùng email)', organization: 'Công ty A', email: 'MOI1@a.vn' as Email }) },
    ];
    const r = await h.ok(xtdtUser, 'guests.upsertMany', { eventId, items, onExisting: 'fill_blanks' });
    expect(r.value).toEqual({ added: 1, updated: 1, skipped: 1 });
    const roster = await h.roster(xtdtUser, eventId);
    expect(roster.find((g) => g.id === guest.id)).toMatchObject({ name: 'Nguyễn Văn An', title: 'Giám đốc', phone: '', masterContactId: contact });
    expect(roster).toHaveLength(2);
    expect(h.audits().at(-1)).toMatchObject({ action: 'NHẬP KHÁCH MỜI', summary: 'Nhập khách mời: thêm 1, bổ sung thông tin 1, bỏ qua 1 (trùng)' });
    expect((await h.ok(xtdtUser, 'guests.upsertMany', { eventId, items, onExisting: 'fill_blanks' })).value).toEqual({ added: 0, updated: 0, skipped: 3 });
  });

  it("'skip' never touches an existing guest", async () => {
    const { h, eventId, guest } = await setup();
    const r = await h.ok(xtdtUser, 'guests.upsertMany', { eventId, items: [{ id: newId<'Guest'>(), draft: draft({ title: 'Giám đốc' }) }], onExisting: 'skip' });
    expect(r.value).toEqual({ added: 0, updated: 0, skipped: 1 });
    expect((await h.roster(xtdtUser, eventId))[0]).toMatchObject({ id: guest.id, title: '' });
  });
});

describe('guests.markInvited (asked by comms after a send)', () => {
  it('moves pending to sent, never moves received back, records the method, and ignores ids of another event (m4a B33)', async () => {
    const { h, eventId, guest } = await setup();
    const received = await h.addGuest(xtdtUser, eventId, { name: 'Đã nhận', inviteStatus: 'received' });
    const otherEvent = await h.createEvent();
    const stranger = await h.addGuest(xtdtUser, otherEvent, { name: 'Sự kiện khác' });
    await h.ok(xtdtUser, 'guests.markInvited', { eventId, ids: [guest.id, received.id, stranger.id], method: 'email' });
    const roster = await h.roster(xtdtUser, eventId);
    const byId = new Map(roster.map((g) => [g.id, [g.inviteStatus, g.sendMethod]]));
    expect([byId.get(guest.id), byId.get(received.id)]).toEqual([['sent', 'email'], ['received', 'email']]);
    expect((await h.roster(xtdtUser, otherEvent))[0]).toMatchObject({ inviteStatus: 'pending', sendMethod: 'direct' });
    expect(h.audits().at(-1)).toMatchObject({ action: 'PHÁT HÀNH GIẤY MỜI', summary: 'Đánh dấu đã phát hành giấy mời (Thư điện tử (Email)): 2/2 khách mời' });
  });
});

describe('every command is denied to an actor outside the event department, with no write and no audit', () => {
  const inputs = (eventId: EventId, guest: Guest) =>
    ({
      create: { eventId, id: newId<'Guest'>(), draft: draft({ name: 'X' }) },
      update: { eventId, id: guest.id, version: guest.version, patch: { notes: 'x' } },
      undoRsvp: { eventId, id: guest.id, version: guest.version, patch: { rsvpStatus: 'confirmed' }, seatCode: null },
      delete: { eventId, id: guest.id, version: guest.version },
      restore: { eventId, guest: { id: newId<'Guest'>(), draft: draft({ name: 'Y' }), checkinCode: 'ABCDEF' as CheckinCode, rsvpAt: null, seatCode: null } },
      applyRsvp: { eventId, id: guest.id, status: 'declined', source: 'google_form', respondedAt: '2026-11-05T00:00:00.000Z' as Instant },
      upsertMany: { eventId, items: [{ id: newId<'Guest'>(), draft: draft({ name: 'Z', organization: 'Khác' }) }], onExisting: 'fill_blanks' },
      markInvited: { eventId, ids: [guest.id], method: 'email' },
    }) satisfies { [K in CommandId as K extends `guests.${infer V}` ? V : never]: InputOf<K> };
  const snapshot = (h: ReturnType<typeof harness>) => ({ guests: h.rows('sce_tcsk_guests'), audits: h.audits().length });

  it.each(Object.keys(commands))('guests.%s', async (verb) => {
    const { h, eventId, guest } = await setup();
    const before = snapshot(h);
    const r = await h.run(ptdnUser, `guests.${verb}` as CommandId, inputs(eventId, guest)[verb as keyof ReturnType<typeof inputs>] as never);
    expect(r.ok).toBe(false);
    expect(['forbidden', 'not_found']).toContain(!r.ok && r.kind);
    expect(snapshot(h)).toEqual(before);
  });

  it.each(Object.keys(commands))('guests.%s refuses an outsider on its own, even when row-level security would let the read and write through', async (verb) => {
    const { h, eventId, guest } = await setup();
    const before = snapshot(h);
    for (const actor of [ptdnUser, ptdnLeader]) {
      const r = await h.runWithoutRls(actor, `guests.${verb}` as CommandId, inputs(eventId, guest)[verb as keyof ReturnType<typeof inputs>] as never);
      expect(r).toMatchObject({ ok: false, kind: 'forbidden' });
    }
    expect(snapshot(h)).toEqual(before);
  });

  it('a supporting department, the lead department leader and an admin may write', async () => {
    const h = harness();
    const eventId = await h.createEvent(xtdtUser, XTDT, [PTDN]);
    for (const actor of [ptdnUser, xtdtLeader, admin]) expect((await h.run(actor, 'guests.create', { eventId, id: newId<'Guest'>(), draft: draft({ name: actor.profile.fullname }) })).ok).toBe(true);
  });

  it('an outsider reads no roster of the event (department scoping)', async () => {
    const { h, eventId } = await setup();
    expect(await h.roster(ptdnUser, eventId)).toEqual([]);
    expect(await h.roster(xtdtLeader, eventId)).toHaveLength(1);
  });

  it('a pending account is stopped at the gate', async () => {
    const { h, eventId, guest } = await setup();
    const pending = testActor('user', XTDT, { status: 'pending' });
    expect(await h.run(pending, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { notes: 'x' } })).toMatchObject({ ok: false, kind: 'gate' });
  });

  it('every successful guest mutation writes exactly one audit row of its own', async () => {
    const { h, eventId, guest } = await setup();
    const n = h.audits().length;
    const u = await h.ok(xtdtUser, 'guests.update', { eventId, id: guest.id, version: guest.version, patch: { notes: 'n' } });
    await h.ok(xtdtUser, 'guests.markInvited', { eventId, ids: [guest.id], method: 'ems' });
    await h.ok(xtdtUser, 'guests.delete', { eventId, id: guest.id, version: (u.value.version + 1) as Version });
    expect(h.audits().slice(n).map((a) => a.action)).toEqual(['CẬP NHẬT KHÁCH MỜI', 'PHÁT HÀNH GIẤY MỜI', 'XÓA KHÁCH MỜI']);
  });
});
