// Contract of feature `comms` (M4c): unit sender mailboxes, bulk Gmail dispatch,
// Google Form RSVP sync. Delivery results and form responses are comms-owned
// facts; the guest row changes only through guests.applyRsvp / guests.markInvited.

import type { CampaignId, Email, EventId, GuestId, Instant, MailboxId, RsvpResponseId, SafeUrl, Version } from '@/core/brand';
import type { SystemSettings } from '@/core/settings';
import type { RsvpStatus } from '@/core/vocab';

export interface SenderMailbox {
  id: MailboxId;
  displayName: string;
  email: Email;
  /** Overrides SystemSettings.googleClientId when set. */
  clientId: string | null;
  /** Exactly one row true (partial unique index). */
  isDefault: boolean;
  version: Version;
}
/** The one client-id resolution (m4c B57): mailbox override, else settings. null => sending disabled. */
export function resolveGoogleClientId(mailbox: SenderMailbox | null, s: SystemSettings): string | null {
  throw new Error('not implemented');
}

export interface RsvpForm {
  eventId: EventId;
  formUrl: SafeUrl | null;
  /** Keeps gid (m4a B20). */
  sheetCsvUrl: SafeUrl | null;
  autoSync: boolean;
  autoAddNewGuests: boolean;
  columnMap: Readonly<Record<string, number>> | null;
  lastSyncAt: Instant | null;
  version: Version;
}
export interface RsvpResponse {
  id: RsvpResponseId;
  eventId: EventId;
  /** sha256 of the normalized row; unique per event, so re-sync is idempotent. */
  rowHash: string;
  respondedAt: Instant;
  name: string;
  organization: string;
  email: Email | null;
  phone: string;
  rsvp: RsvpStatus | null;
  hasBanquet: boolean | null;
  substitute: string;
  matchedGuestId: GuestId | null;
  match: 'email' | 'phone' | 'name' | 'created' | 'ambiguous' | 'none';
  appliedAt: Instant | null;
}

export type DeliveryStatus = 'queued' | 'sent' | 'error';
export interface EmailDelivery {
  campaignId: CampaignId;
  eventId: EventId;
  guestId: GuestId | null;
  email: Email;
  status: DeliveryStatus;
  sentAt: Instant | null;
  error: string | null;
}

declare module '@/core/permissions' {
  interface PermissionMap {
    'comms.read': true;
    'comms.send': true;
    'comms.rsvp.manage': true;
    'comms.mailboxes.read': true;
    'comms.mailboxes.admin': true;
  }
}
