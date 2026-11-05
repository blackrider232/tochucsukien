// What the guest screens and print sheets receive from the server.

import type { EventId, HHmm, IsoDate, SeatCode } from '@/core/brand';
import type { DepartmentName } from '@/core/vocab';
import type { MasterContact } from '@/features/directory';
import type { RosterEntry } from '../contract';

export interface GuestScreenData {
  event: { id: EventId; name: string; eventDate: IsoDate; eventTime: HHmm; location: string; department: DepartmentName; targetGuests: number };
  roster: ReadonlyArray<RosterEntry>;
  /** Seat codes of the roster that lie in a hall zone flagged vipZone (venue); empty until venue has a hall for the event. */
  vipSeats: ReadonlyArray<SeatCode>;
  /** UI hiding only; the commands and RLS decide. */
  canWrite: boolean;
  /** venue.seating.read on the event: the seat code links to the seating chart only for those who can open it. */
  canSeeSeating: boolean;
  /** directory.read: the add form offers the directory lookup, and the toolbar the batch copy (with canWrite). */
  canReadDirectory: boolean;
  /** The directory, loaded only for the batch copy (`?import=1`) so the list is not shipped with every visit; null otherwise. */
  directoryContacts: ReadonlyArray<MasterContact> | null;
}

/** The four KPI pop-ups, also reachable as ?popup=<id>. */
export type KpiPopup = 'all' | 'confirmed' | 'print' | 'banquet';
export const KPI_POPUPS: ReadonlyArray<KpiPopup> = ['all', 'confirmed', 'print', 'banquet'];
