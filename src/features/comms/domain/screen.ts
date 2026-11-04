// What the comms screens receive from the server. Plain data, safe to pass to client components.

import type { CampaignId, Email, EventId, GuestId, HHmm, Instant, IsoDate, MailboxId, RsvpResponseId, SafeUrl, SeatCode, Version } from '@/core/brand';
import type { OrgIdentity } from '@/core/settings';
import type { GuestGroup, RsvpStatus } from '@/core/vocab';
import type { SenderMailbox } from '../contract';
import type { ColumnMap } from './columns';

export interface ScreenEvent {
  id: EventId;
  name: string;
  eventDate: IsoDate;
  eventTime: HHmm | null;
  location: string;
  targetGuests: number;
}

/** A guest as the recipient list shows it: the roster's seat and check-in code, and the last delivery result. */
export interface GuestRecipient {
  id: GuestId;
  name: string;
  title: string;
  organization: string;
  group: GuestGroup;
  email: Email | null;
  rsvpStatus: RsvpStatus;
  seatCode: SeatCode | null;
  checkinCode: string;
  lastDelivery: 'sent' | 'error' | 'unknown' | null;
}

export interface InvitationScreenData {
  event: ScreenEvent;
  guests: ReadonlyArray<GuestRecipient>;
  mailboxes: ReadonlyArray<SenderMailbox>;
  /** SystemSettings.googleClientId, the fallback of every mailbox without its own. */
  googleClientId: string | null;
  formUrl: SafeUrl | null;
  officer: { name: string; email: Email };
  org: OrgIdentity;
  canSend: boolean;
  /**
   * Recipients of an earlier campaign that failed, from the delivery log's "Gửi lại thư lỗi", and that campaign's
   * message. `message` is null for a campaign that kept none (rows imported from the old app).
   */
  retry: {
    campaignId: CampaignId;
    guestIds: ReadonlyArray<GuestId>;
    manual: ReadonlyArray<{ email: Email; name: string }>;
    message: { subject: string; body: string; attachQr: boolean } | null;
  } | null;
  /** SCE_DEV_MEMORY only: the fake transport replaces Google sign-in. */
  devTransport: boolean;
}

export interface DeliveryLogRow {
  id: string;
  campaignId: CampaignId;
  guestId: GuestId | null;
  recipientName: string;
  email: Email;
  subject: string;
  senderEmail: string;
  status: 'sent' | 'error' | 'unknown' | 'queued' | 'sending';
  sentAt: Instant | null;
  updatedAt: Instant;
  error: string | null;
  imported: boolean;
}
export interface DeliveryLogData {
  event: ScreenEvent;
  rows: ReadonlyArray<DeliveryLogRow>;
  /** Every campaign of the rows, newest first, named by its subject template. */
  campaigns: ReadonlyArray<{ id: CampaignId; label: string }>;
  canSend: boolean;
}

export interface FormView {
  formUrl: SafeUrl | null;
  sheetCsvUrl: SafeUrl | null;
  autoSync: boolean;
  autoAddNewGuests: boolean;
  /** The saved map, or null when the columns are detected from the headers. */
  columnMap: ColumnMap | null;
  /** What detection reads from the last headers, shown when nothing is saved. */
  detectedMap: ColumnMap;
  sheetHeaders: ReadonlyArray<string>;
  lastSyncAt: Instant | null;
  lastAttemptAt: Instant | null;
  lastSyncError: string | null;
  version: Version;
}
export interface ResponseView {
  id: RsvpResponseId;
  version: Version;
  respondedAt: Instant;
  name: string;
  organization: string;
  title: string;
  email: Email | null;
  phone: string;
  /** The RSVP cell as typed: public input, rendered as text. */
  rsvpAnswer: string;
  rsvp: RsvpStatus | null;
  hasBanquet: boolean | null;
  substitute: string;
  notes: string;
  match: 'email' | 'phone' | 'name' | 'created' | 'manual' | 'ambiguous' | 'none';
  matchedGuest: { id: GuestId; name: string } | null;
  candidates: ReadonlyArray<{ id: GuestId; name: string; organization: string }>;
  applyStatus: 'pending' | 'applied' | 'stale' | 'no_answer' | 'review' | 'no_time' | 'dismissed';
}
export interface FormScreenData {
  event: ScreenEvent;
  form: FormView | null;
  responses: ReadonlyArray<ResponseView>;
  /** For placing a response by hand. */
  guests: ReadonlyArray<{ id: GuestId; name: string; organization: string; email: Email | null; phone: string }>;
  canManage: boolean;
  /** A scheduled server sync can run (a system identity and CRON_SECRET); until then auto sync is labelled as not working. */
  serverSync: boolean;
}

export interface MailboxesScreenData {
  mailboxes: ReadonlyArray<SenderMailbox & { id: MailboxId }>;
  googleClientId: string | null;
}

/** A response no rule could place, waiting for a person: no guest, no readable time, or an answer a person must read. */
export const needsReview = (r: Pick<ResponseView, 'applyStatus' | 'match'>) =>
  r.applyStatus === 'no_time' || r.applyStatus === 'review' || (r.applyStatus === 'pending' && (r.match === 'none' || r.match === 'ambiguous'));
