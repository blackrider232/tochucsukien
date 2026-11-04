// Contract of feature `guests` (M4a). sce_tcsk_guests is written only by
// guests commands. Seat, check-in and email facts live in their owners' tables
// and are merged at read time in the security_invoker view sce_tcsk_guest_roster.

import type { ContactId, Email, EventId, GuestId, Instant, SeatCode, UserId, Version } from '../core/brand';
import type { RequestContext } from '../core/auth';
import type { CheckinCode } from '../core/checkin-code';
import type { GuestGroup, InviteStatus, RsvpStatus, SendMethod } from '../core/vocab';
import type { Sig } from '../core/commands';

export type RsvpSource = 'manual' | 'google_form' | 'walk_in' | 'import';

export interface Guest {
  id: GuestId;
  eventId: EventId;
  name: string;
  group: GuestGroup;
  title: string;
  organization: string;
  phone: string;
  email: Email | null;
  sendMethod: SendMethod;
  inviteStatus: InviteStatus;
  rsvpStatus: RsvpStatus;
  rsvpSource: RsvpSource;
  /** When rsvpStatus last changed; a form response older than this is ignored (m4a Q5 default). */
  rsvpAt: Instant | null;
  /** Person attending instead; set only when rsvpStatus = 'substituted'. */
  substituteName: string;
  hasBanquet: boolean;
  notes: string;
  checkinCode: CheckinCode;
  masterContactId: ContactId | null;
  version: Version;
  createdAt: Instant;
  createdBy: UserId | null;
  updatedAt: Instant;
}

/** One row per guest of the view sce_tcsk_guest_roster. The read model M4b, M5, M6, comms use. */
export interface RosterEntry extends Guest {
  /** From sce_tcsk_seat_assignments (venue). */
  seatCode: SeatCode | null;
  /** From sce_tcsk_checkins (live). */
  checkedInAt: Instant | null;
  giftGivenAt: Instant | null;
}

/** Name-cards set (m4a §3.7, m4b BUG-32): group VIP, or seated in a zone flagged vipZone. */
export function isNamecardGuest(g: RosterEntry, vipSeat: (code: SeatCode) => boolean): boolean {
  throw new Error('not implemented');
}
/** The one dedupe identity (m4a B41): folded email, else normalized phone, else folded name+organization. */
export function guestIdentityKey(g: Pick<Guest, 'name' | 'organization' | 'email' | 'phone'>): string {
  throw new Error('not implemented');
}
export interface GuestKpis {
  total: number;
  target: number;
  attending: number;
  declined: number;
  substituted: number;
  pending: number;
  /** hasBanquet and not declined (m4a B39). */
  banquet: number;
  seated: number;
}
export function guestKpis(roster: ReadonlyArray<RosterEntry>, targetGuests: number): GuestKpis {
  throw new Error('not implemented');
}

export function readRoster(ctx: RequestContext, eventId: EventId): Promise<ReadonlyArray<RosterEntry>> {
  throw new Error('not implemented');
}

export type GuestDraft = Omit<Guest, 'id' | 'eventId' | 'checkinCode' | 'version' | 'createdAt' | 'createdBy' | 'updatedAt' | 'rsvpAt'>;

declare module '../core/commands' {
  interface CommandMap {
    'guests.create': Sig<{ eventId: EventId; id: GuestId; draft: GuestDraft }, Guest>;
    'guests.update': Sig<{ eventId: EventId; id: GuestId; version: Version; patch: Partial<GuestDraft> }, Guest>;
    'guests.delete': Sig<{ eventId: EventId; id: GuestId; version: Version }, null>;
    /** Asked by comms (form sync). Applies only if respondedAt is newer than rsvpAt; releases seat on decline. */
    'guests.applyRsvp': Sig<
      { eventId: EventId; id: GuestId; status: RsvpStatus; source: RsvpSource; respondedAt: Instant; substituteName?: string; hasBanquet?: boolean },
      { applied: boolean }
    >;
    /** Asked by directory (batch import) and comms (form auto-add). Dedupe by guestIdentityKey. */
    'guests.upsertMany': Sig<
      { eventId: EventId; items: ReadonlyArray<{ id: GuestId; draft: GuestDraft }>; onExisting: 'skip' | 'fill_blanks' },
      { added: number; updated: number; skipped: number }
    >;
    /** Asked by comms after a successful send. */
    'guests.markInvited': Sig<{ eventId: EventId; ids: ReadonlyArray<GuestId>; method: SendMethod }, null>;
  }
}
declare module '../core/permissions' {
  interface PermissionMap {
    'guests.read': true;
    'guests.write': true;
  }
}
