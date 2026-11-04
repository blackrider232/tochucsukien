// The props the venue screens take, assembled on the server (server/screen-data.ts).

import type { EventId, GuestId, IsoDate } from '@/core/brand';
import type { GuestGroup, RsvpStatus } from '@/core/vocab';
import type { Booth, BoothShift, EventHall, HallTemplate, SeatAssignment } from '../contract';

export type Upstream<T> = { ready: true; value: T } | { ready: false };

/** The part of a roster entry seating shows. */
export interface SeatGuestView {
  id: GuestId;
  name: string;
  title: string;
  organization: string;
  group: GuestGroup;
  rsvpStatus: RsvpStatus;
}

export interface EventRef {
  id: EventId;
  name: string;
  eventDate: IsoDate;
}

export interface SeatingScreenData {
  event: EventRef;
  hall: EventHall | null;
  templates: ReadonlyArray<HallTemplate>;
  seats: ReadonlyArray<SeatAssignment>;
  guests: Upstream<ReadonlyArray<SeatGuestView>>;
  canWrite: boolean;
  canAdminHalls: boolean;
  today: IsoDate;
}

export interface BoothsScreenData {
  event: EventRef;
  booths: ReadonlyArray<Booth>;
  shifts: ReadonlyArray<BoothShift>;
  canWrite: boolean;
  today: IsoDate;
}
