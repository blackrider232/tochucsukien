// The four tables comms owns (0002_domain_tables.sql and
// 202611041200_comms_delivery_evidence_and_sync_state.sql).

import { z } from 'zod';
import type { CampaignId, Email, EventId, GuestId, Instant, MailboxId, RsvpResponseId, SafeUrl, UserId, Version } from '@/core/brand';
import { parseInstant } from '@/core/dates';
import { defineTable, type BaseRow } from '@/core/db';
import type { RsvpStatus } from '@/core/vocab';

const instant = z.string().transform((v) => (parseInstant(v) ?? v) as Instant);
const managed = {
  version: z.number().transform((v) => v as Version),
  createdAt: instant,
  createdBy: z.string().nullable().transform((v) => v as UserId | null),
  updatedAt: instant,
  updatedBy: z.string().nullable().transform((v) => v as UserId | null),
};
const eventId = z.string().transform((v) => v as EventId);
const email = z.string().transform((v) => v as Email);
const guestId = z.string().transform((v) => v as GuestId);

export interface MailboxRow extends BaseRow {
  id: MailboxId;
  legacyId: string | null;
  displayName: string;
  email: Email;
  clientId: string | null;
  isDefault: boolean;
}
export const mailboxesTable = defineTable<MailboxRow>({
  name: 'sce_tcsk_sender_mailboxes',
  owner: 'comms',
  eventScoped: false,
  orderBy: [{ column: 'createdAt', ascending: true }, { column: 'email', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as MailboxId),
    legacyId: z.string().nullable(),
    displayName: z.string(),
    email,
    clientId: z.string().nullable(),
    isDefault: z.boolean(),
  }),
});

export interface FormRow extends BaseRow {
  id: string;
  eventId: EventId;
  formUrl: SafeUrl | null;
  sheetCsvUrl: SafeUrl | null;
  autoSync: boolean;
  autoAddNewGuests: boolean;
  /** Parsed with parseColumnMap where it is read; null means detect from the headers. */
  columnMap: unknown;
  lastSyncAt: Instant | null;
  lastAttemptAt: Instant | null;
  lastSyncError: string | null;
  sheetHeaders: string[];
}
export const formsTable = defineTable<FormRow>({
  name: 'sce_tcsk_rsvp_forms',
  owner: 'comms',
  eventScoped: true,
  row: z.object({
    ...managed,
    id: z.string(),
    eventId,
    formUrl: z.string().nullable().transform((v) => v as SafeUrl | null),
    sheetCsvUrl: z.string().nullable().transform((v) => v as SafeUrl | null),
    autoSync: z.boolean(),
    autoAddNewGuests: z.boolean(),
    columnMap: z.unknown(),
    lastSyncAt: instant.nullable(),
    lastAttemptAt: instant.nullable(),
    lastSyncError: z.string().nullable(),
    sheetHeaders: z.array(z.string()),
  }),
});

export const MATCH_KINDS = ['email', 'phone', 'name', 'created', 'manual', 'ambiguous', 'none'] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];
/**
 * pending: not applied yet (unmatched, ambiguous, or matched and waiting). applied: guests.applyRsvp took it, or it
 * created the guest. stale: older than the guest's last RSVP change. no_answer: no definite RSVP in the row.
 * no_time: the timestamp could not be read, so it is never applied on its own. dismissed: staff set it aside.
 */
export const APPLY_STATUSES = ['pending', 'applied', 'stale', 'no_answer', 'no_time', 'dismissed'] as const;
export type ApplyStatus = (typeof APPLY_STATUSES)[number];

export interface ResponseRow extends BaseRow {
  id: RsvpResponseId;
  eventId: EventId;
  rowHash: string;
  /** For no_time rows, the moment the row was first stored. */
  respondedAt: Instant;
  name: string;
  organization: string;
  title: string;
  email: Email | null;
  phone: string;
  rsvp: RsvpStatus | null;
  hasBanquet: boolean | null;
  substitute: string;
  notes: string;
  raw: Readonly<Record<string, string>>;
  matchedGuestId: GuestId | null;
  match: MatchKind;
  candidateGuestIds: GuestId[];
  applyStatus: ApplyStatus;
  appliedAt: Instant | null;
}
export const responsesTable = defineTable<ResponseRow>({
  name: 'sce_tcsk_rsvp_responses',
  owner: 'comms',
  eventScoped: true,
  orderBy: [{ column: 'respondedAt', ascending: true }, { column: 'rowHash', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string().transform((v) => v as RsvpResponseId),
    eventId,
    rowHash: z.string(),
    respondedAt: instant,
    name: z.string(),
    organization: z.string(),
    title: z.string(),
    email: email.nullable(),
    phone: z.string(),
    rsvp: z.enum(['pending', 'confirmed', 'substituted', 'declined']).nullable(),
    hasBanquet: z.boolean().nullable(),
    substitute: z.string(),
    notes: z.string(),
    raw: z.record(z.string(), z.string()),
    matchedGuestId: guestId.nullable(),
    match: z.enum(MATCH_KINDS),
    candidateGuestIds: z.array(guestId),
    applyStatus: z.enum(APPLY_STATUSES),
    appliedAt: instant.nullable(),
  }),
});

export type DeliveryStatus = 'sent' | 'error';
export interface DeliveryRow extends BaseRow {
  id: string;
  eventId: EventId;
  campaignId: CampaignId;
  guestId: GuestId | null;
  email: Email;
  recipientName: string;
  subject: string;
  senderEmail: string;
  /** 'queued' exists in the schema and is never written: a row is written only once Gmail has answered. */
  status: DeliveryStatus | 'queued';
  sentAt: Instant | null;
  error: string | null;
  providerMessageId: string | null;
  imported: boolean;
}
export const deliveriesTable = defineTable<DeliveryRow>({
  name: 'sce_tcsk_email_deliveries',
  owner: 'comms',
  eventScoped: true,
  orderBy: [{ column: 'updatedAt', ascending: false }, { column: 'email', ascending: true }],
  row: z.object({
    ...managed,
    id: z.string(),
    eventId,
    campaignId: z.string().transform((v) => v as CampaignId),
    guestId: guestId.nullable(),
    email,
    recipientName: z.string(),
    subject: z.string(),
    senderEmail: z.string(),
    status: z.enum(['queued', 'sent', 'error']),
    sentAt: instant.nullable(),
    error: z.string().nullable(),
    providerMessageId: z.string().nullable(),
    imported: z.boolean(),
  }),
});
