// The table guests owns (0002_domain_tables.sql), and read-only shapes of the
// two tables the roster view sce_tcsk_guest_roster joins.

import { z } from 'zod';
import type { ContactId, Email, EventId, GuestId, Instant, SeatCode, UserId, Version } from '@/core/brand';
import { parseCheckinCode, type CheckinCode } from '@/core/checkin-code';
import { parseInstant } from '@/core/dates';
import { defineTable, type BaseRow } from '@/core/db';
import { parseEmail } from '@/core/text';
import type { Guest } from '../contract';
import { GUEST_GROUP_VALUES, INVITE_VALUES, RSVP_SOURCE_VALUES, RSVP_VALUES, SEND_METHOD_VALUES } from '../domain/schemas';

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);
const managed = {
  version: z.number().transform((v) => v as Version),
  createdAt: instant,
  createdBy: z.string().nullable().transform((v) => v as UserId | null),
  updatedAt: instant,
  updatedBy: z.string().nullable().transform((v) => v as UserId | null),
};
const eventId = z.string().transform((v) => v as EventId);
const guestId = z.string().transform((v) => v as GuestId);

/** `legacyId` is the importer's key (unique per event); live maps old printed badges through it. */
export type GuestRow = Guest & BaseRow & { id: GuestId; legacyId: string | null };
export const guestsTable = defineTable<GuestRow>({
  name: 'sce_tcsk_guests',
  owner: 'guests',
  eventScoped: true,
  columns: { group: 'guest_group' },
  // A batch import shares one transaction timestamp, so its rows fall back to name order rather than id order.
  orderBy: [{ column: 'createdAt', ascending: true }, { column: 'name', ascending: true }],
  row: z.object({
    ...managed,
    id: guestId,
    eventId,
    legacyId: z.string().nullable(),
    name: z.string(),
    group: z.enum(GUEST_GROUP_VALUES),
    title: z.string(),
    organization: z.string(),
    phone: z.string(),
    email: z.string().nullable().transform((v) => (v === null ? null : ((parseEmail(v) ?? v) as Email))),
    sendMethod: z.enum(SEND_METHOD_VALUES),
    inviteStatus: z.enum(INVITE_VALUES),
    rsvpStatus: z.enum(RSVP_VALUES),
    rsvpSource: z.enum(RSVP_SOURCE_VALUES),
    rsvpAt: instant.nullable(),
    substituteName: z.string(),
    hasBanquet: z.boolean(),
    notes: z.string(),
    checkinCode: z.string().transform((v) => (parseCheckinCode(v) ?? v) as CheckinCode),
    masterContactId: z.string().nullable().transform((v) => v as ContactId | null),
  }),
});

// The roster view is a security_invoker join of guests, seats (venue) and check-ins (live). The memory Db that tests and
// `SCE_DEV_MEMORY=1` run on does not emulate views, so readRoster performs the same left join over these two read-only
// shapes, each under its owner's RLS exactly as the view is. Nothing here writes them.
export interface SeatRow extends BaseRow {
  id: string;
  eventId: EventId;
  guestId: GuestId;
  seatCode: SeatCode;
}
export const seatsTable = defineTable<SeatRow>({
  name: 'sce_tcsk_seat_assignments',
  owner: 'venue',
  eventScoped: true,
  row: z.object({ ...managed, id: z.string(), eventId, guestId, seatCode: z.string().transform((v) => v as SeatCode) }),
});

export interface CheckinRow extends BaseRow {
  id: string;
  eventId: EventId;
  guestId: GuestId;
  checkedInAt: Instant | null;
  giftGivenAt: Instant | null;
}
export const checkinsTable = defineTable<CheckinRow>({
  name: 'sce_tcsk_checkins',
  owner: 'live',
  eventScoped: true,
  row: z.object({ ...managed, id: z.string(), eventId, guestId, checkedInAt: instant.nullable(), giftGivenAt: instant.nullable() }),
});
