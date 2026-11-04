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

import type { EventId, GuestId } from './brand';

export type CheckinCode = string & { readonly __checkinCode: true };

export type ScannedCode =
  | { kind: 'canonical'; eventId: EventId; guestId: GuestId }
  | { kind: 'legacy'; legacyEventId: string; legacyGuestId: string }
  | { kind: 'human'; code: CheckinCode }
  | { kind: 'phone'; digits: string }
  | { kind: 'invalid'; raw: string };

export function encodeCheckinPayload(eventId: EventId, guestId: GuestId): string {
  throw new Error('not implemented');
}
export function parseScannedCode(raw: string): ScannedCode {
  throw new Error('not implemented');
}
