import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { newId, type EventId, type GuestId, type Instant, type UserId, type Version } from '@/core/brand';
import { encodeCheckinPayload } from '@/core/checkin-code';
import { defineTable, memoryDb, type EventScopedRow } from '@/core/db';
import { deterministicIds } from '@/core/legacy';
import { admin, desk, harness } from './harness';

/** A guest row as the legacy importer writes it: the legacy id kept beside the new uuid. */
interface ImportedGuest extends EventScopedRow {
  id: GuestId;
  legacyId: string;
  name: string;
  group: 'VIP';
  organization: string;
}
const importedGuests = defineTable<ImportedGuest>({
  name: 'sce_tcsk_guests',
  owner: 'guests',
  eventScoped: true,
  columns: { group: 'guest_group' },
  row: z.object({
    id: z.string().transform((v) => v as GuestId), eventId: z.string().transform((v) => v as EventId), legacyId: z.string(), name: z.string(), group: z.literal('VIP'), organization: z.string(),
    version: z.number().transform((v) => v as Version), createdAt: z.string().transform((v) => v as Instant), createdBy: z.string().nullable().transform((v) => v as UserId | null),
    updatedAt: z.string().transform((v) => v as Instant), updatedBy: z.string().nullable().transform((v) => v as UserId | null),
  }),
});

async function setup() {
  const h = harness();
  const eventId = await h.createEvent();
  const an = await h.addGuest(eventId, { name: 'Nguyễn Văn An', phone: '0913.210.001' });
  const binh = await h.addGuest(eventId, { name: 'Trần Văn Bình', phone: '0913 210 002' });
  const scan = async (raw: string) => {
    const r = await h.ok(desk, 'live.scan', { eventId, raw });
    return r.value;
  };
  return { h, eventId, an, binh, scan };
}

describe('live.scan: every matchScan outcome against the live roster (m5 BUG-06, BUG-07)', () => {
  it('ok for the canonical payload of this event, already once checked in', async () => {
    const { h, eventId, an, scan } = await setup();
    expect(await scan(encodeCheckinPayload(eventId, an.id))).toMatchObject({ kind: 'ok', guest: { id: an.id } });
    await h.ok(desk, 'live.checkIn', { eventId, guestId: an.id, desk: null });
    expect(await scan(encodeCheckinPayload(eventId, an.id))).toMatchObject({ kind: 'already', guest: { id: an.id } });
  });

  it('other_event, with the event name when the actor can see it, for a payload of another event', async () => {
    const { h, scan } = await setup();
    const elsewhere = await h.createEvent();
    const there = await h.addGuest(elsewhere, { name: 'Khách sự kiện khác' });
    expect(await scan(encodeCheckinPayload(elsewhere, there.id))).toEqual({ kind: 'other_event', eventName: 'Hội nghị Xúc tiến Đầu tư 2026' });
  });

  it('not_found for an unknown guest of this event, and for a short or partial code: never a suffix match', async () => {
    const { eventId, an, scan } = await setup();
    expect(await scan(encodeCheckinPayload(eventId, newId<'Guest'>()))).toEqual({ kind: 'not_found' });
    for (const raw of ['1', '01', an.checkinCode.slice(1), an.checkinCode.slice(0, 5), an.id.slice(-6), 'Nguyễn']) {
      expect(await scan(raw), raw).toEqual({ kind: 'not_found' });
    }
  });

  it('matches a typed human code exactly, in any case and with O read as 0', async () => {
    const { an, scan } = await setup();
    expect(await scan(an.checkinCode)).toMatchObject({ kind: 'ok', guest: { id: an.id } });
    expect(await scan(` ${an.checkinCode.toLowerCase().replace(/0/g, 'o')} `)).toMatchObject({ kind: 'ok', guest: { id: an.id } });
  });

  it('matches a normalized phone exactly, and lists both guests when two share it', async () => {
    const { h, eventId, an, scan } = await setup();
    expect(await scan('0913210001')).toMatchObject({ kind: 'ok', guest: { id: an.id } });
    expect(await scan('091321000')).toEqual({ kind: 'not_found' });
    await h.addGuest(eventId, { name: 'Phạm Thị Cúc', phone: '0913-210-001' });
    const r = await scan('0913.210.001');
    expect(r.kind).toBe('ambiguous');
    expect(r.kind === 'ambiguous' && r.candidates.map((g) => g.name).sort()).toEqual(['Nguyễn Văn An', 'Phạm Thị Cúc']);
  });

  it('resolves a badge printed by the legacy app through the imported ids, and only in its own event', async () => {
    const h = harness();
    const legacyEventId = 'evt_1710000000000';
    const eventId = deterministicIds.eventId(legacyEventId);
    await h.ok(admin, 'progress.createEvent', {
      id: eventId,
      draft: { name: 'Hội nghị cũ', type: 'hoi_nghi', eventDate: '2026-12-15' as never, eventTime: '08:30' as never, location: '', department: 'Phòng Xúc tiến đầu tư', supportingDepartments: [], leadPerson: '', budget: null, targetGuests: 10, note: '', applyStandardTemplate: false },
    });
    const guestId = deterministicIds.idFor('Guest', 'gst_1710000000001_ab12', legacyEventId);
    await memoryDb(h.seed, admin).table(importedGuests).insert({ id: guestId, eventId, legacyId: 'gst_1710000000001_ab12', name: 'Khách nhập từ bản cũ', group: 'VIP', organization: '' });
    const scan = async (raw: string, at: EventId = eventId) => (await h.ok(desk, 'live.scan', { eventId: at, raw })).value;
    expect(await scan(`SCE-CHK:${legacyEventId}:gst_1710000000001_ab12`)).toMatchObject({ kind: 'ok', guest: { id: guestId } });
    expect(await scan(`SCE-CHECKIN:gst_1710000000001_ab12:Khach:${legacyEventId}`)).toMatchObject({ kind: 'ok', guest: { id: guestId } });
    expect(await scan(`SCE-CHK:${legacyEventId}:gst_unknown`)).toEqual({ kind: 'not_found' });
    const today = await h.createEvent();
    expect(await scan(`SCE-CHK:${legacyEventId}:gst_1710000000001_ab12`, today)).toEqual({ kind: 'other_event', eventName: 'Hội nghị cũ' });
  });

  it('is a query: it writes no audit', async () => {
    const { h, eventId, an, scan } = await setup();
    const before = h.audits().length;
    await scan(encodeCheckinPayload(eventId, an.id));
    expect(h.audits()).toHaveLength(before);
  });
});
