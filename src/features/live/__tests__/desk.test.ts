import { describe, expect, it } from 'vitest';
import type { GuestId, Instant, SeatCode } from '@/core/brand';
import type { RosterEntry } from '@/features/guests';
import { hallCapacity, type SeatAssignment } from '@/features/venue';
import type { DutyStaff, Incident } from '../contract';
import { carPassGuests, filterDesk, liveKpis, monitorZones, NO_DESK_FILTER } from '../domain/desk';
import { ZONES } from './harness';

const AT = '2026-12-15T01:00:00.000Z' as Instant;
let n = 0;
const g = (over: Partial<RosterEntry>): RosterEntry =>
  ({ id: `g-${++n}` as GuestId, name: `Khách ${n}`, title: '', organization: '', phone: '', group: 'DoanhNghiep', rsvpStatus: 'confirmed', rsvpSource: 'manual', substituteName: '', seatCode: null, checkedInAt: null, giftGivenAt: null, checkinCode: 'ABCDEF', ...over }) as RosterEntry;

describe('liveKpis', () => {
  const roster = [
    g({ group: 'VIP', checkedInAt: AT, giftGivenAt: AT }),
    g({ group: 'VIP', rsvpStatus: 'declined' }),
    g({ group: 'VIP' }),
    g({ rsvpStatus: 'substituted' }),
    g({ rsvpStatus: 'pending', checkedInAt: AT }),
    g({ rsvpSource: 'walk_in', checkedInAt: AT, giftGivenAt: AT }),
    g({ rsvpStatus: 'declined', checkedInAt: AT }),
  ];
  const staff = [{ checkedInAt: AT }, { checkedInAt: null }] as DutyStaff[];
  const incidents = [{ status: 'open', urgency: 'high' }, { status: 'in_progress', urgency: 'low' }, { status: 'resolved', urgency: 'high' }] as Incident[];
  const k = liveKpis(roster, 8, staff, incidents);

  it('counts the guests still awaited as attending and not checked in, not attending minus everyone checked in (m5 BUG-04)', () => {
    expect(k).toMatchObject({ checkedIn: 4, target: 8, percent: 50, attending: 4, awaited: 2 });
  });
  it('splits VIP from the rest, excludes declined VIPs from the expected VIPs, and counts gifts among those checked in', () => {
    expect(k).toMatchObject({ vipCheckedIn: 1, vipExpected: 2, otherCheckedIn: 3, gifts: 2 });
  });
  it('counts open incidents, urgent ones among them, and the staff present', () => {
    expect(k).toMatchObject({ openIncidents: 2, urgentOpen: 1, staffPresent: 1, staffTotal: 2 });
  });
});

describe('monitorZones against the venue hall model (decision 19, m5 BUG-19)', () => {
  it('shows every zone with its real seat count and the state of each seat', () => {
    const seated = g({ seatCode: 'B-02' as SeatCode });
    const arrived = g({ seatCode: 'C-04' as SeatCode, checkedInAt: AT });
    const seats: SeatAssignment[] = [
      { eventId: '' as never, seatCode: 'B-02' as SeatCode, guestId: seated.id },
      { eventId: '' as never, seatCode: 'C-04' as SeatCode, guestId: arrived.id },
      { eventId: '' as never, seatCode: 'Z-01' as SeatCode, guestId: g({}).id },
    ];
    const zones = monitorZones({ zones: ZONES }, seats, [seated, arrived]);
    expect(zones.map((z) => [z.zone.key, z.seats, z.assigned, z.arrived])).toEqual([['A', 2, 0, 0], ['B', 3, 1, 0], ['C', 4, 1, 1]]);
    expect(zones.reduce((s, z) => s + z.tiles.length, 0)).toBe(hallCapacity(ZONES));
    expect(zones[1]!.tiles[1]).toMatchObject({ code: 'B-02', state: 'waiting', guest: { id: seated.id } });
    expect(zones[2]!.tiles[3]).toMatchObject({ code: 'C-04', state: 'arrived', at: AT });
    expect(zones[0]!.tiles.every((t) => t.state === 'empty')).toBe(true);
  });
});

describe('desk search and the car-pass list', () => {
  it('folds tones, and never matches the printed code by substring (m5 BUG-06, BUG-44)', () => {
    const roster = [g({ name: 'Nguyễn Văn Ánh', checkinCode: 'K7Q2ZX' as never }), g({ name: 'Trần Bình' })];
    expect(filterDesk(roster, { ...NO_DESK_FILTER, q: 'nguyen van anh' }).map((x) => x.name)).toEqual(['Nguyễn Văn Ánh']);
    expect(filterDesk(roster, { ...NO_DESK_FILTER, q: 'K7Q2' })).toEqual([]);
  });
  it('filters by check-in state and group', () => {
    const roster = [g({ checkedInAt: AT, group: 'VIP' }), g({}), g({ group: 'VIP' })];
    expect(filterDesk(roster, { q: '', status: 'not_yet', group: 'VIP' })).toHaveLength(1);
    expect(filterDesk(roster, { q: '', status: 'checked_in', group: 'all' })).toHaveLength(1);
  });
  it('prints a car pass for each VIP who has not declined (m5 BUG-32)', () => {
    const roster = [g({ group: 'VIP' }), g({ group: 'VIP', rsvpStatus: 'declined' }), g({ group: 'QuocTe' })];
    expect(carPassGuests(roster)).toHaveLength(1);
  });
});
