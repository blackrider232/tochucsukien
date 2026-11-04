// Pure selectors of the reception desk: the search and filters, the header
// KPIs, the hall monitor and the car-pass list. Every number on the live
// screens comes from here.

import type { GuestId, Instant, SeatCode } from '@/core/brand';
import { formatVNTime, todayVN } from '@/core/dates';
import { matchesQuery } from '@/core/text';
import { isAttending, type GuestGroup } from '@/core/vocab';
import type { RosterEntry } from '@/features/guests';
import { seatCodes, zoneOccupancy, zoneOfSeat, type EventHall, type HallZone, type SeatAssignment, type ZoneOccupancy } from '@/features/venue';
import type { DutyStaff, Incident } from '../contract';
import { isOpenIncident } from './incidents';

export type CheckinStatusFilter = 'all' | 'checked_in' | 'not_yet';
export interface DeskFilter {
  q: string;
  status: CheckinStatusFilter;
  group: GuestGroup | 'all';
}
export const NO_DESK_FILTER: DeskFilter = { q: '', status: 'all', group: 'all' };

/**
 * Tone-insensitive search over what staff read off a guest (BUG-44). The printed check-in code is not searched by
 * substring: a typed code is matched exactly by the scanner path instead (m5 BUG-06).
 */
export function filterDesk(roster: ReadonlyArray<RosterEntry>, f: DeskFilter): RosterEntry[] {
  return roster.filter(
    (g) =>
      (f.group === 'all' || g.group === f.group) &&
      (f.status === 'all' || (f.status === 'checked_in') === (g.checkedInAt !== null)) &&
      matchesQuery(f.q, g.name, g.title, g.organization, g.phone, g.seatCode, g.substituteName),
  );
}

export interface LiveKpis {
  checkedIn: number;
  target: number;
  /** checkedIn / target, rounded; 0 without a target. */
  percent: number;
  attending: number;
  /** Attending guests not checked in yet (BUG-04: not attending minus everyone checked in). */
  awaited: number;
  vipCheckedIn: number;
  /** VIP guests who have not declined. */
  vipExpected: number;
  otherCheckedIn: number;
  /** Gifts handed to guests who are checked in (BUG-30). */
  gifts: number;
  openIncidents: number;
  urgentOpen: number;
  staffPresent: number;
  staffTotal: number;
}

export function liveKpis(roster: ReadonlyArray<RosterEntry>, targetGuests: number, staff: ReadonlyArray<DutyStaff>, incidents: ReadonlyArray<Incident>): LiveKpis {
  const arrived = roster.filter((g) => g.checkedInAt !== null);
  const vipArrived = arrived.filter((g) => g.group === 'VIP').length;
  const open = incidents.filter(isOpenIncident);
  return {
    checkedIn: arrived.length,
    target: targetGuests,
    percent: targetGuests > 0 ? Math.round((arrived.length / targetGuests) * 100) : 0,
    attending: roster.filter((g) => isAttending(g.rsvpStatus)).length,
    awaited: roster.filter((g) => isAttending(g.rsvpStatus) && g.checkedInAt === null).length,
    vipCheckedIn: vipArrived,
    vipExpected: roster.filter((g) => g.group === 'VIP' && g.rsvpStatus !== 'declined').length,
    otherCheckedIn: arrived.length - vipArrived,
    gifts: arrived.filter((g) => g.giftGivenAt !== null).length,
    openIncidents: open.length,
    urgentOpen: open.filter((i) => i.urgency === 'high').length,
    staffPresent: staff.filter((s) => s.checkedInAt !== null).length,
    staffTotal: staff.length,
  };
}

export type SeatTile =
  | { code: SeatCode; state: 'empty' }
  | { code: SeatCode; state: 'waiting'; guest: RosterEntry | null }
  | { code: SeatCode; state: 'arrived'; guest: RosterEntry; at: Instant };

export interface MonitorZone extends ZoneOccupancy {
  tiles: ReadonlyArray<SeatTile>;
}

/** Every zone of the event's hall with its real seats (decision 19, BUG-19); no lounge state (decision 11, BUG-22). */
export function monitorZones(hall: Pick<EventHall, 'zones'>, seats: ReadonlyArray<SeatAssignment>, roster: ReadonlyArray<RosterEntry>): MonitorZone[] {
  const byId = new Map(roster.map((g) => [g.id, g]));
  const arrived = new Set<GuestId>(roster.flatMap((g) => (g.checkedInAt ? [g.id] : [])));
  const occupant = new Map(seats.map((s) => [s.seatCode, s.guestId]));
  return zoneOccupancy(hall, seats, arrived).map((o) => ({
    ...o,
    tiles: seatCodes(o.zone).map((code): SeatTile => {
      const guestId = occupant.get(code);
      if (!guestId) return { code, state: 'empty' };
      const guest = byId.get(guestId) ?? null;
      return guest?.checkedInAt ? { code, state: 'arrived', guest, at: guest.checkedInAt } : { code, state: 'waiting', guest };
    }),
  }));
}

/** 'Khu A: Đại biểu VIP, ghế A-04', or the bare code for a seat the hall no longer has. */
export function seatLabel(hall: Pick<EventHall, 'zones'> | null, code: SeatCode): string {
  const zone: HallZone | null = hall ? zoneOfSeat(hall, code) : null;
  return zone ? `${zone.name}, ghế ${code}` : `Ghế ${code}`;
}

/** 'HH:mm' in Vietnam time, with the date when it is not the same VN day as `now` (BUG-29: multi-day fairs). */
export const formatAt = (at: Instant, now: Instant) => (todayVN(at) === todayVN(now) ? formatVNTime(at) : formatVNTime(at, { withDate: true }));

/** One pass per VIP guest who has not declined (m5 §3.7, BUG-32). */
export const carPassGuests = (roster: ReadonlyArray<RosterEntry>) => roster.filter((g) => g.group === 'VIP' && g.rsvpStatus !== 'declined');
