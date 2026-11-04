import { describe, expect, it } from 'vitest';
import { newId, type Version } from '@/core/brand';
import type { CommandId, InputOf } from '@/core/commands';
import { testActor, XTDT } from '@/core/testing/actors';
import { admin, desk, harness, other } from './harness';

const TABLES = ['sce_tcsk_checkins', 'sce_tcsk_checkin_undo_tokens', 'sce_tcsk_duty_staff', 'sce_tcsk_incidents', 'sce_tcsk_guests', 'sce_tcsk_seat_assignments'];

async function setup() {
  const h = harness();
  const eventId = await h.createEvent();
  await h.setHall(eventId);
  const guest = await h.addGuest(eventId, { name: 'Khách thử quyền' });
  const checked = await h.addGuest(eventId, { name: 'Khách đã đến', organization: 'Đơn vị B' });
  const c = await h.ok(admin, 'live.checkIn', { eventId, guestId: checked.id, desk: null });
  await h.ok(admin, 'live.setGift', { eventId, guestId: checked.id, given: true });
  const staff = await h.ok(admin, 'live.createDuty', { eventId, id: newId<'DutyStaff'>(), draft: { name: 'Cán bộ', department: XTDT, desk: 2, roleLabel: '' } });
  const incident = await h.ok(admin, 'live.createIncident', { eventId, id: newId<'Incident'>(), draft: { location: 'Sảnh', urgency: 'low', description: 'Thử', assignee: '' } });
  const at = c.value.checkIn.checkedInAt!;
  const v = 1 as Version;
  const calls: { [K in CommandId as K extends `live.${string}` ? K : never]: InputOf<K> } = {
    'live.checkIn': { eventId, guestId: guest.id, desk: null },
    'live.checkInDeclined': { eventId, guestId: guest.id, desk: null },
    'live.cancelCheckIn': { eventId, guestId: checked.id },
    'live.undoCheckIn': { eventId, guestId: checked.id, checkedInAt: at },
    'live.restoreCheckIn': { eventId, guestId: guest.id, tokenId: newId<'CheckinUndoToken'>() },
    'live.setGift': { eventId, guestId: checked.id, given: false },
    'live.scan': { eventId, raw: guest.checkinCode },
    'live.walkIn': { eventId, guestId: newId<'Guest'>(), guest: { name: 'Khách mới', group: 'BaoChi', title: '', organization: 'Báo', phone: '', hasBanquet: false }, zoneKey: null, confirmVipZone: false, giftGiven: false, allowDuplicate: false, desk: null },
    'live.undoWalkIn': { eventId, guestId: checked.id, checkedInAt: at, guestVersion: v },
    'live.checkInSubstitute': { eventId, guestId: guest.id, version: guest.version, substituteName: 'Người thay', giftGiven: false, confirmDeclined: false, desk: null },
    'live.undoSubstitute': { eventId, guestId: checked.id, checkedInAt: at, guestVersion: v, rsvpStatus: 'confirmed', substituteName: '' },
    'live.createDuty': { eventId, id: newId<'DutyStaff'>(), draft: { name: 'Cán bộ 2', department: XTDT, desk: 1, roleLabel: '' } },
    'live.updateDuty': { eventId, id: staff.value.id, version: staff.value.version, draft: { name: 'Đổi', department: XTDT, desk: 3, roleLabel: '' } },
    'live.deleteDuty': { eventId, id: staff.value.id, version: staff.value.version },
    'live.setDutyPresence': { eventId, id: staff.value.id, version: staff.value.version, present: true },
    'live.createIncident': { eventId, id: newId<'Incident'>(), draft: { location: 'Sảnh', urgency: 'high', description: 'Mới', assignee: '' } },
    'live.updateIncident': { eventId, id: incident.value.id, version: incident.value.version, draft: { location: 'Sảnh', urgency: 'high', description: 'Sửa', assignee: '' } },
    'live.setIncidentStatus': { eventId, id: incident.value.id, version: incident.value.version, status: 'resolved', note: '' },
    'live.deleteIncident': { eventId, id: incident.value.id, version: incident.value.version },
  };
  return { h, eventId, calls };
}

const snapshot = (h: ReturnType<typeof harness>) => JSON.stringify([...TABLES, 'sce_tcsk_audit_logs'].map((t) => h.rows(t)));

describe('every live command checks its permission on the event itself', () => {
  it('refuses a user of an unrelated department, with RLS bypassed, and changes nothing', async () => {
    const { h, calls } = await setup();
    const before = snapshot(h);
    for (const [id, input] of Object.entries(calls)) {
      const r = await h.runWithoutRls(other, id as CommandId, input as never);
      expect(r, id).toMatchObject({ ok: false, kind: 'forbidden' });
    }
    expect(snapshot(h)).toBe(before);
  });

  it('refuses them through the emulated RLS as well', async () => {
    const { h, calls } = await setup();
    const before = snapshot(h);
    for (const [id, input] of Object.entries(calls)) {
      const r = await h.run(other, id as CommandId, input as never);
      expect(r.ok, id).toBe(false);
    }
    expect(snapshot(h)).toBe(before);
  });

  it('refuses a pending account at the gate', async () => {
    const { h, calls } = await setup();
    const r = await h.runWithoutRls(testActor('user', XTDT, { status: 'pending' }), 'live.checkIn', calls['live.checkIn']);
    expect(r).toMatchObject({ ok: false, kind: 'gate' });
  });

  it('lets a chuyên viên of the lead department check in, assign duty and report incidents', async () => {
    const { h, calls } = await setup();
    for (const id of ['live.checkIn', 'live.scan', 'live.walkIn', 'live.createDuty', 'live.createIncident', 'live.setGift'] as const) {
      expect(await h.run(desk, id, calls[id] as never), id).toMatchObject({ ok: true });
    }
  });
});

