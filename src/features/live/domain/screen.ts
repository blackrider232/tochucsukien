// What the live screens and the car-pass print receive from the server.

import type { EventId, HHmm, Instant, IsoDate } from '@/core/brand';
import type { RosterEntry } from '@/features/guests';
import type { EventHall, SeatAssignment } from '@/features/venue';
import type { DutyStaff, Incident } from '../contract';

export type LiveTab = 'checkin' | 'duty' | 'incidents' | 'monitor';

export interface LiveScreenData {
  event: { id: EventId; name: string; eventDate: IsoDate; eventTime: HHmm; location: string; targetGuests: number };
  roster: ReadonlyArray<RosterEntry>;
  /** null when the event has no hall yet (venue). */
  hall: EventHall | null;
  seats: ReadonlyArray<SeatAssignment>;
  staff: ReadonlyArray<DutyStaff>;
  incidents: ReadonlyArray<Incident>;
  /** Event opening minus fieldPresenceHours (the 2-hour rule). */
  requiredAt: Instant;
  /** Server time of this render; the screens format "today" against it. */
  now: Instant;
  /** UI hiding only; the commands and RLS decide. */
  can: { checkIn: boolean; manage: boolean; walkIn: boolean };
}
