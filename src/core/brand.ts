// Branded primitives. Every id and every date-like string is parsed once at a
// boundary (row parse, form parse, URL param parse) and trusted afterwards.

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Uuid<E extends string> = Brand<string, `Uuid:${E}`>;

export type UserId = Uuid<'User'>;
export type EventId = Uuid<'Event'>;
export type GroupId = Uuid<'TaskGroup'>;
export type StepId = Uuid<'Step'>;
export type GuestId = Uuid<'Guest'>;
export type HallTemplateId = Uuid<'HallTemplate'>;
export type BoothId = Uuid<'Booth'>;
export type BoothShiftId = Uuid<'BoothShift'>;
export type DutyStaffId = Uuid<'DutyStaff'>;
export type IncidentId = Uuid<'Incident'>;
export type ContactId = Uuid<'MasterContact'>;
export type MailboxId = Uuid<'Mailbox'>;
export type RsvpResponseId = Uuid<'RsvpResponse'>;
export type CampaignId = Uuid<'EmailCampaign'>;
export type ClippingId = Uuid<'MediaClipping'>;
export type BiddingPackageId = Uuid<'BiddingPackage'>;
export type DailyReportId = Uuid<'DailyReport'>;
export type PressReleaseId = Uuid<'PressRelease'>;
export type BackupId = Brand<number, 'BackupId'>;

/** Built-in template ids are stable strings ('form_kh_ubnd'); custom ones are uuids. */
export type TemplateId = Brand<string, 'TemplateId'>;

/** Calendar date with no time zone, 'YYYY-MM-DD'. Interpreted in Asia/Ho_Chi_Minh. */
export type IsoDate = Brand<string, 'IsoDate'>;
/** Absolute instant, ISO 8601 UTC ('2026-11-04T01:30:00.000Z'). */
export type Instant = Brand<string, 'Instant'>;
/** Wall-clock time 'HH:mm' in Asia/Ho_Chi_Minh. */
export type HHmm = Brand<string, 'HHmm'>;
/** Integer Vietnamese dong. Parsed with parseVnd, never with "strip non-digits". */
export type Vnd = Brand<number, 'Vnd'>;
/** Lowercased, trimmed, RFC 5322-lite validated address. */
export type Email = Brand<string, 'Email'>;
/** http(s) URL only. `javascript:` and friends never parse. */
export type SafeUrl = Brand<string, 'SafeUrl'>;
/** `${zone.prefix}${pad2(n)}`, e.g. 'A-04'. Valid only relative to one EventHall. */
export type SeatCode = Brand<string, 'SeatCode'>;
/** HTML that went through sanitizeRichHtml. The only HTML type a component may render raw. */
export type SanitizedHtml = Brand<string, 'SanitizedHtml'>;
/** Optimistic-concurrency token. Incremented by a DB trigger on every update. */
export type Version = Brand<number, 'Version'>;

export function newId<E extends string>(): Uuid<E> {
  throw new Error('not implemented');
}

export function parseUuid<E extends string>(raw: unknown): Uuid<E> | null {
  throw new Error('not implemented');
}
