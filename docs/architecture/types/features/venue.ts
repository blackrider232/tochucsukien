// Contract of feature `venue` (M4b): hall catalog, the event's hall, seating,
// booths, booth duty shifts. The single source of truth for hall/zone/seat:
// EventHall.zones define the seat codes; sce_tcsk_seat_assignments is the only
// seat <-> guest relation, unique on (event, seat) and on (event, guest).
// Seating UI, guest table, name cards, live check-in, walk-in and the hall
// monitor all call the functions below (m4b BUG-06, m5 BUG-19).

import type { BoothId, BoothShiftId, EventId, GuestId, HallTemplateId, IsoDate, SeatCode, UserId, Version } from '../core/brand';
import type { RequestContext } from '../core/auth';
import type { DepartmentName, GuestGroup } from '../core/vocab';
import type { Sig } from '../core/commands';

export type ZoneColor = 'red' | 'blue' | 'emerald' | 'purple' | 'slate';

export interface HallZone {
  /** Stable within a hall; letter-derived ('A', 'B', …). */
  key: string;
  name: string;
  /** 'A-'. Unique within a hall (validated by validateZones). */
  prefix: string;
  /** 1..500. */
  seatCount: number;
  color: ZoneColor;
  assignedGroup: GuestGroup | 'all';
  /** Seats here qualify for VIP name cards (replaces the 'A-' prefix heuristic). */
  vipZone: boolean;
}

export interface HallTemplate {
  id: HallTemplateId;
  name: string;
  location: string;
  description: string;
  zones: ReadonlyArray<HallZone>;
  version: Version;
}

export interface EventHall {
  eventId: EventId;
  /** Template the zones were copied from; null after manual edits diverge or template deleted. */
  templateId: HallTemplateId | null;
  zones: ReadonlyArray<HallZone>;
  version: Version;
}

export interface SeatAssignment {
  eventId: EventId;
  seatCode: SeatCode;
  guestId: GuestId;
}

export type ZoneProblem = { kind: 'duplicate_prefix'; prefix: string } | { kind: 'seat_count'; key: string } | { kind: 'empty' };
export function validateZones(zones: ReadonlyArray<HallZone>): ReadonlyArray<ZoneProblem> {
  throw new Error('not implemented');
}
export function hallCapacity(zones: ReadonlyArray<HallZone>): number {
  throw new Error('not implemented');
}
export function seatCodes(zone: HallZone): ReadonlyArray<SeatCode> {
  throw new Error('not implemented');
}
export function zoneOfSeat(hall: EventHall, code: SeatCode): HallZone | null {
  throw new Error('not implemented');
}
/** Zone with assignedGroup = group, then 'all', then any zone; first free code in zone order. */
export function findFreeSeat(hall: EventHall, taken: ReadonlySet<SeatCode>, group: GuestGroup): SeatCode | null {
  throw new Error('not implemented');
}
/** Assignments whose seat no longer exists in the hall (after shrink or hall change). */
export function orphanSeats(hall: EventHall, seats: ReadonlyArray<SeatAssignment>): ReadonlyArray<SeatAssignment> {
  throw new Error('not implemented');
}
export interface ZoneOccupancy {
  zone: HallZone;
  seats: number;
  assigned: number;
  arrived: number;
}
export function zoneOccupancy(hall: EventHall, seats: ReadonlyArray<SeatAssignment>, arrived: ReadonlySet<GuestId>): ReadonlyArray<ZoneOccupancy> {
  throw new Error('not implemented');
}

export function readEventHall(ctx: RequestContext, eventId: EventId): Promise<EventHall | null> {
  throw new Error('not implemented');
}
export function readSeating(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<SeatAssignment>> {
  throw new Error('not implemented');
}

export type BoothStatus = 'available' | 'reviewing' | 'confirmed';
export type SubsidyPercent = 0 | 50 | 100;
export interface Booth {
  id: BoothId;
  eventId: EventId;
  /** 'A01'; unique per event; row = leading letters. */
  code: string;
  size: string;
  /** Required unless status = available (m4b BUG-21). */
  company: string;
  products: string;
  subsidyPercent: SubsidyPercent;
  status: BoothStatus;
  contact: string;
  staff: string;
  version: Version;
}
export interface BoothShift {
  id: BoothShiftId;
  eventId: EventId;
  shiftDate: IsoDate;
  shiftLabel: string;
  officerName: string;
  officerUserId: UserId | null;
  department: DepartmentName;
  phone: string;
  zone: string;
  version: Version;
}
export interface BoothKpis {
  total: number;
  confirmed: number;
  reviewing: number;
  available: number;
  fullSubsidy: number;
  halfSubsidy: number;
}
export function boothKpis(booths: ReadonlyArray<Booth>): BoothKpis {
  throw new Error('not implemented');
}
export function readBooths(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<Booth>> {
  throw new Error('not implemented');
}

declare module '../core/commands' {
  interface CommandMap {
    /** Asked by live (walk-in). Idempotent: same guest+seat is a no-op. */
    'venue.assignSeat': Sig<{ eventId: EventId; guestId: GuestId; seatCode: SeatCode | 'auto' }, SeatAssignment | null>;
    /** Asked by guests (RSVP declined). No-op when the guest has no seat. */
    'venue.releaseGuestSeat': Sig<{ eventId: EventId; guestId: GuestId }, null>;
  }
}
declare module '../core/permissions' {
  interface PermissionMap {
    'venue.seating.read': true;
    'venue.seating.write': true;
    'venue.booths.read': true;
    'venue.booths.write': true;
    'venue.halls.read': true;
    'venue.halls.admin': true;
  }
}
