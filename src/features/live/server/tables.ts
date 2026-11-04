// The tables live owns (0002_domain_tables.sql, 202611041500). A check-in is its own
// row, unique on (event, guest): desks write it without touching the guest.

import { z } from 'zod';
import type { DutyStaffId, EventId, GuestId, IncidentId, Instant, UserId, Version } from '@/core/brand';
import { parseInstant } from '@/core/dates';
import { defineTable, type BaseRow } from '@/core/db';
import type { DepartmentName } from '@/core/vocab';
import type { DutyDesk, DutyStaff, Incident } from '../contract';
import { INCIDENT_STATUS_VALUES, URGENCY_VALUES, type UndoTokenId } from '../domain/schemas';

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);
const managed = {
  version: z.number().transform((v) => v as Version),
  createdAt: instant,
  createdBy: z.string().nullable().transform((v) => v as UserId | null),
  updatedAt: instant,
  updatedBy: z.string().nullable().transform((v) => v as UserId | null),
};
const eventId = z.string().transform((v) => v as EventId);

export interface CheckinRow extends BaseRow {
  id: string;
  eventId: EventId;
  guestId: GuestId;
  checkedInAt: Instant | null;
  checkedInBy: UserId | null;
  desk: string | null;
  giftGivenAt: Instant | null;
}
export const checkinsTable = defineTable<CheckinRow>({
  name: 'sce_tcsk_checkins',
  owner: 'live',
  eventScoped: true,
  row: z.object({
    ...managed,
    id: z.string(),
    eventId,
    guestId: z.string().transform((v) => v as GuestId),
    checkedInAt: instant.nullable(),
    checkedInBy: z.string().nullable().transform((v) => v as UserId | null),
    desk: z.string().nullable(),
    giftGivenAt: instant.nullable(),
  }),
});

/** A removed check-in kept for one undo (202611041500_live_checkin_undo_tokens.sql). */
export interface UndoTokenRow extends BaseRow {
  id: UndoTokenId;
  eventId: EventId;
  guestId: GuestId;
  checkedInAt: Instant;
  checkedInBy: UserId | null;
  desk: string | null;
  giftGivenAt: Instant | null;
  /** The guest had declined and was checked in all the same: the decision-7 confirmation was already given. */
  declinedConfirmed: boolean;
  expiresAt: Instant;
  consumedAt: Instant | null;
  consumedBy: UserId | null;
}
export const undoTokensTable = defineTable<UndoTokenRow>({
  name: 'sce_tcsk_checkin_undo_tokens',
  owner: 'live',
  eventScoped: true,
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as UndoTokenId),
    eventId,
    guestId: z.string().transform((v) => v as GuestId),
    checkedInAt: instant,
    checkedInBy: z.string().nullable().transform((v) => v as UserId | null),
    desk: z.string().nullable(),
    giftGivenAt: instant.nullable(),
    declinedConfirmed: z.boolean(),
    expiresAt: instant,
    consumedAt: instant.nullable(),
    consumedBy: z.string().nullable().transform((v) => v as UserId | null),
  }),
});

export type DutyRow = DutyStaff & BaseRow & { legacyId: string | null };
export const dutyStaffTable = defineTable<DutyRow>({
  name: 'sce_tcsk_duty_staff',
  owner: 'live',
  eventScoped: true,
  orderBy: [{ column: 'desk', ascending: true }, { column: 'createdAt', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as DutyStaffId),
    eventId,
    legacyId: z.string().nullable(),
    name: z.string(),
    userId: z.string().nullable().transform((v) => v as UserId | null),
    department: z.string().transform((v) => v as DepartmentName),
    desk: z.number().int().min(1).max(4).transform((v) => v as DutyDesk),
    roleLabel: z.string(),
    checkedInAt: instant.nullable(),
  }),
});

export type IncidentRow = Incident & BaseRow & { legacyId: string | null };
export const incidentsTable = defineTable<IncidentRow>({
  name: 'sce_tcsk_incidents',
  owner: 'live',
  eventScoped: true,
  orderBy: [{ column: 'seq', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as IncidentId),
    eventId,
    legacyId: z.string().nullable(),
    seq: z.number().int(),
    location: z.string(),
    description: z.string(),
    urgency: z.enum(URGENCY_VALUES),
    assignee: z.string(),
    status: z.enum(INCIDENT_STATUS_VALUES),
    reportedAt: instant,
    resolvedAt: instant.nullable(),
    resolutionNote: z.string(),
  }),
});
