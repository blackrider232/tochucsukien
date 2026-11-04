import { describe, expect, it } from 'vitest';
import { newId, type HHmm, type Instant, type IsoDate } from '@/core/brand';
import { dutyRequiredAt, dutyStatus } from '../domain/duty';
import { desk, harness } from './harness';

const at = (s: string) => s as Instant;

describe('dutyRequiredAt: event opening in Vietnam time minus fieldPresenceHours (m5 §3.3, BUG-18)', () => {
  it.each([
    ['2026-12-15', '08:30', 2, '2026-12-14T23:30:00.000Z'],
    ['2026-12-15', '08:30', 3, '2026-12-14T22:30:00.000Z'],
    ['2026-12-15', '14:00', 2, '2026-12-15T05:00:00.000Z'],
    // Opening just after midnight: the required time is on the previous Vietnamese day.
    ['2027-01-01', '01:00', 2, '2026-12-31T16:00:00.000Z'],
  ])('%s %s, %i h before -> %s', (date, time, hours, expected) => {
    expect(dutyRequiredAt({ eventDate: date as IsoDate, eventTime: time as HHmm }, { fieldPresenceHours: hours })).toBe(expected);
  });
});

describe('dutyStatus', () => {
  const required = at('2026-12-14T23:30:00.000Z');
  it.each([
    [null, { kind: 'pending' }],
    ['2026-12-14T23:00:00.000Z', { kind: 'on_time' }],
    ['2026-12-14T23:30:00.000Z', { kind: 'on_time' }],
    ['2026-12-14T23:30:01.000Z', { kind: 'late', minutes: 1 }],
    ['2026-12-14T23:31:00.000Z', { kind: 'late', minutes: 1 }],
    ['2026-12-14T23:31:01.000Z', { kind: 'late', minutes: 2 }],
    ['2026-12-15T01:30:00.000Z', { kind: 'late', minutes: 120 }],
  ])('arrived %s -> %o', (checkedInAt, expected) => {
    expect(dutyStatus({ checkedInAt: checkedInAt as Instant | null }, required)).toEqual(expected);
  });
});

describe('duty roster commands', () => {
  async function setup(now: string) {
    const h = harness({ now: at(now) });
    const eventId = await h.createEvent({ eventDate: '2026-12-15', eventTime: '08:30' });
    const id = newId<'DutyStaff'>();
    const created = await h.ok(desk, 'live.createDuty', { eventId, id, draft: { name: 'Nguyễn Thị Trực', department: 'Phòng Xúc tiến đầu tư', desk: 1, roleLabel: '' } });
    return { h, eventId, id, version: created.value.version };
  }

  it('điểm danh after the required time is audited as late by the minute, from the server clock', async () => {
    const { h, eventId, id, version } = await setup('2026-12-14T23:42:00.000Z');
    await h.ok(desk, 'live.setDutyPresence', { eventId, id, version, present: true });
    expect((await h.staff(eventId))[0]!.checkedInAt).toBe('2026-12-14T23:42:00.000Z');
    expect(h.audits().at(-1)!.summary).toBe('Điểm danh Nguyễn Thị Trực lúc 06:42, trễ 12 phút so với giờ quy định 06:30');
  });

  it('điểm danh on time says so; its undo clears it, and the undo of that records the time it is redone', async () => {
    const { h, eventId, id, version } = await setup('2026-12-14T23:20:00.000Z');
    const p = await h.ok(desk, 'live.setDutyPresence', { eventId, id, version, present: true });
    expect(h.audits().at(-1)!.summary).toBe('Điểm danh Nguyễn Thị Trực lúc 06:20, đúng giờ quy định (trước 06:30)');
    const cleared = await h.undo(desk, p.inverse);
    expect((await h.staff(eventId))[0]!.checkedInAt).toBeNull();
    h.clock.now = at('2026-12-14T23:50:00.000Z');
    await h.undo(desk, cleared.ok ? cleared.inverse : undefined);
    expect((await h.staff(eventId))[0]!.checkedInAt).toBe('2026-12-14T23:50:00.000Z');
  });

  it('a present staff member cannot be deleted; a pending one can, and the undo restores the assignment', async () => {
    const { h, eventId, id, version } = await setup('2026-12-14T23:20:00.000Z');
    const p = await h.ok(desk, 'live.setDutyPresence', { eventId, id, version, present: true });
    expect(await h.run(desk, 'live.deleteDuty', { eventId, id, version: p.value.version })).toMatchObject({ ok: false, kind: 'invalid' });
    const c = await h.ok(desk, 'live.setDutyPresence', { eventId, id, version: p.value.version, present: false });
    const d = await h.ok(desk, 'live.deleteDuty', { eventId, id, version: c.value.version });
    expect(await h.staff(eventId)).toEqual([]);
    await h.undo(desk, d.inverse);
    expect(await h.staff(eventId)).toMatchObject([{ id, name: 'Nguyễn Thị Trực', desk: 1, checkedInAt: null }]);
  });

  it('edits are version-checked and undoable', async () => {
    const { h, eventId, id, version } = await setup('2026-12-14T23:20:00.000Z');
    const u = await h.ok(desk, 'live.updateDuty', { eventId, id, version, draft: { name: 'Nguyễn Thị Trực', department: 'Phòng Xúc tiến đầu tư', desk: 3, roleLabel: 'Trưởng bàn' } });
    expect(await h.run(desk, 'live.updateDuty', { eventId, id, version, draft: { name: 'X', department: 'Phòng Xúc tiến đầu tư', desk: 2, roleLabel: '' } })).toMatchObject({ ok: false, kind: 'conflict' });
    await h.undo(desk, u.inverse);
    expect((await h.staff(eventId))[0]).toMatchObject({ desk: 1, roleLabel: '' });
  });
});
