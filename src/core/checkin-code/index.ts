// One check-in code format. Badges (guests), emailed QR cards (comms) and the
// scanner (live) all go through this file (m4a B13/B36, m4c B14, m5 BUG-06/07).
//
// Generated payload, always:   SCE-CHK:<eventId uuid>:<guestId uuid>
// Printed human code, always:  the guest's checkinCode, 6 chars Crockford base32,
//                              DB default tcsk.random_code(6), unique per event.
// Accepted when scanning (boundary only, never generated):
//   - SCE-CHK:<legacy event id>:<legacy guest id>     (badges printed before cutover)
//   - SCE-CHECKIN:<legacy guest id>:<name>:<legacy event id>  (legacy emailed PNG)
//   - a bare checkinCode
//   - an exact normalized phone number

import { parseUuid, type EventId, type GuestId } from '@/core/brand';
import { normalizePhone } from '@/core/text';

export type CheckinCode = string & { readonly __checkinCode: true };

export type ScannedCode =
  | { kind: 'canonical'; eventId: EventId; guestId: GuestId }
  | { kind: 'legacy'; legacyEventId: string; legacyGuestId: string }
  | { kind: 'human'; code: CheckinCode }
  | { kind: 'phone'; digits: string }
  | { kind: 'invalid'; raw: string };

const PREFIX = 'SCE-CHK:';
const LEGACY_EMAIL_PREFIX = 'SCE-CHECKIN:';
const HUMAN_CODE = /^[0-9A-HJKMNP-TV-Z]{6}$/;

export function encodeCheckinPayload(eventId: EventId, guestId: GuestId): string {
  return `${PREFIX}${eventId}:${guestId}`;
}

/** Key of the legacy-id map matchScan reads; legacy guest ids repeat across events, so the event is part of it (m5 BUG-07). */
export function legacyScanKey(legacyEventId: string, legacyGuestId: string): string {
  return `${legacyEventId}:${legacyGuestId}`;
}

/** Crockford decoding: case-insensitive, O reads as 0, I and L read as 1, separators ignored. */
export function parseCheckinCode(raw: string): CheckinCode | null {
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return HUMAN_CODE.test(code) ? (code as CheckinCode) : null;
}

export function parseScannedCode(raw: string): ScannedCode {
  const s = raw.trim();
  const upper = s.toUpperCase();
  if (upper.startsWith(PREFIX)) {
    const parts = s.slice(PREFIX.length).split(':');
    const [ev, guest] = parts;
    if (parts.length !== 2 || !ev || !guest) return { kind: 'invalid', raw };
    const eventId = parseUuid<'Event'>(ev);
    const guestId = parseUuid<'Guest'>(guest);
    return eventId && guestId ? { kind: 'canonical', eventId, guestId } : { kind: 'legacy', legacyEventId: ev, legacyGuestId: guest };
  }
  if (upper.startsWith(LEGACY_EMAIL_PREFIX)) {
    const parts = s.slice(LEGACY_EMAIL_PREFIX.length).split(':');
    const guest = parts[0];
    const ev = parts[parts.length - 1];
    if (parts.length < 3 || !guest || !ev) return { kind: 'invalid', raw };
    return { kind: 'legacy', legacyEventId: ev, legacyGuestId: guest };
  }
  const code = parseCheckinCode(s);
  if (code) return { kind: 'human', code };
  if (/^[\d\s.+()-]+$/.test(s)) {
    const digits = normalizePhone(s);
    if (digits.length >= 9 && digits.length <= 11) return { kind: 'phone', digits };
  }
  return { kind: 'invalid', raw };
}
